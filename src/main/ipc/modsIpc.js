/**
 * Mods Domain IPC Handlers
 */

const { ipcMain } = require('electron');
const pipeline = require('../services/pipelineService');
const dotaPathModule = require('../services/dotaPathService');

function registerModsIpc(getMainWindow) {
  ipcMain.handle('check-status', async (_event, customPath) => {
    const dotaPath = customPath || dotaPathModule.detectDotaPath();
    return pipeline.checkStatus(dotaPath);
  });

  ipcMain.handle('install-mods', async (_event, customPath, equipped) => {
    const dotaPath = customPath || dotaPathModule.detectDotaPath();
    const mainWindow = getMainWindow();
    return await pipeline.installMods(dotaPath, equipped || {}, (progress) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('install-progress', progress);
      }
    });
  });

  ipcMain.handle('uninstall-mods', async (_event, customPath) => {
    const dotaPath = customPath || dotaPathModule.detectDotaPath();
    const mainWindow = getMainWindow();
    return pipeline.uninstallMods(dotaPath, (progress) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('install-progress', progress);
      }
    });
  });
}

module.exports = {
  registerModsIpc,
};
