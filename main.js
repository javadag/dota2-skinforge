const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');

const dotaPathModule = require('./src/core/dotaPath');
const pipeline = require('./src/core/pipeline');
const appInfo = require('./src/config/appInfo');

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1340,
    height: 900,
    minWidth: 1100,
    minHeight: 700,
    backgroundColor: '#090b10',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    },
    autoHideMenuBar: true,
    show: false,
    title: `${appInfo.name} — ${appInfo.tagline}`,
    icon: path.join(__dirname, 'assets/icon.jpg')
  });

  mainWindow.webContents.on('preload-error', (_event, preloadPath, error) => {
    console.error('[Preload Error]', preloadPath, error);
  });

  mainWindow.webContents.on('console-message', (_event, level, message, line, sourceId) => {
    console.log(`[Renderer] ${message} (${sourceId}:${line})`);
  });

  mainWindow.loadFile(path.join(__dirname, 'src/index.html'));

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });
}

const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(() => {
    createWindow();
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
}

// ─── IPC: Initial Data ────────────────────────────────────────────────────────
ipcMain.handle('get-initial-data', async () => {
  const dotaPath = dotaPathModule.detectDotaPath();
  const status = pipeline.checkStatus(dotaPath);

  let heroesData = { heroes: [], groups: [] };
  const heroesJsonPath = path.join(__dirname, 'data/heroes.json');
  if (fs.existsSync(heroesJsonPath)) {
    try {
      heroesData = JSON.parse(fs.readFileSync(heroesJsonPath, 'utf8'));
    } catch (e) {
      console.error('Failed to read heroes.json:', e);
    }
  }

  return { appInfo, dotaPath, status, heroes: heroesData.heroes || [], groups: heroesData.groups || [] };
});

// ─── IPC: Status ─────────────────────────────────────────────────────────────
ipcMain.handle('check-status', async (_event, customPath) => {
  const dotaPath = customPath || dotaPathModule.detectDotaPath();
  return pipeline.checkStatus(dotaPath);
});

// ─── IPC: Directory Picker ───────────────────────────────────────────────────
ipcMain.handle('select-directory', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory'],
    title: 'Select Dota 2 Game Directory (e.g. .../dota 2 beta/game)'
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  const selected = result.filePaths[0];
  const isValid = dotaPathModule.isValidDotaGameDir(selected);
  return { path: selected, isValid };
});

// ─── IPC: Install ────────────────────────────────────────────────────────────
ipcMain.handle('install-mods', async (_event, customPath, equipped) => {
  const dotaPath = customPath || dotaPathModule.detectDotaPath();
  return await pipeline.installMods(dotaPath, equipped || {}, (progress) => {
    if (mainWindow) mainWindow.webContents.send('install-progress', progress);
  });
});

// ─── IPC: Uninstall ──────────────────────────────────────────────────────────
ipcMain.handle('uninstall-mods', async (_event, customPath) => {
  const dotaPath = customPath || dotaPathModule.detectDotaPath();
  return pipeline.uninstallMods(dotaPath, (progress) => {
    if (mainWindow) mainWindow.webContents.send('install-progress', progress);
  });
});

// ─── IPC: Open external URL ──────────────────────────────────────────────────
ipcMain.handle('open-external', async (_event, url) => {
  await shell.openExternal(url);
});

// ─── IPC: Read/Write Settings ────────────────────────────────────────────────
const settingsPath = path.join(app.getPath('userData'), 'skinforge_settings.json');

ipcMain.handle('read-settings', async () => {
  if (!fs.existsSync(settingsPath)) return {};
  try {
    return JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
  } catch (e) {
    return {};
  }
});

ipcMain.handle('write-settings', async (_event, settings) => {
  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf8');
  return { ok: true };
});
