/**
 * Mods Domain IPC Handlers
 */

import { ipcMain, BrowserWindow } from 'electron'
import * as pipeline from '../services/pipelineService'
import * as dotaPathModule from '../services/dotaPathService'

interface ProgressInfo {
  step: number
  total: number
  message: string
}

export function registerModsIpc(getMainWindow: () => BrowserWindow | null) {
  ipcMain.handle('check-status', async (_event, customPath?: string) => {
    const dotaPath = customPath || dotaPathModule.detectDotaPath()
    return pipeline.checkStatus(dotaPath)
  })

  ipcMain.handle('install-mods', async (_event, customPath?: string, equipped?: Record<string, Record<string, string>>) => {
    const dotaPath = customPath || dotaPathModule.detectDotaPath()
    const mainWindow = getMainWindow()
    return await pipeline.installMods(dotaPath, equipped || {}, (progress: ProgressInfo) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('install-progress', progress)
      }
    })
  })

  ipcMain.handle('uninstall-mods', async (_event, customPath?: string) => {
    const dotaPath = customPath || dotaPathModule.detectDotaPath()
    const mainWindow = getMainWindow()
    return pipeline.uninstallMods(dotaPath, (progress: ProgressInfo) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('install-progress', progress)
      }
    })
  })
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { registerModsIpc }
}
