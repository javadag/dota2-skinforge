/**
 * Dota 2 SkinForge — Master Client Renderer Orchestrator
 */

import { renderHeroList } from './components/heroList'
import { updateLaunchString } from './components/launchView'
import { setupNavigation } from './components/navigation'
import { openPresetNameModal, saveCurrentAsPreset } from './components/presetsView'
import { handleApplyMods, handleRestoreMods, loadSettings, saveSettings } from './components/settingsView'
import { closeSlotModal, renderSlotItemsList, resetHeroSlots, unlockBestSet } from './components/slotEditor'
import { initCatalog } from './components/slotGenerator'
import type { InstallProgress } from './env'
import './index.css'
import { AttributeFilter, loadHeroSlots, loadPresets, savePresets, state } from './state/store'
import { DOM } from './utils/dom'
import { log, updateStatusUI } from './utils/logger'

// ── Progress IPC Listener ─────────────────────────────────────────────────────
if (window.skinforge && typeof window.skinforge.onInstallProgress === 'function') {
  window.skinforge.onInstallProgress((data: InstallProgress) => {
    if (data && data.total) {
      const pct = Math.round((data.step / data.total) * 100)
      if (DOM.progressFill) DOM.progressFill.style.width = `${pct}%`
      if (DOM.progressPct) DOM.progressPct.textContent = `${pct}%`
      if (DOM.progressMsg) DOM.progressMsg.textContent = data.message || 'Processing...'
      log(`[${data.step}/${data.total}] ${data.message}`, 'info')
    }
  })
}

// ── Setup Application Event Listeners ─────────────────────────────────────────
function setupEventListeners(): void {
  setupNavigation()

  // Hero Search & Filters
  DOM.heroSearch?.addEventListener('input', (e: Event) => {
    const target = e.target as HTMLInputElement | null
    state.searchQuery = target ? target.value : ''
    renderHeroList()
  })

  // Hero Attribute Filter Buttons
  function isAttributeFilter(val: string): val is AttributeFilter {
    return ['all', 'str', 'agi', 'int', 'uni'].includes(val)
  }

  DOM.heroFilters.forEach((btn) => {
    btn.addEventListener('click', () => {
      DOM.heroFilters.forEach((b) => b.classList.remove('active'))
      btn.classList.add('active')
      const rawAttr = btn.dataset.attr || 'all'
      state.attrFilter = isAttributeFilter(rawAttr) ? rawAttr : 'all'
      renderHeroList()
    })
  })

  // Equipment Slot Actions
  DOM.btnUnlockAllSlots?.addEventListener('click', () => {
    if (state.selectedHero) unlockBestSet(state.selectedHero)
  })

  DOM.btnResetSlots?.addEventListener('click', () => {
    if (state.selectedHero) resetHeroSlots(state.selectedHero)
  })

  DOM.btnSaveAsPreset?.addEventListener('click', openPresetNameModal)
  DOM.btnNewPreset?.addEventListener('click', openPresetNameModal)

  // Modal Closures
  DOM.slotModalClose?.addEventListener('click', closeSlotModal)
  DOM.slotModalSearch?.addEventListener('input', renderSlotItemsList)

  DOM.presetNameClose?.addEventListener('click', () => DOM.presetNameModal?.classList.add('hidden'))
  DOM.btnPresetNameCancel?.addEventListener('click', () => DOM.presetNameModal?.classList.add('hidden'))
  DOM.btnPresetNameSave?.addEventListener('click', saveCurrentAsPreset)

  // Top Bar Actions
  DOM.btnApplyAll?.addEventListener('click', handleApplyMods)
  DOM.btnRestore?.addEventListener('click', handleRestoreMods)
  DOM.btnRefreshTop?.addEventListener('click', async () => {
    log('Refreshing status...', 'info')
    const status = await window.skinforge.checkStatus(state.dotaPath)
    updateStatusUI(status)
  })

  // Patch Alert
  DOM.btnReapply?.addEventListener('click', handleApplyMods)
  DOM.btnDismissAlert?.addEventListener('click', () => DOM.patchAlert?.classList.add('hidden'))

  // Steam Launch Tweaks
  ;[DOM.twNovid, DOM.twMap, DOM.twHigh, DOM.twConsole, DOM.twNojoy, DOM.twDx11].forEach((cb) => {
    if (cb) cb.addEventListener('change', updateLaunchString)
  })

  DOM.btnCopyLaunch?.addEventListener('click', () => {
    const textToCopy = DOM.launchOutput ? DOM.launchOutput.textContent || '' : ''
    navigator.clipboard.writeText(textToCopy)
    if (DOM.btnCopyLaunch) DOM.btnCopyLaunch.textContent = '✅ Copied!'
    setTimeout(() => {
      if (DOM.btnCopyLaunch) DOM.btnCopyLaunch.textContent = '📋 Copy'
    }, 2000)
  })

  // Settings
  DOM.btnChangePathSettings?.addEventListener('click', async () => {
    const res = await window.skinforge.selectDirectory()
    if (res && res.path) {
      state.dotaPath = res.path
      const status = await window.skinforge.checkStatus(res.path)
      updateStatusUI(status)
      log(`Game directory updated: ${res.path}`, 'info')
    }
  })

  DOM.btnClearPresets?.addEventListener('click', () => {
    if (confirm('Clear all saved presets? This cannot be undone.')) {
      state.presets = []
      savePresets()
      log('All presets cleared.', 'warn')
    }
  })

  DOM.btnResetSettings?.addEventListener('click', () => {
    if (confirm('Reset all settings to default values?')) {
      state.settings = {
        dotaPath: state.dotaPath,
        modFolder: 'skinforge',
        autoDetect: true,
        launchAfter: false,
        confirmRestore: true
      }
      saveSettings()
      loadSettings()
      log('Settings reset to default.', 'info')
    }
  })

  DOM.btnSaveSettings?.addEventListener('click', saveSettings)

  // Console Drawer Toggle
  DOM.consoleToggle?.addEventListener('click', () => {
    DOM.consoleFooter?.classList.toggle('open')
  })
}

