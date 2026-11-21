/**
 * Dota 2 SkinForge — Electron Main Process Entry
 */

import { app, BrowserWindow, shell } from 'electron'
import fs from 'fs'
import path from 'path'
import { APP_CONFIG } from '../shared/constants/appConfig'
import { registerIpcHandlers } from './ipc'
import { getAssetsPath, loadLocalEnvFile } from './services/app/appPaths'
import { installMainErrorCapture } from './services/app/bugReportService'
import { migrateLegacySettings } from './services/app/settingsService'
import { ensureIconPack, registerIconProtocol, registerIconScheme } from './services/assets/iconPackService'

// Load local .env overrides (e.g. SKINFORGE_ASSET_SOURCE) in unpackaged dev/preview runs
loadLocalEnvFile()

// Start collecting main-process errors early so bug reports can include them
installMainErrorCapture()

// Explicitly ensure consistent userData path between dev (terminal) and packaged exe
app.setName(APP_CONFIG.name)

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
  return fs.existsSync(icoPath) ? icoPath : getAssetsPath('icon.png')
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
      sandbox: true
    },
    autoHideMenuBar: true,
    show: false,
    title: `${APP_CONFIG.name} — ${APP_CONFIG.tagline}`,
    icon: getAppIconPath()
  })

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    try {
      const parsed = new URL(url)
      if (parsed.protocol === 'https:' || parsed.protocol === 'steam:') {
        void shell.openExternal(url).catch(() => {})
      }
    } catch {
      // Ignore malformed URLs
    }
    return { action: 'deny' }
  })

  const rendererDirUrl = `file:///${path.resolve(__dirname, '../renderer').replace(/\\/g, '/').toLowerCase()}/`
  mainWindow.webContents.on('will-navigate', (event, targetUrl) => {
    const devUrl = process.env.ELECTRON_RENDERER_URL
    try {
      const parsed = new URL(targetUrl)
      if (devUrl && parsed.origin === new URL(devUrl).origin) return
      if (!devUrl && parsed.protocol === 'file:' && targetUrl.replace(/\\/g, '/').toLowerCase().startsWith(rendererDirUrl)) return
    } catch {
      // Block malformed navigation URLs
    }
    event.preventDefault()
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

  app
    .whenReady()
    .then(() => {
      migrateLegacySettings()
      registerIconProtocol()

      registerIpcHandlers(() => mainWindow)

      // Start extracting the bundled icon pack while the window boots instead of
      // waiting for the first icon request.
      void ensureIconPack()
      createWindow()

      app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow()
      })
    })
    .catch((err) => {
      console.error('[Main] Failed to initialize application:', err)
    })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })
}
