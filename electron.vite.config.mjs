import { resolve } from 'path';
import fs from 'fs';
import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import commonjs from '@rollup/plugin-commonjs';

const projectRoot = import.meta.dirname;

function serveStaticFolder(prefix, folderPath) {
  return {
    name: `serve-static-${prefix}`,
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const cleanUrl = req.url.split('?')[0];
        if (cleanUrl.startsWith(`/${prefix}/`)) {
          const subPath = decodeURIComponent(cleanUrl.slice(prefix.length + 2));
          const filePath = resolve(folderPath, subPath);
          if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
            return fs.createReadStream(filePath).pipe(res);
          }
        }
        next();
      });
    },
  };
}

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin(), commonjs()],
    build: {
      rollupOptions: {
        input: {
          index: resolve(projectRoot, 'src/main/index.js'),
        },
      },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin(), commonjs()],
    build: {
      rollupOptions: {
        input: {
          index: resolve(projectRoot, 'src/preload/index.js'),
        },
      },
    },
  },
  renderer: {
    root: resolve(projectRoot, 'src/renderer'),
    plugins: [
      serveStaticFolder('assets', resolve(projectRoot, 'assets')),
      serveStaticFolder('data', resolve(projectRoot, 'data')),
    ],
    server: {
      fs: {
        allow: [projectRoot],
      },
    },
    build: {
      rollupOptions: {
        input: {
          index: resolve(projectRoot, 'src/renderer/index.html'),
        },
      },
    },
  },
});