// ── Single Source of Truth Dynamic Binding ──────────────────────────────────
function applyAppInfo(): void {
  const info = window.appInfo || {
    name: 'Dota 2 SkinForge',
    shortName: 'SkinForge',
    version: '1.0.0',
    displayVersion: 'v1.0',
    tagline: 'Cosmetic Suite'
  }

  document.title = `${info.name} — ${info.tagline}`

  document.querySelectorAll('[data-app-name]').forEach((el) => {
    el.textContent = info.name
  })

  document.querySelectorAll('[data-app-short-name]').forEach((el) => {
    el.textContent = info.shortName
  })

  document.querySelectorAll('[data-app-tagline]').forEach((el) => {
    el.textContent = `${info.displayVersion} · ${info.tagline}`
  })

  document.querySelectorAll('[data-app-version-sub]').forEach((el) => {
    el.textContent = `${info.displayVersion} — Local Cosmetic Suite`
  })
}

// ── Initialization Entry Point ────────────────────────────────────────────────
async function init(): Promise<void> {
  applyAppInfo()
  const info = window.appInfo || { name: 'Dota 2 SkinForge', displayVersion: 'v1.0' }
  log(`Starting ${info.name} ${info.displayVersion}...`, 'info')

  setupEventListeners()
  loadPresets()
  loadHeroSlots()
  updateLaunchString()

  try {
    if (!window.skinforge || typeof window.skinforge.getInitialData !== 'function') {
      throw new Error('IPC bridge window.skinforge is not available.')
    }

    // Load catalog JSON asynchronously
    await initCatalog()

    const initial = await window.skinforge.getInitialData()
    state.dotaPath = initial.dotaPath || ''
    state.heroes = initial.heroes || []

    await loadSettings()
    updateStatusUI(initial.status)
    renderHeroList()

    log(`Loaded ${state.heroes.length} heroes from local database.`, 'success')
    if (state.dotaPath) {
      log(`Dota 2 installation identified: ${state.dotaPath}`, 'info')
    } else {
      log('Dota 2 directory not automatically found. Please set it in Settings.', 'warn')
    }
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : String(err)
    log(`Initialization error: ${errorMessage}`, 'error')
  }
}

document.addEventListener('DOMContentLoaded', init)
