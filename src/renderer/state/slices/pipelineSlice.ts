import type { StateCreator } from 'zustand'
import { countEquippedSlots } from '../../../shared/armory/armoryTypes'
import { countAbilityIconOverrides } from '../../../shared/types/abilityIcons'
import type { PipelineStatus, StepProgress } from '../../../shared/types/ipc'
import type { AppStoreState } from '../useAppStore'
import { filterSlotsForStance } from './loadoutSlice'
import { buildLaunchArgsString } from './settingsSlice'

/** True when Steam updated Dota 2 and reset `gameinfo_branchspecific.gi` or `dota.signatures` while our VPK is still present. */
export const isPatchReset = (
  status:
    { validDotaDir?: boolean; vpkFileExists?: boolean; gameinfoConfigured?: boolean; signaturesBypassed?: boolean } | null | undefined,
  autoDetect: boolean
): boolean =>
  Boolean(autoDetect && status?.validDotaDir && status.vpkFileExists && (!status.gameinfoConfigured || !status.signaturesBypassed))

export interface PipelineSlice {
  status: PipelineStatus | null
  isBusy: boolean
  progress: StepProgress | null

  applyMods: () => Promise<void>
  restoreMods: () => Promise<void>
  refreshStatus: () => Promise<void>
  launchDota: () => Promise<void>
}

let progressResetTimer: ReturnType<typeof setTimeout> | null = null

function clearProgressTimer() {
  if (progressResetTimer) {
    clearTimeout(progressResetTimer)
    progressResetTimer = null
  }
}

