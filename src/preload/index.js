/**
 * Dota 2 SkinForge — Secure Electron Preload Bridge
 */

const { contextBridge, ipcRenderer } = require('electron');
const { APP_CONFIG } = require('../shared/constants/appConfig');

const api = {
  appInfo: APP_CONFIG,
  getInitialData: () => ipcRenderer.invoke('get-initial-data'),
  checkStatus: (p) => ipcRenderer.invoke('check-status', p),
  selectDirectory: () => ipcRenderer.invoke('select-directory'),
  installMods: (p, equipped) => ipcRenderer.invoke('install-mods', p, equipped),
  uninstallMods: (p) => ipcRenderer.invoke('uninstall-mods', p),
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
  readSettings: () => ipcRenderer.invoke('read-settings'),
  writeSettings: (s) => ipcRenderer.invoke('write-settings', s),
  onInstallProgress: (cb) => ipcRenderer.on('install-progress', (_e, d) => cb(d))
};

contextBridge.exposeInMainWorld('appInfo', APP_CONFIG);
contextBridge.exposeInMainWorld('skinforge', api);
