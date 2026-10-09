/**
 * Master IPC Router
 */

import { BrowserWindow } from 'electron'
import { registerModsIpc } from './modsIpc'
import { registerSettingsIpc } from './settingsIpc'
import { registerSystemIpc } from './systemIpc'

export function registerIpcHandlers(getMainWindow: () => BrowserWindow | null) {
  registerModsIpc(getMainWindow)
  registerSettingsIpc(getMainWindow)
  registerSystemIpc()
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { registerIpcHandlers }
}
