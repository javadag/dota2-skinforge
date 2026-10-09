/**
 * System Domain IPC Handlers
 */

const { ipcMain, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const dotaPathModule = require('../services/dotaPathService');
const pipeline = require('../services/pipelineService');
const { APP_CONFIG } = require('../../shared/constants/appConfig');

function registerSystemIpc() {
  ipcMain.handle('get-initial-data', async () => {
    const dotaPath = dotaPathModule.detectDotaPath();
    const status = pipeline.checkStatus(dotaPath);

    let heroesData = { heroes: [], groups: [] };
    const heroesJsonPath = path.resolve(__dirname, '../../../data/heroes.json');
    if (fs.existsSync(heroesJsonPath)) {
      try {
        heroesData = JSON.parse(fs.readFileSync(heroesJsonPath, 'utf8'));
      } catch (e) {
        console.error('Failed to read heroes.json:', e);
      }
    }

    return {
      appInfo: APP_CONFIG,
      dotaPath,
      status,
      heroes: heroesData.heroes || [],
      groups: heroesData.groups || [],
    };
  });

  ipcMain.handle('open-external', async (_event, url) => {
    if (
      url &&
      (url.startsWith('https://') || url.startsWith('http://') || url.startsWith('steam://'))
    ) {
      await shell.openExternal(url);
    }
  });
}

module.exports = {
  registerSystemIpc,
};
