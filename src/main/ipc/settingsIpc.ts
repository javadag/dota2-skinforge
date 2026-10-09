/**
 * Settings & Preferences Domain IPC Handlers
 */

import { app, BrowserWindow, dialog, ipcMain } from 'electron'
import fs from 'fs'
import path from 'path'
import * as dotaPathModule from '../services/dotaPathService'
import { getIconCacheStats, clearIconCache } from '../services/iconCacheService'

export function registerSettingsIpc(getMainWindow: () => BrowserWindow | null) {
  const settingsPath = path.join(app.getPath('userData'), 'skinforge_settings.json')

  ipcMain.handle('select-directory', async () => {
    const mainWindow = getMainWindow()
    if (!mainWindow) return null
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory'],
      title: 'Select Dota 2 Game Directory (e.g. .../dota 2 beta/game)'
    })
    if (result.canceled || result.filePaths.length === 0) return null
    const selected = result.filePaths[0]
    const isValid = dotaPathModule.isValidDotaGameDir(selected)
    return { path: selected, isValid }
  })

  ipcMain.handle('read-settings', async () => {
    if (!fs.existsSync(settingsPath)) return {}
    try {
      return JSON.parse(fs.readFileSync(settingsPath, 'utf8'))
    } catch {
      return {}
    }
  })

  ipcMain.handle('write-settings', async (_event, settings) => {
    try {
      fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf8')
      return { ok: true }
    } catch (e: unknown) {
      const errorMessage = e instanceof Error ? e.message : String(e)
      return { ok: false, error: errorMessage }
    }
  })

  ipcMain.handle('get-cache-stats', async () => {
    return await getIconCacheStats()
  })

  ipcMain.handle('clear-icon-cache', async () => {
    return await clearIconCache()
  })
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { registerSettingsIpc }
}
