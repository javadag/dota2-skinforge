/**
 * Settings & Preferences Domain IPC Handlers
 */

const { ipcMain, dialog, app } = require('electron');
const path = require('path');
const fs = require('fs');
const dotaPathModule = require('../services/dotaPathService');

function registerSettingsIpc(getMainWindow) {
  const settingsPath = path.join(app.getPath('userData'), 'skinforge_settings.json');

  ipcMain.handle('select-directory', async () => {
    const mainWindow = getMainWindow();
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory'],
      title: 'Select Dota 2 Game Directory (e.g. .../dota 2 beta/game)',
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    const selected = result.filePaths[0];
    const isValid = dotaPathModule.isValidDotaGameDir(selected);
    return { path: selected, isValid };
  });

  ipcMain.handle('read-settings', async () => {
    if (!fs.existsSync(settingsPath)) return {};
    try {
      return JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
    } catch (e) {
      return {};
    }
  });

  ipcMain.handle('write-settings', async (_event, settings) => {
    try {
      fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf8');
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  });
}

module.exports = {
  registerSettingsIpc,
};
