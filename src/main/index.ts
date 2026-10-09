/**
 * Dota 2 SkinForge — Electron Main Process Entry
 */

import { app, BrowserWindow } from 'electron'
import fs from 'fs'
import path from 'path'
import { APP_CONFIG } from '../shared/constants/appConfig'
import { registerIpcHandlers } from './ipc'
import { registerIconScheme, registerIconProtocol } from './services/iconCacheService'
import { getAssetsPath } from './services/appPathService'

// Register skinforge-icon scheme as standard and privileged
registerIconScheme()

let mainWindow: BrowserWindow | null = null

function getPreloadPath() {
  const mjsPath = path.join(__dirname, '../preload/index.mjs')
  if (fs.existsSync(mjsPath)) return mjsPath
  const jsPath = path.join(__dirname, '../preload/index.js')
  if (fs.existsSync(jsPath)) return jsPath
  return path.resolve(__dirname, '../preload/index.js')
}

function getAppIconPath(): string {
  const icoPath = getAssetsPath('icon.ico')
  if (fs.existsSync(icoPath)) return icoPath
  const pngPath = getAssetsPath('icon.png')
  if (fs.existsSync(pngPath)) return pngPath
  return getAssetsPath('icon.jpg')
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1340,
    height: 900,
    minWidth: 1100,
    minHeight: 700,
    backgroundColor: '#090b10',
    webPreferences: {
      preload: getPreloadPath(),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    },
    autoHideMenuBar: true,
    show: false,
    title: `${APP_CONFIG.name} — ${APP_CONFIG.tagline}`,
    icon: getAppIconPath()
  })

  mainWindow.webContents.on('preload-error', (_event, preloadPath, error) => {
    console.error('[Preload Error]', preloadPath, error)
  })

  mainWindow.webContents.on('console-message', (_event, level, message, line, sourceId) => {
    console.log(`[Renderer] ${message} (${sourceId}:${line})`)
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'))
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show()
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

const gotTheLock = app.requestSingleInstanceLock()

if (!gotTheLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
    }
  })

  app.whenReady().then(() => {
    const settingsFile = path.join(app.getPath('userData'), 'skinforge_settings.json')
    registerIconProtocol(() => {
      try {
        if (fs.existsSync(settingsFile)) {
          return JSON.parse(fs.readFileSync(settingsFile, 'utf8'))
        }
      } catch {
        // Fallback to empty settings
      }
      return {}
    })

    registerIpcHandlers(() => mainWindow)
    createWindow()

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })
}
