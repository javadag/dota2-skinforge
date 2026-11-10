/**
 * Dota 2 SkinForge — Central Zustand Store (Sliced Architecture)
 * Composes domain slices: navigation, loadout, presets, settings, pipeline, update, logs.
 */

import { create } from 'zustand'
import type { InstallProgress } from '../env'
import { createLoadoutSlice, type LoadoutSlice } from './slices/loadoutSlice'
import { createLogsSlice, type LogsSlice } from './slices/logsSlice'
import { createNavigationSlice, type NavigationSlice } from './slices/navigationSlice'
import { createPipelineSlice, type PipelineSlice } from './slices/pipelineSlice'
import { createPresetsSlice, type PresetsSlice } from './slices/presetsSlice'
import { createSettingsSlice, DEFAULT_LAUNCH_OPTIONS, type AppSettings, type CacheStats, type SettingsSlice } from './slices/settingsSlice'
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

// Re-export domain types and helpers for 100% backward compatibility
export { type AppTab, type AttributeFilter, type CategoryGroup } from './slices/navigationSlice'
export { isPersonaSlotId, RARITY_RANK, rarityRank } from './slices/loadoutSlice'
export { getStoredPresets, type Preset } from './slices/presetsSlice'
export {
  buildLaunchArgsString,
  DEFAULT_LAUNCH_OPTIONS,
  type AppSettings,
  type CacheStats,
  type LaunchOptionsSettings
} from './slices/settingsSlice'
export { type LogEntry } from './slices/logsSlice'
export { type UpdateStatus } from './slices/updateSlice'

export const useAppStore = create<AppStoreState>((set, get, store) => ({
  ...createNavigationSlice(set, get, store),
  ...createLoadoutSlice(set, get, store),
  ...createPresetsSlice(set, get, store),
  ...createSettingsSlice(set, get, store),
  ...createPipelineSlice(set, get, store),
  ...createUpdateSlice(set, get, store),
  ...createLogsSlice(set, get, store),

  initApp: async () => {
    const { addLog } = get()
    try {
      // Progress IPC listener
      if (window.skinforge && typeof window.skinforge.onInstallProgress === 'function') {
        window.skinforge.onInstallProgress((data: InstallProgress) => {
          if (data && data.total) {
            set({ progress: data })
            addLog(`[${data.step}/${data.total}] ${data.message}`, 'info')
          }
        })
      }

      if (!window.skinforge || typeof window.skinforge.getInitialData !== 'function') {
        throw new Error('IPC bridge window.skinforge is not available.')
      }

      const initial = await window.skinforge.getInitialData()
      const dotaPath = initial.dotaPath || ''
      const heroes = initial.heroes || []
      const categories = initial.categories || []
      const status = initial.status

      let savedSettings: Partial<AppSettings> = {}
      try {
        savedSettings = (await window.skinforge.readSettings()) || {}
      } catch {
        // ignore
      }

      let cacheStats: CacheStats | null = null
      try {
        cacheStats = await window.skinforge.getCacheStats()
      } catch {
        // ignore
      }

      set((state) => ({
        dotaPath,
        heroes,
        categories,
        status,
        cacheStats,
        settings: {
          ...state.settings,
          dotaPath: typeof savedSettings.dotaPath === 'string' ? savedSettings.dotaPath : dotaPath,
          modFolder: typeof savedSettings.modFolder === 'string' ? savedSettings.modFolder : 'skinforge',
          autoDetect: typeof savedSettings.autoDetect === 'boolean' ? savedSettings.autoDetect : true,
          launchAfter: typeof savedSettings.launchAfter === 'boolean' ? savedSettings.launchAfter : false,
          confirmRestore: typeof savedSettings.confirmRestore === 'boolean' ? savedSettings.confirmRestore : true,
          autoCheckUpdates: typeof savedSettings.autoCheckUpdates === 'boolean' ? savedSettings.autoCheckUpdates : true,
          launchOptions: {
            ...DEFAULT_LAUNCH_OPTIONS,
            ...(savedSettings.launchOptions || {})
          }
        }
      }))

      // CRITICAL: Log for smoke test pattern /Loaded (\d+) heroes/
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
  }
}))
