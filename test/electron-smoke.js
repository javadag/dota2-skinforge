const { app, BrowserWindow } = require('electron');
const path = require('path');
const { registerIpcHandlers } = require('../src/main/ipc');

app.whenReady().then(async () => {
  try {
    let win = null;
    registerIpcHandlers(() => win);
    win = new BrowserWindow({
      show: false,
      webPreferences: {
        preload: path.resolve(__dirname, '../src/preload/index.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false
      }
    });

    win.webContents.on('preload-error', (_e, preloadPath, err) => {
      console.error('Preload error at', preloadPath, err);
      process.exit(1);
    });

    win.webContents.on('console-message', (_e, level, msg) => {
      console.log('[Smoke Renderer]', msg);
    });

    await win.loadFile(path.resolve(__dirname, '../src/index.html'));
    console.log('Electron smoke test: window loaded without crash!');

    setTimeout(() => {
      console.log('Smoke test passed cleanly.');
      app.quit();
      process.exit(0);
    }, 2000);
  } catch (err) {
    console.error('Smoke test error:', err);
    process.exit(1);
  }
});
