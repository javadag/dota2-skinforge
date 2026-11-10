import type { StateCreator } from 'zustand'
import type { UpdateDownloadProgress, UpdateInfo } from '../../env'
import type { AppStoreState } from '../useAppStore'

export type UpdateStatus = 'idle' | 'checking' | 'available' | 'up-to-date' | 'downloading' | 'downloaded' | 'error'

export interface UpdateSlice {
  updateStatus: UpdateStatus
  updateInfo: UpdateInfo | null
  updateProgress: UpdateDownloadProgress | null
  downloadedUpdatePath: string | null
  downloadedUpdateSha256: string | null

  checkForUpdates: (manual?: boolean) => Promise<void>
  downloadUpdate: (assetUrl: string, filename: string, expectedSha256?: string) => Promise<void>
  installUpdate: () => Promise<void>
}

export const createUpdateSlice: StateCreator<AppStoreState, [], [], UpdateSlice> = (set, get) => ({
  updateStatus: 'idle',
  updateInfo: null,
  updateProgress: null,
  downloadedUpdatePath: null,
  downloadedUpdateSha256: null,

  checkForUpdates: async (manual: boolean = false) => {
    if (!window.skinforge || typeof window.skinforge.checkForUpdates !== 'function') return

    set({ updateStatus: 'checking' })
    if (manual) {
      get().addLog('Checking for updates...', 'info')
    }

    try {
      const info = await window.skinforge.checkForUpdates()
      if (info.error) {
        set({ updateStatus: 'error', updateInfo: info })
        if (manual) {
          get().addLog(`Update check failed: ${info.error}`, 'error')
        }
        return
      }

      if (info.updateAvailable) {
        set({ updateStatus: 'available', updateInfo: info, isUpdateModalOpen: true })
        get().addLog(`A new version of SkinForge is available: ${info.displayVersion}!`, 'success')
      } else {
        set({ updateStatus: 'up-to-date', updateInfo: info })
        if (manual) {
          get().addLog(`SkinForge is up to date (${info.currentVersion || 'current'}).`, 'info')
        }
      }
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err)
      set({ updateStatus: 'error' })
      if (manual) {
        get().addLog(`Update check error: ${errMsg}`, 'error')
      }
    }
  },

  downloadUpdate: async (assetUrl: string, filename: string, expectedSha256?: string) => {
    if (!window.skinforge || typeof window.skinforge.downloadUpdate !== 'function') return

    set({ updateStatus: 'downloading', updateProgress: null, downloadedUpdateSha256: null })
    get().addLog(`Downloading update: ${filename}...`, 'info')

    let cleanup: (() => void) | undefined
    if (typeof window.skinforge.onUpdateProgress === 'function') {
      cleanup = window.skinforge.onUpdateProgress((progress) => {
        set({ updateProgress: progress })
      })
    }

    try {
      const res = await window.skinforge.downloadUpdate({ assetUrl, filename, expectedSha256 })
      if (cleanup) cleanup()

      if (res && res.ok && res.filePath) {
        set({
          updateStatus: 'downloaded',
          downloadedUpdatePath: res.filePath,
          downloadedUpdateSha256: res.sha256 || expectedSha256 || null
        })
        const hashMsg = res.sha256 ? ` (SHA-256: ${res.sha256.slice(0, 12)}...)` : ''
        get().addLog(`Update downloaded and integrity verified${hashMsg}`, 'success')
      } else {
        set({ updateStatus: 'error' })
        get().addLog(`Failed to download update: ${res?.error || 'Unknown error'}`, 'error')
      }
    } catch (err: unknown) {
      if (cleanup) cleanup()
      const msg = err instanceof Error ? err.message : String(err)
      set({ updateStatus: 'error' })
      get().addLog(`Download failed: ${msg}`, 'error')
    }
  },

  installUpdate: async () => {
    const { downloadedUpdatePath, downloadedUpdateSha256 } = get()
    if (!downloadedUpdatePath || !window.skinforge || typeof window.skinforge.installUpdate !== 'function') return

    get().addLog('Launching verified update installer...', 'info')
    const res = await window.skinforge.installUpdate({
      filePath: downloadedUpdatePath,
      expectedSha256: downloadedUpdateSha256 || undefined
    })
    if (res && !res.ok) {
      get().addLog(`Failed to launch update: ${res.error || 'Unknown error'}`, 'error')
    }
  }
})
