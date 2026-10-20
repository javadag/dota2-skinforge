/**
 * Update Domain IPC Handlers
 */

import { BrowserWindow, ipcMain } from 'electron'
import { checkForUpdates, downloadUpdate, installUpdate } from '../services/updateService'
import { APP_CONFIG } from '../../shared/constants/appConfig'

export function registerUpdateIpc(getMainWindow: () => BrowserWindow | null) {
  ipcMain.handle('check-for-updates', async () => {
    try {
      return await checkForUpdates(APP_CONFIG.version)
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      return { updateAvailable: false, error: msg }
    }
  })

  ipcMain.handle('download-update', async (_event, payload: { assetUrl: string; filename: string }) => {
    const mainWindow = getMainWindow()
    return await downloadUpdate(payload.assetUrl, payload.filename, (progress) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('update-download-progress', progress)
      }
    })
  })

  ipcMain.handle('install-update', async (_event, payload: { filePath: string }) => {
    return installUpdate(payload.filePath)
  })
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { registerUpdateIpc }
}
