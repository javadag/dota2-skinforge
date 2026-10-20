/**
 * Master IPC Router
 */

import { BrowserWindow } from 'electron'
import { registerModsIpc } from './modsIpc'
import { registerSettingsIpc } from './settingsIpc'
import { registerSystemIpc } from './systemIpc'
import { registerUpdateIpc } from './updateIpc'

export function registerIpcHandlers(getMainWindow: () => BrowserWindow | null) {
  registerModsIpc(getMainWindow)
  registerSettingsIpc(getMainWindow)
  registerSystemIpc()
  registerUpdateIpc(getMainWindow)
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { registerIpcHandlers }
}
