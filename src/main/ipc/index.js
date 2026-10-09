/**
 * Master IPC Router
 */

const { registerModsIpc } = require('./modsIpc');
const { registerSettingsIpc } = require('./settingsIpc');
const { registerSystemIpc } = require('./systemIpc');

function registerIpcHandlers(getMainWindow) {
  registerModsIpc(getMainWindow);
  registerSettingsIpc(getMainWindow);
  registerSystemIpc();
}

module.exports = {
  registerIpcHandlers,
};
