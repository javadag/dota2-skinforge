/**
 * Settings & Preferences Domain IPC Handlers
 */

import { BrowserWindow, dialog, ipcMain } from 'electron'
import { IPC_CHANNELS, type AppSettingsPayload } from '../../shared/types/ipc'
import { readStoredSettings, writeStoredSettings } from '../services/app/settingsService'
import { clearIconCache, getIconCacheStats } from '../services/assets/iconPackService'
import { isValidDotaGameDir } from '../services/dota/dotaService'

export function registerSettingsIpc(getMainWindow: () => BrowserWindow | null) {
  ipcMain.handle(IPC_CHANNELS.settingsSelectDotaDir, async () => {
    const mainWindow = getMainWindow()
    if (!mainWindow) return null
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory'],
      title: 'Select Dota 2 Game Directory (e.g. .../dota 2 beta/game)'
    })
    if (result.canceled || result.filePaths.length === 0) return null
    const selected = result.filePaths[0]
    return { path: selected, isValid: isValidDotaGameDir(selected) }
  })

  ipcMain.handle(IPC_CHANNELS.settingsRead, async () => {
    return readStoredSettings()
  })

  ipcMain.handle(IPC_CHANNELS.settingsWrite, async (_event, settings: AppSettingsPayload) => {
    try {
      writeStoredSettings(settings)
      return { ok: true as const }
    } catch (e: unknown) {
      return { ok: false as const, error: e instanceof Error ? e.message : String(e) }
    }
  })

  ipcMain.handle(IPC_CHANNELS.settingsGetIconPackStats, async () => {
    return await getIconCacheStats()
  })

  ipcMain.handle(IPC_CHANNELS.settingsResetIconPacks, async () => {
    return await clearIconCache()
  })
}
