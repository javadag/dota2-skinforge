/**
 * Dota 2 SkinForge — Secure Electron Preload Bridge
 */

import { contextBridge, ipcRenderer } from 'electron'
import { APP_CONFIG } from '../shared/constants/appConfig'
import { HERO_ALIASES, getCanonicalHero } from '../shared/constants/heroAliases'

interface ProgressPayload {
  step: number
  total: number
  message: string
}

interface UpdateProgressPayload {
  percent: number
  bytesReceived: number
  totalBytes: number
  speedBytesPerSec: number
}

const api = {
  appInfo: APP_CONFIG,
  getInitialData: () => ipcRenderer.invoke('get-initial-data'),
  checkStatus: (customPath?: string) => ipcRenderer.invoke('check-status', customPath),
  selectDirectory: () => ipcRenderer.invoke('select-directory'),
  installMods: (customPath?: string, equipped?: Record<string, unknown>, customizations?: Record<string, unknown>) =>
    ipcRenderer.invoke('install-mods', customPath, equipped, customizations),
  uninstallMods: (customPath?: string) => ipcRenderer.invoke('uninstall-mods', customPath),
  openExternal: (url: string) => ipcRenderer.invoke('open-external', url),
  readSettings: () => ipcRenderer.invoke('read-settings'),
  writeSettings: (settings: Record<string, unknown>) => ipcRenderer.invoke('write-settings', settings),
  getCacheStats: () => ipcRenderer.invoke('get-cache-stats'),
  clearIconCache: () => ipcRenderer.invoke('clear-icon-cache'),
  onInstallProgress: (cb: (progress: ProgressPayload) => void) =>
    ipcRenderer.on('install-progress', (_e, data: ProgressPayload) => cb(data)),
  checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
  downloadUpdate: (payload: { assetUrl: string; filename: string }) => ipcRenderer.invoke('download-update', payload),
  installUpdate: (payload: { filePath: string }) => ipcRenderer.invoke('install-update', payload),
  onUpdateProgress: (cb: (progress: UpdateProgressPayload) => void) => {
    const listener = (_e: Electron.IpcRendererEvent, data: UpdateProgressPayload) => cb(data)
    ipcRenderer.on('update-download-progress', listener)
    return () => {
      ipcRenderer.removeListener('update-download-progress', listener)
    }
  }
}

contextBridge.exposeInMainWorld('appInfo', APP_CONFIG)
contextBridge.exposeInMainWorld('heroAliases', { HERO_ALIASES, getCanonicalHero })
contextBridge.exposeInMainWorld('skinforge', api)
