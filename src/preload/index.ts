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
  selectBundleDirectory: () => ipcRenderer.invoke('select-bundle-directory'),
  installBundle: (customPath?: string, bundleDir?: string) => ipcRenderer.invoke('install-bundle', customPath, bundleDir),
  openExternal: (url: string) => ipcRenderer.invoke('open-external', url),
  launchDota: (launchArgs?: string) => ipcRenderer.invoke('launch-dota', launchArgs),
  readSettings: () => ipcRenderer.invoke('read-settings'),
  writeSettings: (settings: Record<string, unknown>) => ipcRenderer.invoke('write-settings', settings),
  getCacheStats: () => ipcRenderer.invoke('get-cache-stats'),
  clearIconCache: () => ipcRenderer.invoke('clear-icon-cache'),
  onInstallProgress: (cb: (progress: ProgressPayload) => void) =>
    ipcRenderer.on('install-progress', (_e, data: ProgressPayload) => cb(data)),
  checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
  downloadUpdate: (payload: { assetUrl: string; filename: string; expectedSha256?: string }) =>
    ipcRenderer.invoke('download-update', payload),
  installUpdate: (payload: { filePath: string; expectedSha256?: string }) => ipcRenderer.invoke('install-update', payload),
  getBugReportContext: (input?: { activeTab?: string; dotaFound?: boolean; modsInstalled?: boolean }) =>
    ipcRenderer.invoke('bug-report:context', input),
  captureBugScreenshot: () => ipcRenderer.invoke('bug-report:capture'),
  pickBugScreenshot: () => ipcRenderer.invoke('bug-report:pick-image'),
  submitBugReport: (input: unknown) => ipcRenderer.invoke('bug-report:submit', input),
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
