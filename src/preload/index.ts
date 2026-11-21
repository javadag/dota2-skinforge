/**
 * Dota 2 SkinForge — Secure Electron Preload Bridge
 */

import { contextBridge, ipcRenderer } from 'electron'
import { APP_CONFIG } from '../shared/constants/appConfig'
import { IPC_CHANNELS, type SkinforgeBridge, type StepProgress, type UpdateDownloadProgress } from '../shared/types/ipc'

const api: SkinforgeBridge = {
  getInitialData: () => ipcRenderer.invoke(IPC_CHANNELS.systemGetInitialData),
  checkStatus: (customPath) => ipcRenderer.invoke(IPC_CHANNELS.modsCheckStatus, customPath),
  selectDirectory: () => ipcRenderer.invoke(IPC_CHANNELS.settingsSelectDotaDir),
  getHeroAbilityIcons: (customPath, hero, slots, styles) =>
    ipcRenderer.invoke(IPC_CHANNELS.modsGetHeroAbilityIcons, customPath, hero, slots, styles),
  installMods: (customPath, equipped, customizations, abilityIcons) =>
    ipcRenderer.invoke(IPC_CHANNELS.modsInstall, customPath, equipped, customizations, abilityIcons),
  uninstallMods: (customPath) => ipcRenderer.invoke(IPC_CHANNELS.modsUninstall, customPath),
  openExternal: (url) => ipcRenderer.invoke(IPC_CHANNELS.systemOpenExternal, url),
  launchDota: (launchArgs) => ipcRenderer.invoke(IPC_CHANNELS.systemLaunchDota, launchArgs),
  readSettings: () => ipcRenderer.invoke(IPC_CHANNELS.settingsRead),
  writeSettings: (settings) => ipcRenderer.invoke(IPC_CHANNELS.settingsWrite, settings),
  getCacheStats: () => ipcRenderer.invoke(IPC_CHANNELS.settingsGetIconPackStats),
  clearIconCache: () => ipcRenderer.invoke(IPC_CHANNELS.settingsResetIconPacks),
  onInstallProgress: (cb) => {
    const listener = (_e: Electron.IpcRendererEvent, data: StepProgress) => cb(data)
    ipcRenderer.on(IPC_CHANNELS.modsInstallProgress, listener)
    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.modsInstallProgress, listener)
    }
  },
  checkForUpdates: () => ipcRenderer.invoke(IPC_CHANNELS.updateCheck),
  getReleaseNotes: (version) => ipcRenderer.invoke(IPC_CHANNELS.updateGetReleaseNotes, version),
  downloadUpdate: (payload) => ipcRenderer.invoke(IPC_CHANNELS.updateDownload, payload),
  installUpdate: (payload) => ipcRenderer.invoke(IPC_CHANNELS.updateInstall, payload),
  getBugReportContext: (input) => ipcRenderer.invoke(IPC_CHANNELS.bugReportContext, input),
  captureBugScreenshot: () => ipcRenderer.invoke(IPC_CHANNELS.bugReportCaptureScreenshot),
  pickBugScreenshot: () => ipcRenderer.invoke(IPC_CHANNELS.bugReportPickScreenshot),
  submitBugReport: (input) => ipcRenderer.invoke(IPC_CHANNELS.bugReportSubmit, input),
  listBugReports: () => ipcRenderer.invoke(IPC_CHANNELS.bugReportList),
  commentOnBugReport: (input) => ipcRenderer.invoke(IPC_CHANNELS.bugReportComment, input),
  onUpdateProgress: (cb) => {
    const listener = (_e: Electron.IpcRendererEvent, data: UpdateDownloadProgress) => cb(data)
    ipcRenderer.on(IPC_CHANNELS.updateDownloadProgress, listener)
    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.updateDownloadProgress, listener)
    }
  }
}

contextBridge.exposeInMainWorld('appInfo', APP_CONFIG)
contextBridge.exposeInMainWorld('skinforge', api)
