import { DOM } from './dom.js';
import { state } from './state.js';
import { log, updateStatusUI } from './logger.js';

// Settings Management
export async function loadSettings() {
  try {
    const saved = await window.skinforge.readSettings();
    if (saved && Object.keys(saved).length > 0) {
      state.settings = { ...state.settings, ...saved };
    }
  } catch (e) {
    console.error('Failed reading settings:', e);
  }

  DOM.settingsModFolder.value = state.settings.modFolder || 'skinforge';
  DOM.settingAutoDetect.checked = state.settings.autoDetect !== false;
  DOM.settingLaunchAfter.checked = !!state.settings.launchAfter;
  DOM.settingConfirmRestore.checked = state.settings.confirmRestore !== false;
}

export async function saveSettings() {
  state.settings.modFolder = DOM.settingsModFolder.value.trim() || 'skinforge';
  state.settings.autoDetect = DOM.settingAutoDetect.checked;
  state.settings.launchAfter = DOM.settingLaunchAfter.checked;
  state.settings.confirmRestore = DOM.settingConfirmRestore.checked;

  try {
    await window.skinforge.writeSettings(state.settings);
    DOM.settingsSavedMsg.classList.remove('hidden');
    setTimeout(() => DOM.settingsSavedMsg.classList.add('hidden'), 2500);
    log('Settings updated successfully.', 'success');
  } catch (e) {
    log(`Failed to save settings: ${e.message}`, 'error');
  }
}

// Mod Install & Restore Actions
export async function handleApplyMods() {
  if (state.isBusy) return;

  if (state.status && state.status.dotaRunning) {
    alert('Dota 2 is currently running. Please close Dota 2 before applying mods.');
    return;
  }

  const equipped = state.heroSlots || {};
  const totalSelected = Object.values(equipped).reduce((acc, slots) => acc + Object.keys(slots || {}).length, 0);
  if (totalSelected === 0) {
    log('No custom cosmetics are currently equipped! Please select items for your hero or click "Unlock Best Set" before applying.', 'warn');
    alert('No custom cosmetics are currently equipped!\n\nPlease customize slots on your hero in the equipment grid or click "Unlock Best Set" before clicking Apply.');
    return;
  }

  state.isBusy = true;
  DOM.btnApplyAll.disabled = true;
  DOM.btnRestore.disabled = true;
  DOM.progressBar.classList.remove('hidden');
  DOM.progressFill.style.width = '10%';
  DOM.progressPct.textContent = '10%';
  DOM.progressMsg.textContent = 'Preparing custom items and VPK package...';

  log(`Compiling ${totalSelected} equipped cosmetic slot(s) into Dota 2 items schema...`, 'info');

  try {
    const res = await window.skinforge.installMods(state.dotaPath, equipped);
    if (res && res.success) {
      const count = res.patchedCount || 0;
      if (count === 0) {
        log('Notice: 0 items were matched with the items schema. Please select valid cosmetics.', 'warn');
        DOM.progressFill.style.width = '100%';
        DOM.progressPct.textContent = '100%';
        DOM.progressMsg.textContent = 'Notice: 0 items applied';
      } else {
        log(`Successfully compiled and injected ${count} cosmetic loadout(s) into Dota 2!`, 'success');
        DOM.progressFill.style.width = '100%';
        DOM.progressPct.textContent = '100%';
        DOM.progressMsg.textContent = `Success (${count} items applied)!`;
      }

      const status = await window.skinforge.checkStatus(state.dotaPath);
      updateStatusUI(status);

      if (state.settings.launchAfter) {
        log('Launching Dota 2...', 'info');
        window.skinforge.openExternal('steam://run/570');
      }
    }
  } catch (err) {
    log(`Installation error: ${err.message}`, 'error');
    alert(`Failed to apply mods: ${err.message}`);
  } finally {
    state.isBusy = false;
    DOM.btnApplyAll.disabled = false;
    DOM.btnRestore.disabled = false;
    setTimeout(() => DOM.progressBar.classList.add('hidden'), 2000);
  }
}

export async function handleRestoreMods() {
  if (state.isBusy) return;

  if (state.settings.confirmRestore) {
    if (!confirm('Restore clean game files? This will deactivate all modded cosmetics.')) {
      return;
    }
  }

  state.isBusy = true;
  DOM.btnApplyAll.disabled = true;
  DOM.btnRestore.disabled = true;
  DOM.progressBar.classList.remove('hidden');
  DOM.progressFill.style.width = '20%';
  DOM.progressPct.textContent = '20%';
  DOM.progressMsg.textContent = 'Restoring original game configuration...';

  log('Restoring vanilla Dota 2 game files...', 'info');

  try {
    const res = await window.skinforge.uninstallMods(state.dotaPath);
    if (res && res.success) {
      log('Vanilla restoration complete! Game is now unmodded.', 'success');
      DOM.progressFill.style.width = '100%';
      DOM.progressPct.textContent = '100%';
      DOM.progressMsg.textContent = 'Restored';

      const status = await window.skinforge.checkStatus(state.dotaPath);
      updateStatusUI(status);
    }
  } catch (err) {
    log(`Restore error: ${err.message}`, 'error');
    alert(`Failed to restore: ${err.message}`);
  } finally {
    state.isBusy = false;
    DOM.btnApplyAll.disabled = false;
    DOM.btnRestore.disabled = false;
    setTimeout(() => DOM.progressBar.classList.add('hidden'), 2000);
  }
}
