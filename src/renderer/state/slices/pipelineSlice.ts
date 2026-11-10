import type { StateCreator } from 'zustand'
import type { InstallProgress, PipelineStatus } from '../../env'
import type { AppStoreState } from '../useAppStore'
import { isPersonaSlotId } from './loadoutSlice'
import { buildLaunchArgsString } from './settingsSlice'

export interface PipelineSlice {
  status: PipelineStatus | null
  isBusy: boolean
  progress: InstallProgress | null

  applyMods: () => Promise<void>
  restoreMods: () => Promise<void>
  installBundle: () => Promise<void>
  refreshStatus: () => Promise<void>
  launchDota: () => void
}

export const createPipelineSlice: StateCreator<AppStoreState, [], [], PipelineSlice> = (set, get) => ({
  status: null,
  isBusy: false,
  progress: null,

  applyMods: async () => {
    const state = get()
    if (state.isBusy) return

    if (state.status && state.status.dotaRunning) {
      alert('Dota 2 is currently running. Please close Dota 2 before applying mods.')
      return
    }

    const rawEquipped = state.heroSlots || {}
    const equipped: Record<string, Record<string, string>> = {}
    for (const [heroTag, slots] of Object.entries(rawEquipped)) {
      if (!slots) continue
      const stance = state.heroActiveStance[heroTag] || 'default'
      const cleanHeroSlots: Record<string, string> = {}
      for (const [slotId, itemName] of Object.entries(slots)) {
        if (!itemName) continue
        if (stance === 'persona' ? isPersonaSlotId(slotId) : !isPersonaSlotId(slotId)) {
          cleanHeroSlots[slotId] = itemName
        }
      }
      if (Object.keys(cleanHeroSlots).length > 0) {
        equipped[heroTag] = cleanHeroSlots
      }
    }
    const totalSelected = Object.values(equipped).reduce((acc, slots) => acc + Object.keys(slots || {}).length, 0)
    if (totalSelected === 0) {
      state.addLog('No custom cosmetics equipped! Select items or Unlock Best Set first.', 'warn')
      alert(
        'No custom cosmetics are currently equipped!\n\nPlease customize slots on your hero in the equipment grid or click "Unlock Best Set" before clicking Apply.'
      )
      return
    }

    set({ isBusy: true, progress: { step: 1, total: 10, message: 'Preparing custom items and VPK package...' } })
    state.addLog(`Compiling ${totalSelected} equipped cosmetic slot(s) into Dota 2 items schema...`, 'info')

    try {
      const res = await window.skinforge.installMods(state.dotaPath, equipped, state.heroCustomizations)
      if (res && res.success) {
        const count = res.patchedCount || 0
        if (count === 0) {
          state.addLog('Notice: 0 items were matched with the items schema. Please select valid cosmetics.', 'warn')
          set({ progress: { step: 10, total: 10, message: 'Notice: 0 items applied' } })
        } else {
          state.addLog(`Successfully compiled and injected ${count} cosmetic loadout(s) into Dota 2!`, 'success')
          set({ progress: { step: 10, total: 10, message: `Success (${count} items applied)!` } })
        }

        const skipped = (res.report?.skipped ?? []).filter((s) => !s.reason?.includes('already provides it'))
        if (skipped.length) {
          state.addLog(
            `${skipped.length} selection(s) could not be applied: ` +
              skipped
                .slice(0, 4)
                .map((s) => `${s.hero}/${s.slot}`)
                .join(', ') +
              (skipped.length > 4 ? '...' : ''),
            'warn'
          )
        }
        for (const warning of res.report?.warnings ?? []) state.addLog(warning, 'warn')

        const status = await window.skinforge.checkStatus(state.dotaPath)
        set({ status })

        if (state.settings.launchAfter) {
          state.addLog('Launching Dota 2...', 'info')
          window.skinforge.openExternal('steam://run/570')
        }
      } else if (res) {
        const msg = res.error || 'Unknown error'
        state.addLog(`Installation failed: ${msg}`, 'error')
        set({ progress: { step: 10, total: 10, message: 'Install failed' } })
        alert(`Failed to apply mods:\n${msg}`)
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      state.addLog(`Installation error: ${msg}`, 'error')
      alert(`Failed to apply mods: ${msg}`)
    } finally {
      set({ isBusy: false })
      setTimeout(() => set({ progress: null }), 2000)
    }
  },

  restoreMods: async () => {
    const state = get()
    if (state.isBusy) return

    if (state.settings.confirmRestore) {
      if (!confirm('Restore clean game files? This will deactivate all modded cosmetics.')) {
        return
      }
    }

    set({ isBusy: true, progress: { step: 2, total: 10, message: 'Restoring original game configuration...' } })
    state.addLog('Restoring vanilla Dota 2 game files...', 'info')

    try {
      const res = await window.skinforge.uninstallMods(state.dotaPath)
      if (res && res.success) {
        state.addLog('Vanilla restoration complete! Game is now unmodded.', 'success')
        set({ progress: { step: 10, total: 10, message: 'Restored' } })
        const status = await window.skinforge.checkStatus(state.dotaPath)
        set({ status })
      } else if (res) {
        const msg = res.error || 'Unknown error'
        state.addLog(`Restore failed: ${msg}`, 'error')
        alert(`Failed to restore:\n${msg}`)
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      state.addLog(`Restore error: ${msg}`, 'error')
      alert(`Failed to restore: ${msg}`)
    } finally {
      set({ isBusy: false })
      setTimeout(() => set({ progress: null }), 2000)
    }
  },

  installBundle: async () => {
    const state = get()
    if (state.isBusy) return

    if (state.status && state.status.dotaRunning) {
      alert('Dota 2 is currently running. Please close Dota 2 before installing a pack.')
      return
    }

    const bundleDir = await window.skinforge.selectBundleDirectory()
    if (!bundleDir) return

    if (!confirm(`Install the pack in:\n${bundleDir}\n\nThis replaces the currently installed cosmetic pack.`)) {
      return
    }

    set({ isBusy: true, progress: { step: 1, total: 4, message: 'Reading pack folder...' } })
    state.addLog(`Staging pack from ${bundleDir}...`, 'info')

    try {
      const res = await window.skinforge.installBundle(state.dotaPath, bundleDir)
      if (res && res.success) {
        state.addLog(`Pack installed (${res.patchedCount ?? 0} item blocks). Launch Dota 2 to see it.`, 'success')
        set({ progress: { step: 4, total: 4, message: `Installed (${res.patchedCount ?? 0} blocks)` } })
        const status = await window.skinforge.checkStatus(state.dotaPath)
        set({ status })
      } else {
        const msg = res?.error ?? 'Unknown error'
        state.addLog(`Pack install failed: ${msg}`, 'error')
        alert(`Failed to install pack:\n${msg}`)
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      state.addLog(`Pack install error: ${msg}`, 'error')
      alert(`Failed to install pack:\n${msg}`)
    } finally {
      set({ isBusy: false })
      setTimeout(() => set({ progress: null }), 2000)
    }
  },

  refreshStatus: async () => {
    if (!window.skinforge || typeof window.skinforge.checkStatus !== 'function') return
    get().addLog('Refreshing status...', 'info')
    const status = await window.skinforge.checkStatus(get().dotaPath)
    set({ status })
  },

  launchDota: async () => {
    const state = get()
    const launchArgs = buildLaunchArgsString(state.settings.launchOptions)
    state.addLog(`Launching Dota 2 via Steam (${launchArgs || 'no flags'})...`, 'info')

    if (window.skinforge && typeof window.skinforge.launchDota === 'function') {
      const res = await window.skinforge.launchDota(launchArgs)
      if (res && !res.success && res.error) {
        state.addLog(`Launch warning: ${res.error}`, 'warn')
      }
    } else if (window.skinforge && typeof window.skinforge.openExternal === 'function') {
      const url = launchArgs ? `steam://run/570//${encodeURIComponent(launchArgs)}/` : 'steam://run/570'
      await window.skinforge.openExternal(url)
    }
  }
})
