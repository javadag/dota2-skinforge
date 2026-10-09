// ============================================================================
// Dota 2 SkinForge — Client Renderer Controller (Master Orchestrator)
// ============================================================================

import { DOM } from './modules/dom.js';
import { state, loadPresets, loadHeroSlots, savePresets } from './modules/state.js';
import { log, updateStatusUI } from './modules/logger.js';
import { renderHeroList } from './modules/heroList.js';
import { renderHeroSlots, renderSlotItemsList, closeSlotModal, unlockBestSet, resetHeroSlots } from './modules/slotEditor.js';
import { openPresetNameModal, saveCurrentAsPreset } from './modules/presets.js';
import { updateLaunchString } from './modules/launchTweaks.js';
import { loadSettings, saveSettings, handleApplyMods, handleRestoreMods } from './modules/settings.js';
import { setupNavigation, updateTopbarForCategory } from './modules/navigation.js';

// ── Progress IPC Listener ─────────────────────────────────────────────────────
if (window.skinforge && window.skinforge.onInstallProgress) {
  window.skinforge.onInstallProgress((data) => {
    if (data && data.total) {
      const pct = Math.round((data.step / data.total) * 100);
      DOM.progressFill.style.width = `${pct}%`;
      DOM.progressPct.textContent = `${pct}%`;
      DOM.progressMsg.textContent = data.message || 'Processing...';
      log(`[${data.step}/${data.total}] ${data.message}`, 'info');
    }
  });
}

// ── Setup Application Event Listeners ─────────────────────────────────────────
function setupEventListeners() {
  setupNavigation();

  // Hero Search & Filters
  DOM.heroSearch.addEventListener('input', (e) => {
    state.searchQuery = e.target.value;
    renderHeroList();
  });

  // Hero Attribute Filter Buttons
  DOM.heroFilters.forEach(btn => {
    btn.addEventListener('click', () => {
      DOM.heroFilters.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.attrFilter = btn.dataset.attr;
      renderHeroList();
    });
  });

  // Equipment Slot Actions
  DOM.btnUnlockAllSlots.addEventListener('click', () => {
    if (state.selectedHero) unlockBestSet(state.selectedHero);
  });

  DOM.btnResetSlots.addEventListener('click', () => {
    if (state.selectedHero) resetHeroSlots(state.selectedHero);
  });

  DOM.btnSaveAsPreset.addEventListener('click', openPresetNameModal);
  DOM.btnNewPreset.addEventListener('click', openPresetNameModal);

  // Modal Closures
  DOM.slotModalClose.addEventListener('click', closeSlotModal);
  DOM.slotModalSearch.addEventListener('input', renderSlotItemsList);

  DOM.presetNameClose.addEventListener('click', () => DOM.presetNameModal.classList.add('hidden'));
  DOM.btnPresetNameCancel.addEventListener('click', () => DOM.presetNameModal.classList.add('hidden'));
  DOM.btnPresetNameSave.addEventListener('click', saveCurrentAsPreset);

  // Top Bar Actions
  DOM.btnApplyAll.addEventListener('click', handleApplyMods);
  DOM.btnRestore.addEventListener('click', handleRestoreMods);
  DOM.btnRefreshTop.addEventListener('click', async () => {
    log('Refreshing status...', 'info');
    const status = await window.skinforge.checkStatus(state.dotaPath);
    updateStatusUI(status);
  });

  // Patch Alert
  DOM.btnReapply.addEventListener('click', handleApplyMods);
  DOM.btnDismissAlert.addEventListener('click', () => DOM.patchAlert.classList.add('hidden'));

  // Steam Launch Tweaks
  [DOM.twNovid, DOM.twMap, DOM.twHigh, DOM.twConsole, DOM.twNojoy, DOM.twDx11].forEach(cb => {
    if (cb) cb.addEventListener('change', updateLaunchString);
  });

  DOM.btnCopyLaunch.addEventListener('click', () => {
    navigator.clipboard.writeText(DOM.launchOutput.textContent);
    DOM.btnCopyLaunch.textContent = '✅ Copied!';
    setTimeout(() => DOM.btnCopyLaunch.textContent = '📋 Copy', 2000);
  });

  // Settings
  DOM.btnChangePathSettings.addEventListener('click', async () => {
    const res = await window.skinforge.selectDirectory();
    if (res && res.path) {
      state.dotaPath = res.path;
      const status = await window.skinforge.checkStatus(res.path);
      updateStatusUI(status);
      log(`Game directory updated: ${res.path}`, 'info');
    }
  });

  DOM.btnClearPresets.addEventListener('click', () => {
    if (confirm('Clear all saved presets? This cannot be undone.')) {
      state.presets = [];
      savePresets();
      log('All presets cleared.', 'warn');
    }
  });

  DOM.btnResetSettings.addEventListener('click', () => {
    if (confirm('Reset all settings to default values?')) {
      state.settings = {
        dotaPath: state.dotaPath,
        modFolder: 'skinforge',
        autoDetect: true,
        launchAfter: false,
        confirmRestore: true
      };
      saveSettings();
      loadSettings();
      log('Settings reset to default.', 'info');
    }
  });

  DOM.btnSaveSettings.addEventListener('click', saveSettings);

  // Console Drawer Toggle
  DOM.consoleToggle.addEventListener('click', () => {
    DOM.consoleFooter.classList.toggle('open');
  });
}

