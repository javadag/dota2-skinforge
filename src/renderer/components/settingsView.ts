/**
 * Settings & Preferences View Component
 */

import { DOM } from '../utils/dom'
import { state } from '../state/store'
import { log, updateStatusUI } from '../utils/logger'

export async function loadSettings(): Promise<void> {
  try {
    const saved = await window.skinforge.readSettings()
    if (saved && Object.keys(saved).length > 0) {
      state.settings = {
        ...state.settings,
        dotaPath: typeof saved.dotaPath === 'string' ? saved.dotaPath : state.settings.dotaPath,
        modFolder: typeof saved.modFolder === 'string' ? saved.modFolder : state.settings.modFolder,
        autoDetect: typeof saved.autoDetect === 'boolean' ? saved.autoDetect : state.settings.autoDetect,
        launchAfter: typeof saved.launchAfter === 'boolean' ? saved.launchAfter : state.settings.launchAfter,
        confirmRestore: typeof saved.confirmRestore === 'boolean' ? saved.confirmRestore : state.settings.confirmRestore
      }
    }
  } catch (e: unknown) {
    console.error('Failed reading settings:', e)
  }

  if (DOM.settingsModFolder) DOM.settingsModFolder.value = state.settings.modFolder || 'skinforge'
  if (DOM.settingAutoDetect) DOM.settingAutoDetect.checked = state.settings.autoDetect !== false
  if (DOM.settingLaunchAfter) DOM.settingLaunchAfter.checked = !!state.settings.launchAfter
  if (DOM.settingConfirmRestore) DOM.settingConfirmRestore.checked = state.settings.confirmRestore !== false
}

export async function saveSettings(): Promise<void> {
  if (DOM.settingsModFolder) state.settings.modFolder = DOM.settingsModFolder.value.trim() || 'skinforge'
  if (DOM.settingAutoDetect) state.settings.autoDetect = DOM.settingAutoDetect.checked
  if (DOM.settingLaunchAfter) state.settings.launchAfter = DOM.settingLaunchAfter.checked
  if (DOM.settingConfirmRestore) state.settings.confirmRestore = DOM.settingConfirmRestore.checked

  try {
    await window.skinforge.writeSettings(state.settings)
    DOM.settingsSavedMsg?.classList.remove('hidden')
    setTimeout(() => DOM.settingsSavedMsg?.classList.add('hidden'), 2500)
    log('Settings updated successfully.', 'success')
  } catch (e: unknown) {
    const errorMessage = e instanceof Error ? e.message : String(e)
    log(`Failed to save settings: ${errorMessage}`, 'error')
  }
}

// Mod Installation & Vanilla Restore Pipeline Actions
export async function handleApplyMods(): Promise<void> {
  if (state.isBusy) return

  if (state.status && state.status.dotaRunning) {
    alert('Dota 2 is currently running. Please close Dota 2 before applying mods.')
    return
  }

  const equipped = state.heroSlots || {}
  const totalSelected = Object.values(equipped).reduce((acc, slots) => acc + Object.keys(slots || {}).length, 0)
  if (totalSelected === 0) {
    log('No custom cosmetics are currently equipped! Please select items for your hero or click "Unlock Best Set" before applying.', 'warn')
    alert(
      'No custom cosmetics are currently equipped!\n\nPlease customize slots on your hero in the equipment grid or click "Unlock Best Set" before clicking Apply.'
    )
    return
  }

  state.isBusy = true
  if (DOM.btnApplyAll) DOM.btnApplyAll.disabled = true
  if (DOM.btnRestore) DOM.btnRestore.disabled = true
  DOM.progressBar?.classList.remove('hidden')
  if (DOM.progressFill) DOM.progressFill.style.width = '10%'
  if (DOM.progressPct) DOM.progressPct.textContent = '10%'
  if (DOM.progressMsg) DOM.progressMsg.textContent = 'Preparing custom items and VPK package...'

  log(`Compiling ${totalSelected} equipped cosmetic slot(s) into Dota 2 items schema...`, 'info')

  try {
    const res = await window.skinforge.installMods(state.dotaPath, equipped)
    if (res && res.success) {
      const count = res.patchedCount || 0
      if (count === 0) {
        log('Notice: 0 items were matched with the items schema. Please select valid cosmetics.', 'warn')
        if (DOM.progressFill) DOM.progressFill.style.width = '100%'
        if (DOM.progressPct) DOM.progressPct.textContent = '100%'
        if (DOM.progressMsg) DOM.progressMsg.textContent = 'Notice: 0 items applied'
      } else {
        log(`Successfully compiled and injected ${count} cosmetic loadout(s) into Dota 2!`, 'success')
        if (DOM.progressFill) DOM.progressFill.style.width = '100%'
        if (DOM.progressPct) DOM.progressPct.textContent = '100%'
        if (DOM.progressMsg) DOM.progressMsg.textContent = `Success (${count} items applied)!`
      }

      const status = await window.skinforge.checkStatus(state.dotaPath)
      updateStatusUI(status)

      if (state.settings.launchAfter) {
        log('Launching Dota 2...', 'info')
        window.skinforge.openExternal('steam://run/570')
      }
    }
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : String(err)
    log(`Installation error: ${errorMessage}`, 'error')
    alert(`Failed to apply mods: ${errorMessage}`)
  } finally {
    state.isBusy = false
    if (DOM.btnApplyAll) DOM.btnApplyAll.disabled = false
    if (DOM.btnRestore) DOM.btnRestore.disabled = false
    setTimeout(() => DOM.progressBar?.classList.add('hidden'), 2000)
  }
}

export async function handleRestoreMods(): Promise<void> {
  if (state.isBusy) return

  if (state.settings.confirmRestore) {
    if (!confirm('Restore clean game files? This will deactivate all modded cosmetics.')) {
      return
    }
  }

  state.isBusy = true
  if (DOM.btnApplyAll) DOM.btnApplyAll.disabled = true
  if (DOM.btnRestore) DOM.btnRestore.disabled = true
  DOM.progressBar?.classList.remove('hidden')
  if (DOM.progressFill) DOM.progressFill.style.width = '20%'
  if (DOM.progressPct) DOM.progressPct.textContent = '20%'
  if (DOM.progressMsg) DOM.progressMsg.textContent = 'Restoring original game configuration...'

  log('Restoring vanilla Dota 2 game files...', 'info')

  try {
    const res = await window.skinforge.uninstallMods(state.dotaPath)
    if (res && res.success) {
      log('Vanilla restoration complete! Game is now unmodded.', 'success')
      if (DOM.progressFill) DOM.progressFill.style.width = '100%'
      if (DOM.progressPct) DOM.progressPct.textContent = '100%'
      if (DOM.progressMsg) DOM.progressMsg.textContent = 'Restored'

      const status = await window.skinforge.checkStatus(state.dotaPath)
      updateStatusUI(status)
    }
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : String(err)
    log(`Restore error: ${errorMessage}`, 'error')
    alert(`Failed to restore: ${errorMessage}`)
  } finally {
    state.isBusy = false
    if (DOM.btnApplyAll) DOM.btnApplyAll.disabled = false
    if (DOM.btnRestore) DOM.btnRestore.disabled = false
    setTimeout(() => DOM.progressBar?.classList.add('hidden'), 2000)
  }
}