export const createPipelineSlice: StateCreator<AppStoreState, [], [], PipelineSlice> = (set, get) => ({
  status: null,
  isBusy: false,
  progress: null,

  applyMods: async () => {
    const state = get()
    if (state.isBusy) return

    // Re-verify live process state if cached status says Dota 2 is running, so closing Dota never stays stuck.
    if (state.status?.dotaRunning) {
      let stillRunning = true
      try {
        const live = await window.skinforge.checkStatus(state.dotaPath)
        set({ status: live, patchAlertVisible: isPatchReset(live, state.settings.autoDetect) })
        stillRunning = live.dotaRunning
      } catch {
        // Keep stillRunning = true if live check fails.
      }
      if (stillRunning) {
        await state.openAlert('Dota 2 Is Running', 'Dota 2 is currently running. Please close Dota 2 before applying mods.')
        return
      }
    }

    const equipped: Record<string, Record<string, string>> = {}
    for (const [heroTag, slots] of Object.entries(state.heroSlots || {})) {
      if (!slots) continue
      const cleanHeroSlots = filterSlotsForStance(slots, state.heroActiveStance[heroTag] || 'default')
      if (Object.keys(cleanHeroSlots).length > 0) equipped[heroTag] = cleanHeroSlots
    }

    const totalSelected = countEquippedSlots(equipped)
    const totalIcons = countAbilityIconOverrides(state.heroAbilityIcons)
    if (totalSelected + totalIcons === 0) {
      state.addLog('No cosmetics or ability icon overrides are selected.', 'warn')
      await state.openAlert(
        'Nothing Selected',
        'Equip a cosmetic or choose an ability icon before applying mods. Use Restore to remove an installed mod pack.'
      )
      return
    }

    clearProgressTimer()
    set({ isBusy: true, progress: { step: 1, total: 10, message: 'Preparing custom items and VPK package...' } })
    state.addLog(`Building the mod pack with ${totalSelected} cosmetic slot(s) and ${totalIcons} ability icon override(s)...`, 'info')

    try {
      const res = await window.skinforge.installMods(state.dotaPath, equipped, state.heroCustomizations, state.heroAbilityIcons)
      if (res && res.success) {
        const count = res.patchedCount || 0
        if (count === 0) {
          state.addLog('Notice: 0 items were matched with the items schema. Please select valid cosmetics.', 'warn')
          set({ progress: { step: 10, total: 10, message: 'Notice: 0 items applied' } })
        } else {
          state.addLog(`Installed the mod pack with ${count} patched item blocks.`, 'success')
          set({ progress: { step: 10, total: 10, message: 'Mods installed' } })
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
        set({ status, patchAlertVisible: false })

        if (state.settings.launchAfter) {
          void get().launchDota()
        }
      } else if (res) {
        const msg = res.error || 'Unknown error'
        state.addLog(`Installation failed: ${msg}`, 'error')
        set({ progress: { step: 10, total: 10, message: 'Install failed' } })
        await state.openAlert('Install Failed', `Failed to apply mods:\n${msg}`)
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      state.addLog(`Installation error: ${msg}`, 'error')
      await state.openAlert('Install Error', `Failed to apply mods: ${msg}`)
    } finally {
      set({ isBusy: false })
      clearProgressTimer()
      progressResetTimer = setTimeout(() => {
        progressResetTimer = null
        if (!get().isBusy) set({ progress: null })
      }, 2000)
    }
  },

  restoreMods: async () => {
    const state = get()
    if (state.isBusy) return

    if (state.settings.confirmRestore) {
      const confirmed = await state.openConfirm({
        title: 'Restore Game Files',
        message: 'Restore clean game files? This will deactivate all modded cosmetics.',
        confirmText: 'Restore',
        danger: true
      })
      if (!confirmed) {
        return
      }
    }

    clearProgressTimer()
    set({ isBusy: true, progress: { step: 2, total: 10, message: 'Restoring original game configuration...' } })
    state.addLog('Restoring vanilla Dota 2 game files...', 'info')

    try {
      const res = await window.skinforge.uninstallMods(state.dotaPath)
      if (res && res.success) {
        state.addLog('Vanilla restoration complete! Game is now unmodded.', 'success')
        set({ progress: { step: 10, total: 10, message: 'Restored' } })
        const status = await window.skinforge.checkStatus(state.dotaPath)
        set({ status, patchAlertVisible: false })
      } else if (res) {
        const msg = res.error || 'Unknown error'
        state.addLog(`Restore failed: ${msg}`, 'error')
        await state.openAlert('Restore Failed', `Failed to restore:\n${msg}`)
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      state.addLog(`Restore error: ${msg}`, 'error')
      await state.openAlert('Restore Error', `Failed to restore: ${msg}`)
    } finally {
      set({ isBusy: false })
      clearProgressTimer()
      progressResetTimer = setTimeout(() => {
        progressResetTimer = null
        if (!get().isBusy) set({ progress: null })
      }, 2000)
    }
  },

  refreshStatus: async () => {
    if (!window.skinforge || typeof window.skinforge.checkStatus !== 'function') return
    get().addLog('Refreshing status...', 'info')
    try {
      const status = await window.skinforge.checkStatus(get().dotaPath)
      set({ status, patchAlertVisible: isPatchReset(status, get().settings.autoDetect) })
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      get().addLog(`Status refresh failed: ${msg}`, 'error')
    }
  },

  launchDota: async () => {
    const state = get()
    const launchArgs = buildLaunchArgsString(state.settings.launchOptions)
    state.addLog(`Launching Dota 2 via Steam (${launchArgs || 'no flags'})...`, 'info')

    try {
      if (window.skinforge && typeof window.skinforge.launchDota === 'function') {
        const res = await window.skinforge.launchDota(launchArgs)
        if (res && !res.success && res.error) {
          state.addLog(`Launch warning: ${res.error}`, 'warn')
        }
      } else if (window.skinforge && typeof window.skinforge.openExternal === 'function') {
        const url = launchArgs ? `steam://run/570//${encodeURIComponent(launchArgs)}/` : 'steam://run/570'
        await window.skinforge.openExternal(url)
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      state.addLog(`Failed to launch Dota 2: ${msg}`, 'error')
    }
  }
})