// ── Single Source of Truth Dynamic Binding ──────────────────────────────────
function applyAppInfo() {
  const info = window.appInfo || {
    name: 'Dota 2 SkinForge',
    shortName: 'SkinForge',
    version: '1.0.0',
    displayVersion: 'v1.0',
    tagline: 'Cosmetic Suite'
  };

  document.title = `${info.name} — ${info.tagline}`;

  document.querySelectorAll('[data-app-name]').forEach(el => {
    el.textContent = info.name;
  });

  document.querySelectorAll('[data-app-short-name]').forEach(el => {
    el.textContent = info.shortName;
  });

  document.querySelectorAll('[data-app-tagline]').forEach(el => {
    el.textContent = `${info.displayVersion} · ${info.tagline}`;
  });

  document.querySelectorAll('[data-app-version-sub]').forEach(el => {
    el.textContent = `${info.displayVersion} — Local Cosmetic Suite`;
  });
}

// ── Initialization Entry Point ────────────────────────────────────────────────
async function init() {
  applyAppInfo();
  const info = window.appInfo || { name: 'Dota 2 SkinForge', displayVersion: 'v1.0' };
  log(`Starting ${info.name} ${info.displayVersion}...`, 'info');

  setupEventListeners();
  loadPresets();
  loadHeroSlots();
  updateLaunchString();

  try {
    if (!window.skinforge || typeof window.skinforge.getInitialData !== 'function') {
      throw new Error('IPC bridge window.skinforge is not available.');
    }
    const initial = await window.skinforge.getInitialData();
    state.dotaPath = initial.dotaPath || '';
    state.heroes = initial.heroes || [];

    await loadSettings();
    updateStatusUI(initial.status);
    renderHeroList();
    console.log(`[SkinForge] Initialized successfully. Heroes: ${state.heroes.length}, DotaPath: ${state.dotaPath || 'not set'}`);

    log(`Loaded ${state.heroes.length} heroes from local database.`, 'success');
    if (state.dotaPath) {
      log(`Dota 2 installation identified: ${state.dotaPath}`, 'info');
    } else {
      log('Dota 2 directory not automatically found. Please set it in Settings.', 'warn');
    }
  } catch (err) {
    log(`Initialization error: ${err.message}`, 'error');
  }
}

// Launch on DOM ready
document.addEventListener('DOMContentLoaded', init);
