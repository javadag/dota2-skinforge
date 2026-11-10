import type { StateCreator } from 'zustand'
import { buildLaunchArgsString, DEFAULT_LAUNCH_OPTIONS, type LaunchOptionsSettings } from '../../../shared/constants/launchOptions'
import type { AppStoreState } from '../useAppStore'

export { buildLaunchArgsString, DEFAULT_LAUNCH_OPTIONS, type LaunchOptionsSettings }

export interface AppSettings {
  dotaPath: string
  modFolder: string
  autoDetect: boolean
  launchAfter: boolean
  confirmRestore: boolean
  autoCheckUpdates: boolean
  launchOptions?: LaunchOptionsSettings
}

export interface CacheStats {
  count: number
  sizeBytes: number
  formattedSize: string
}

export interface SettingsSlice {
  dotaPath: string
  settings: AppSettings
  cacheStats: CacheStats | null

  updateSettings: (newSettings: Partial<AppSettings>) => void
  saveSettings: () => Promise<boolean>
  resetSettings: () => void
  selectDotaDirectory: () => Promise<void>
  clearIconCache: () => Promise<void>
}

export const createSettingsSlice: StateCreator<AppStoreState, [], [], SettingsSlice> = (set, get) => ({
  dotaPath: '',
  settings: {
    dotaPath: '',
    modFolder: 'skinforge',
    autoDetect: true,
    launchAfter: false,
    confirmRestore: true,
    autoCheckUpdates: true,
    launchOptions: DEFAULT_LAUNCH_OPTIONS
  },
  cacheStats: null,

  updateSettings: (newSettings) => {
    set((state) => {
      const updated = { ...state.settings, ...newSettings }
      if (window.skinforge && typeof window.skinforge.writeSettings === 'function') {
        window.skinforge.writeSettings(updated).catch(() => {})
      }
      return { settings: updated }
    })
  },

  saveSettings: async () => {
    const { settings } = get()
    try {
      if (window.skinforge && typeof window.skinforge.writeSettings === 'function') {
        await window.skinforge.writeSettings(settings)
      }
      get().addLog('Settings saved successfully.', 'success')
      return true
    } catch (e: unknown) {
      const err = e instanceof Error ? e.message : String(e)
      get().addLog(`Failed to save settings: ${err}`, 'error')
      return false
    }
  },

  resetSettings: () => {
    const defaults: AppSettings = {
      dotaPath: get().dotaPath,
      modFolder: 'skinforge',
      autoDetect: true,
      launchAfter: false,
      confirmRestore: true,
      autoCheckUpdates: true
    }
    set({ settings: defaults })
    get().saveSettings()
    get().addLog('Settings reset to defaults.', 'info')
  },

  selectDotaDirectory: async () => {
    if (!window.skinforge || typeof window.skinforge.selectDirectory !== 'function') return
    try {
      const res = await window.skinforge.selectDirectory()
      if (res && res.path) {
        set({ dotaPath: res.path })
        get().updateSettings({ dotaPath: res.path })
        await get().saveSettings()
        const status = await window.skinforge.checkStatus(res.path)
        set({ status })
        get().addLog(`Game directory updated: ${res.path}`, 'info')
      }
    } catch (e: unknown) {
      const err = e instanceof Error ? e.message : String(e)
      get().addLog(`Directory selection failed: ${err}`, 'error')
    }
  },

  clearIconCache: async () => {
    if (!window.skinforge || typeof window.skinforge.clearIconCache !== 'function') return
    try {
      const ok = await window.skinforge.clearIconCache()
      if (ok) {
        const stats = await window.skinforge.getCacheStats()
        set({ cacheStats: stats })
        get().addLog('Local icon cache cleared successfully.', 'success')
      }
    } catch (e: unknown) {
      const err = e instanceof Error ? e.message : String(e)
      get().addLog(`Failed to clear icon cache: ${err}`, 'error')
    }
  }
})
