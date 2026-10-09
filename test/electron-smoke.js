const { app, BrowserWindow } = require('electron');
const path = require('path');
const { registerIpcHandlers } = require('../src/main/ipc');

app.whenReady().then(async () => {
  try {
    let win = null;
    registerIpcHandlers(() => win);
    const fs = require('fs');
    const hasOut = fs.existsSync(path.resolve(__dirname, '../out/renderer/index.html'));
    const preloadPath = hasOut
      ? fs.existsSync(path.resolve(__dirname, '../out/preload/index.mjs'))
        ? path.resolve(__dirname, '../out/preload/index.mjs')
        : path.resolve(__dirname, '../out/preload/index.js')
      : path.resolve(__dirname, '../src/preload/index.js');

    const htmlPath = hasOut
      ? path.resolve(__dirname, '../out/renderer/index.html')
      : path.resolve(__dirname, '../src/renderer/index.html');

    win = new BrowserWindow({
      show: false,
      webPreferences: {
        preload: preloadPath,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false,
      },
    });

    win.webContents.on('preload-error', (_e, p, err) => {
      console.error('Preload error at', p, err);
      process.exit(1);
    });

    win.webContents.on('console-message', (_e, level, msg) => {
      console.log('[Smoke Renderer]', msg);
    });

    await win.loadFile(htmlPath);
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
