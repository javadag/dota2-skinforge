/**
 * Mods Domain IPC Handlers
 */

import { dialog, ipcMain, BrowserWindow } from 'electron'
import * as pipeline from '../services/pipelineService'
import * as dotaPathModule from '../services/dotaPathService'
import { storedModFolder } from '../services/settingsStore'

interface ProgressInfo {
  step: number
  total: number
  message: string
}

export function registerModsIpc(getMainWindow: () => BrowserWindow | null) {
  ipcMain.handle('check-status', async (_event, customPath?: string) => {
    const dotaPath = customPath || dotaPathModule.detectDotaPath()
    return pipeline.checkStatus(dotaPath, storedModFolder())
  })

  ipcMain.handle(
    'install-mods',
    async (
      _event,
      customPath?: string,
      equipped?: Record<string, Record<string, string>>,
      customizations?: import('../../shared/types/customization').HeroCustomizationsMap
    ) => {
      const dotaPath = customPath || dotaPathModule.detectDotaPath()
      const mainWindow = getMainWindow()
      return await pipeline.installMods(
        dotaPath,
        equipped || {},
        customizations || {},
        (progress: ProgressInfo) => {
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('install-progress', progress)
          }
        },
        { modFolder: storedModFolder() }
      )
    }
  )

  ipcMain.handle('uninstall-mods', async (_event, customPath?: string) => {
    const dotaPath = customPath || dotaPathModule.detectDotaPath()
    const mainWindow = getMainWindow()
    return pipeline.uninstallMods(
      dotaPath,
      (progress: ProgressInfo) => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('install-progress', progress)
        }
      },
      storedModFolder()
    )
  })

  ipcMain.handle('select-bundle-directory', async () => {
    const mainWindow = getMainWindow()
    if (!mainWindow) return null
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory'],
      title: 'Select a pack folder (hero folders with items_patch.txt inside)'
    })
    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths[0]
  })

  ipcMain.handle('install-bundle', async (_event, customPath?: string, bundleDir?: string) => {
    const dotaPath = customPath || dotaPathModule.detectDotaPath()
    if (!dotaPath) return { success: false, error: 'Dota 2 game directory not found.' }
    if (!bundleDir) return { success: false, error: 'No pack folder selected.' }

    const mainWindow = getMainWindow()
    return pipeline.installFromBundle(dotaPath, { bundleDir, modFolder: storedModFolder() }, (progress: ProgressInfo) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('install-progress', progress)
      }
    })
  })
}
