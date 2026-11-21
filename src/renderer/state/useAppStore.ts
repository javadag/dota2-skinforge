/**
 * Dota 2 SkinForge — Central Zustand Store (Sliced Architecture)
 * Composes domain slices: navigation, loadout, presets, settings, pipeline, update, logs.
 */

import { create } from 'zustand'
import { listCategories, listHeroes } from '../../shared/armory/armoryCatalog'
import type { AppSettings, StepProgress } from '../../shared/types/ipc'
import { createLoadoutSlice, type LoadoutSlice } from './slices/loadoutSlice'
import { createLogsSlice, type LogsSlice } from './slices/logsSlice'
import { createNavigationSlice, type NavigationSlice } from './slices/navigationSlice'
import { createPipelineSlice, isPatchReset, type PipelineSlice } from './slices/pipelineSlice'
import { createPresetsSlice, type PresetsSlice } from './slices/presetsSlice'
import { createSettingsSlice, DEFAULT_LAUNCH_OPTIONS, type SettingsSlice } from './slices/settingsSlice'
import { createUpdateSlice, type UpdateSlice } from './slices/updateSlice'

export interface InitAppSlice {
  initApp: () => Promise<void>
}

export type AppStoreState = NavigationSlice &
  LoadoutSlice &
  PresetsSlice &
  SettingsSlice &
  PipelineSlice &
  UpdateSlice &
  LogsSlice &
  InitAppSlice

// Re-export domain types and helpers used by components and tests
export { type AttributeFilter } from './slices/navigationSlice'
export { isPatchReset } from './slices/pipelineSlice'
export { buildLaunchArgsString, DEFAULT_LAUNCH_OPTIONS, type LaunchOptionsSettings } from './slices/settingsSlice'

let unsubscribeInstallProgress: (() => void) | undefined
let initAppPromise: Promise<void> | null = null

export const useAppStore = create<AppStoreState>((set, get, store) => ({
  ...createNavigationSlice(set, get, store),
  ...createLoadoutSlice(set, get, store),
  ...createPresetsSlice(set, get, store),
  ...createSettingsSlice(set, get, store),
  ...createPipelineSlice(set, get, store),
  ...createUpdateSlice(set, get, store),
  ...createLogsSlice(set, get, store),

  initApp: async () => {
    if (initAppPromise) return initAppPromise
    initAppPromise = (async () => {
      const { addLog } = get()
      try {
        // Progress IPC listener
        if (window.skinforge && typeof window.skinforge.onInstallProgress === 'function') {
          unsubscribeInstallProgress?.()
          unsubscribeInstallProgress = window.skinforge.onInstallProgress((data: StepProgress) => {
            if (data && data.total) {
              set({ progress: data })
              addLog(`[${data.step}/${data.total}] ${data.message}`, 'info')
            }
          })
        }

        if (!window.skinforge || typeof window.skinforge.getInitialData !== 'function') {
          throw new Error('IPC bridge window.skinforge is not available.')
        }

        // The roster comes from bundled data, so render it without waiting on IPC.
        const heroes = listHeroes()
        const categories = listCategories()
        set({ heroes, categories })

        const initial = await window.skinforge.getInitialData()
        const dotaPath = initial.dotaPath || ''
        const status = initial.status

        let savedSettings: Partial<AppSettings> = {}
        try {
          savedSettings = (await window.skinforge.readSettings()) || {}
        } catch {
          // ignore
        }

        const autoDetect = typeof savedSettings.autoDetect === 'boolean' ? savedSettings.autoDetect : true
        set((state) => ({
          dotaPath,
          status,
          patchAlertVisible: isPatchReset(status, autoDetect),
          settings: {
            ...state.settings,
            dotaPath: typeof savedSettings.dotaPath === 'string' && savedSettings.dotaPath ? savedSettings.dotaPath : dotaPath,
            modFolder: typeof savedSettings.modFolder === 'string' ? savedSettings.modFolder : 'skinforge',
            autoDetect,
            launchAfter: typeof savedSettings.launchAfter === 'boolean' ? savedSettings.launchAfter : false,
            confirmRestore: typeof savedSettings.confirmRestore === 'boolean' ? savedSettings.confirmRestore : true,
            autoCheckUpdates: typeof savedSettings.autoCheckUpdates === 'boolean' ? savedSettings.autoCheckUpdates : true,
            launchOptions: {
              ...DEFAULT_LAUNCH_OPTIONS,
              ...(savedSettings.launchOptions || {})
            }
          }
        }))

        const installedVersion = window.appInfo?.version
        if (installedVersion && savedSettings.lastSeenWhatsNewVersion !== installedVersion) {
          void get().loadWhatsNew(installedVersion)
        }

        // Cache stats only appear in Settings; never block startup on them.
        window.skinforge
          .getCacheStats()
          .then((cacheStats) => set({ cacheStats }))
          .catch(() => {})

        addLog(`Loaded ${heroes.length} heroes from local database.`, 'success')
        if (dotaPath) {
          addLog(`Dota 2 installation identified: ${dotaPath}`, 'info')
        } else {
          addLog('Dota 2 directory not automatically found. Please set it in Settings.', 'warn')
        }

        // Check for updates automatically in background if enabled
        const currentSettings = get().settings
        if (currentSettings.autoCheckUpdates) {
          setTimeout(() => {
            get().checkForUpdates(false)
          }, 1500)
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err)
        addLog(`Initialization error: ${msg}`, 'error')
      }
    })()
    return initAppPromise
  }
}))
