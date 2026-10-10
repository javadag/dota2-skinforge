const { app, BrowserWindow } = require('electron')
const path = require('path')
const { registerIpcHandlers } = require('../src/main/ipc')
const { registerIconProtocol } = require('../src/main/services/iconCacheService')

app.whenReady().then(async () => {
  try {
    let win = null
    registerIconProtocol(() => ({}))
    registerIpcHandlers(() => win)
    const fs = require('fs')
    const hasOut = fs.existsSync(path.resolve(__dirname, '../out/renderer/index.html'))
    const preloadPath = hasOut
      ? fs.existsSync(path.resolve(__dirname, '../out/preload/index.mjs'))
        ? path.resolve(__dirname, '../out/preload/index.mjs')
        : path.resolve(__dirname, '../out/preload/index.js')
      : path.resolve(__dirname, '../src/preload/index.js')

    const htmlPath = hasOut ? path.resolve(__dirname, '../out/renderer/index.html') : path.resolve(__dirname, '../src/renderer/index.html')

    win = new BrowserWindow({
      show: false,
      webPreferences: {
        preload: preloadPath,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false
      }
    })

    win.webContents.on('preload-error', (_e, p, err) => {
      console.error('Preload error at', p, err)
      process.exit(1)
    })

    let heroesLoadedCount = -1
    win.webContents.on('console-message', (_e, level, msg) => {
      console.log('[Smoke Renderer]', msg)
      const match = msg.match(/Loaded (\d+) heroes/)
      if (match) {
        heroesLoadedCount = parseInt(match[1], 10)
      }
    })

    await win.loadFile(htmlPath)
    await win.webContents.executeJavaScript(`
      window.addEventListener('error', (e) => {
        const el = e.target;
        if (el && el.tagName === 'IMG') {
          console.log('[Img Error Element]', el.src, el.className, el.parentElement ? el.parentElement.className : '');
        } else {
          console.log('[Window Error Event]', e.message, e.filename, e.lineno);
        }
      }, true);
    `)
    console.log('Electron smoke test: window loaded without crash!')

    setTimeout(async () => {
      if (heroesLoadedCount !== 127) {
        console.error(`Expected 127 entries loaded in smoke test, but got ${heroesLoadedCount}`)
        process.exit(1)
      }
      console.log(`Smoke test passed cleanly: verified ${heroesLoadedCount} heroes loaded.`)

      try {
        const stats = await win.webContents.executeJavaScript(`
          (() => {
            const thumbs = Array.from(document.querySelectorAll('.hero-item-thumb'));
            const loaded = thumbs.filter(img => img.naturalWidth > 0).length;
            return { total: thumbs.length, loaded };
          })()
        `)
        console.log(`[Smoke Verification] Hero images in DOM: ${stats.total}, loaded successfully: ${stats.loaded}`)
        if (stats.total < 120 || stats.loaded < stats.total) {
          console.error(`Image verification failed: expected all hero images loaded, got ${stats.loaded}/${stats.total}`)
          process.exit(1)
        }

        const slotStats = await win.webContents.executeJavaScript(`
          (async () => {
            const firstHero = document.querySelector('.hero-list-item');
            if (firstHero) firstHero.click();
            await new Promise(r => setTimeout(r, 600));
            const slotImgs = Array.from(document.querySelectorAll('.slot-thumb-img'));
            const loaded = slotImgs.filter(img => img.naturalWidth > 0).length;
            return { total: slotImgs.length, loaded };
          })()
        `)
        console.log(`[Smoke Verification] Slot images in DOM: ${slotStats.total}, loaded successfully: ${slotStats.loaded}`)
        if (slotStats.total === 0 || slotStats.loaded < slotStats.total) {
          console.error(`Slot image verification failed: got ${slotStats.loaded}/${slotStats.total}`)
          process.exit(1)
        }

        const modalStats = await win.webContents.executeJavaScript(`
          (async () => {
            const firstSlot = document.querySelector('.slot-card');
            if (firstSlot) firstSlot.click();
            await new Promise(r => setTimeout(r, 600));
            const modalImgs = Array.from(document.querySelectorAll('.sio-thumb-img'));
            const loadedModalImgs = modalImgs.filter(img => img.naturalWidth > 0).length;
            return { totalModalImgs: modalImgs.length, loadedModalImgs };
          })()
        `)
        console.log(
          `[Smoke Verification] Modal item images in DOM: ${modalStats.totalModalImgs}, loaded successfully: ${modalStats.loadedModalImgs}`
        )
        if (modalStats.totalModalImgs === 0 || modalStats.loadedModalImgs < modalStats.totalModalImgs) {
          console.error(`Modal item image verification failed: got ${modalStats.loadedModalImgs}/${modalStats.totalModalImgs}`)
          process.exit(1)
        }

        const filterStats = await win.webContents.executeJavaScript(`
          (async () => {
            const list = document.getElementById('slotModalList');
            const gridCols = window.getComputedStyle(list).gridTemplateColumns.split(' ').length;
            const allCount = document.querySelectorAll('.slot-item-option').length;

            const mythBtn = document.querySelector('.mrf-btn[data-rarity="mythical"]');
            if (mythBtn) mythBtn.click();
            await new Promise(r => setTimeout(r, 100));
            const mythCount = document.querySelectorAll('.slot-item-option').length;
            const mythActive = mythBtn ? mythBtn.classList.contains('active') : false;

            const allBtn = document.querySelector('.mrf-btn[data-rarity="all"]');
            if (allBtn) allBtn.click();
            await new Promise(r => setTimeout(r, 100));
            const resetCount = document.querySelectorAll('.slot-item-option').length;

            return { gridCols, allCount, mythCount, mythActive, resetCount };
          })()
        `)
        console.log(
          `[Smoke Verification] Grid columns: ${filterStats.gridCols}, Initial count: ${filterStats.allCount}, Mythical filter count: ${filterStats.mythCount}, Reset count: ${filterStats.resetCount}`
        )
        if (filterStats.gridCols !== 2) {
          console.error(`Expected 2 grid columns for slot modal, got \${filterStats.gridCols}`)
          process.exit(1)
        }
        if (!filterStats.mythActive || filterStats.resetCount !== filterStats.allCount) {
          console.error('Filter toggle verification failed')
          process.exit(1)
        }

        // Test Non-Hero Category: World -> Courier
        const nonHeroStats = await win.webContents.executeJavaScript(`
          (async () => {
            const closeBtn = document.getElementById('slotModalClose');
            if (closeBtn) closeBtn.click();
            await new Promise(r => setTimeout(r, 200));

            const navWorld = document.getElementById('navWorld');
            if (navWorld) navWorld.click();
            await new Promise(r => setTimeout(r, 300));

            const listItems = Array.from(document.querySelectorAll('.hero-list-item'));
            const courierItem = listItems.find(it => it.textContent.toLowerCase().includes('courier'));
            if (courierItem) courierItem.click();
            await new Promise(r => setTimeout(r, 400));

            const slotCards = Array.from(document.querySelectorAll('.slot-card'));
            const slotImgs = Array.from(document.querySelectorAll('.slot-thumb-img'));
            await Promise.all(slotImgs.map(img => img.complete && img.naturalWidth > 0 ? Promise.resolve() : new Promise(r => { img.onload = r; img.onerror = r; setTimeout(r, 800); })));
            const slotLoaded = slotImgs.filter(img => img.naturalWidth > 0).length;

            if (slotCards.length > 0) slotCards[0].click();
            await new Promise(r => setTimeout(r, 600));

            const modalImgs = Array.from(document.querySelectorAll('.sio-thumb-img'));
            await Promise.all(modalImgs.map(img => img.complete ? Promise.resolve() : new Promise(r => { img.onload = r; img.onerror = r; setTimeout(r, 1200); })));
            const modalLoaded = modalImgs.filter(img => img.naturalWidth > 0).length;

            return {
              courierFound: !!courierItem,
              slotCount: slotCards.length,
              slotLoaded,
              slotTotal: slotImgs.length,
              modalTotal: modalImgs.length,
              modalLoaded,
              modalSources: modalImgs.map(i => ({ src: i.src, w: i.naturalWidth }))
            };
          })()
        `)

        console.log(
          '[Smoke Verification Non-Hero]',
          JSON.stringify({
            courierFound: nonHeroStats.courierFound,
            slotCount: nonHeroStats.slotCount,
            slotLoaded: nonHeroStats.slotLoaded,
            slotTotal: nonHeroStats.slotTotal,
            modalTotal: nonHeroStats.modalTotal,
            modalLoaded: nonHeroStats.modalLoaded
          })
        )
        if (nonHeroStats.slotLoaded < nonHeroStats.slotTotal || nonHeroStats.modalLoaded < nonHeroStats.modalTotal) {
          console.error('Courier slot or modal image verification failed')
          process.exit(1)
        }

        // Test Non-Hero Category: Creeps
        const creepsStats = await win.webContents.executeJavaScript(`
          (async () => {
            const closeBtn = document.getElementById('slotModalClose');
            if (closeBtn) closeBtn.click();
            const navWorld = document.getElementById('navWorld');
            if (navWorld) navWorld.click();
            await new Promise(r => setTimeout(r, 300));

            const listItems = Array.from(document.querySelectorAll('.hero-list-item'));
            const creepsItem = listItems.find(it => it.textContent.toLowerCase().includes('creeps'));
            if (creepsItem) creepsItem.click();
            await new Promise(r => setTimeout(r, 400));

            const slotCards = Array.from(document.querySelectorAll('.slot-card'));
            const slotImgs = Array.from(document.querySelectorAll('.slot-thumb-img'));
            await Promise.all(slotImgs.map(img => img.complete && img.naturalWidth > 0 ? Promise.resolve() : new Promise(r => { img.onload = r; img.onerror = r; setTimeout(r, 800); })));
            const slotLoaded = slotImgs.filter(img => img.naturalWidth > 0).length;

            if (slotCards.length > 0) slotCards[0].click();
            await new Promise(r => setTimeout(r, 600));

            const modalImgs = Array.from(document.querySelectorAll('.sio-thumb-img'));
            await Promise.all(modalImgs.map(img => img.complete ? Promise.resolve() : new Promise(r => { img.onload = r; img.onerror = r; setTimeout(r, 1200); })));
            const modalLoaded = modalImgs.filter(img => img.naturalWidth > 0).length;

            return {
              creepsFound: !!creepsItem,
              slotCount: slotCards.length,
              slotLoaded,
              slotTotal: slotImgs.length,
              modalTotal: modalImgs.length,
              modalLoaded
            };
          })()
        `)

        console.log('[Smoke Verification Creeps]', JSON.stringify(creepsStats))
        if (
          !creepsStats.creepsFound ||
          creepsStats.slotLoaded < creepsStats.slotTotal ||
          creepsStats.modalLoaded < creepsStats.modalTotal
        ) {
          console.error('Creeps slot or modal image verification failed')
          process.exit(1)
        }

        // Test Non-Hero Category: HUDs
        const hudStats = await win.webContents.executeJavaScript(`
          (async () => {
            const closeBtn = document.getElementById('slotModalClose');
            if (closeBtn) closeBtn.click();
            await new Promise(r => setTimeout(r, 200));

            const navInterface = document.getElementById('navInterface');
            if (navInterface) navInterface.click();
            await new Promise(r => setTimeout(r, 300));

            const listItems = Array.from(document.querySelectorAll('.hero-list-item'));
            const hudItem = listItems.find(it => {
              const name = it.querySelector('.hero-item-name')?.textContent.toLowerCase() || '';
              return name.includes('hud');
            });
            if (hudItem) hudItem.click();
            await new Promise(r => setTimeout(r, 400));

            const slotCards = Array.from(document.querySelectorAll('.slot-card'));
            if (slotCards.length > 0) slotCards[0].click();
            await new Promise(r => setTimeout(r, 600));

            const modalImgs = Array.from(document.querySelectorAll('.sio-thumb-img'));
            const modalLoaded = modalImgs.filter(img => img.naturalWidth > 0).length;

            return {
              hudFound: !!hudItem,
              hudName: hudItem ? hudItem.textContent.trim().replace(/\\s+/g, ' ') : null,
              slotCount: slotCards.length,
              slotNames: slotCards.map(s => s.querySelector('.slot-name')?.textContent),
              modalTotal: modalImgs.length,
              modalLoaded
            };
          })()
        `)
        console.log('[Smoke Verification HUDs]', JSON.stringify(hudStats))
        if (!hudStats.hudFound || hudStats.modalTotal < 90 || hudStats.modalLoaded < hudStats.modalTotal) {
          console.error('HUDs slot or modal image verification failed')
          process.exit(1)
        }

        // Test Non-Hero Category: Loading Screens
        const loadingStats = await win.webContents.executeJavaScript(`
          (async () => {
            const closeBtn = document.getElementById('slotModalClose');
            if (closeBtn) closeBtn.click();
            await new Promise(r => setTimeout(r, 200));

            const listItems = Array.from(document.querySelectorAll('.hero-list-item'));
            const lsItem = listItems.find(it => {
              const name = it.querySelector('.hero-item-name')?.textContent.toLowerCase() || '';
              return name.includes('loadscreen') || name.includes('loading');
            });
            if (lsItem) lsItem.click();
            await new Promise(r => setTimeout(r, 400));

            const slotCards = Array.from(document.querySelectorAll('.slot-card'));
            if (slotCards.length > 0) slotCards[0].click();
            await new Promise(r => setTimeout(r, 800));

            const modalImgs = Array.from(document.querySelectorAll('.sio-thumb-img'));
            const modalLoaded = modalImgs.filter(img => img.naturalWidth > 0).length;

            return {
              lsFound: !!lsItem,
              modalTotal: modalImgs.length,
              modalLoaded
            };
          })()
        `)
        console.log('[Smoke Verification Loadings]', JSON.stringify(loadingStats))
        if (!loadingStats.lsFound || loadingStats.modalTotal < 2000 || loadingStats.modalLoaded < 15) {
          console.error('Loading screens slot or modal image verification failed')
          process.exit(1)
        }
      } catch (err) {
        console.error('Image verification evaluation error:', err)
        process.exit(1)
      }

      app.quit()
      process.exit(0)
    }, 2500)
  } catch (err) {
    console.error('Smoke test error:', err)
    process.exit(1)
  }
})
