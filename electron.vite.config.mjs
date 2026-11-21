import { resolve, extname } from 'path'
import fs from 'fs'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import commonjs from '@rollup/plugin-commonjs'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'

const projectRoot = import.meta.dirname

const STATIC_MIME_TYPES = {
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.json': 'application/json; charset=utf-8',
  '.ico': 'image/x-icon'
}

function serveStaticFolder(prefix, folderPath) {
  return {
    name: `serve-static-${prefix}`,
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const cleanUrl = req.url.split('?')[0]
        if (cleanUrl.startsWith(`/${prefix}/`) || cleanUrl.startsWith(`/../${prefix}/`)) {
          const match = cleanUrl.match(new RegExp(`(?:^|\\.\\./)${prefix}/(.+)`))
          const subPath = decodeURIComponent(match ? match[1] : cleanUrl.slice(prefix.length + 2))
          const filePath = resolve(folderPath, subPath)
          if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
            const ext = extname(filePath).toLowerCase()
            if (STATIC_MIME_TYPES[ext]) {
              res.setHeader('Content-Type', STATIC_MIME_TYPES[ext])
            }
            res.setHeader('Access-Control-Allow-Origin', '*')
            return fs.createReadStream(filePath).pipe(res)
          }
        }
        next()
      })
    }
  }
}

function copyStaticFolderPlugin(items, cleanDirs = []) {
  return {
    name: 'copy-static-assets-on-build',
    closeBundle() {
      for (const dir of cleanDirs) {
        fs.rmSync(dir, { recursive: true, force: true })
      }
      for (const { src, dests } of items) {
        if (!fs.existsSync(src)) continue
        for (const dest of dests) {
          fs.mkdirSync(fs.statSync(src).isFile() ? resolve(dest, '..') : dest, { recursive: true })
          fs.cpSync(src, dest, { recursive: true })
        }
      }
    }
  }
}

function tightenProductionCspPlugin() {
  return {
    name: 'tighten-production-csp',
    apply: 'build',
    transformIndexHtml: {
      order: 'post',
      handler(html) {
        return html.replace("script-src 'self' 'unsafe-inline'", "script-src 'self'")
      }
    }
  }
}

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin(), commonjs()],
    build: {
      rollupOptions: {
        input: {
          index: resolve(projectRoot, 'src/main/index.ts')
        }
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin(), commonjs()],
    build: {
      rollupOptions: {
        input: {
          index: resolve(projectRoot, 'src/preload/index.ts')
        }
      }
    }
  },
  renderer: {
    root: resolve(projectRoot, 'src/renderer'),
    plugins: [
      react(),
      tailwindcss(),
      serveStaticFolder('assets', resolve(projectRoot, 'assets')),
      copyStaticFolderPlugin(
        [
          {
            src: resolve(projectRoot, 'assets/icon.png'),
            dests: [resolve(projectRoot, 'out/renderer/assets/icon.png')]
          },
          {
            src: resolve(projectRoot, 'assets/heroes'),
            dests: [resolve(projectRoot, 'out/assets/heroes')]
          },
          {
            src: resolve(projectRoot, 'assets/categories'),
            dests: [resolve(projectRoot, 'out/assets/categories')]
          }
        ],
        [
          resolve(projectRoot, 'out/assets'),
          resolve(projectRoot, 'out/data'),
          resolve(projectRoot, 'out/renderer/assets'),
          resolve(projectRoot, 'out/renderer/data')
        ]
      ),
      tightenProductionCspPlugin()
    ],
    server: {
      fs: {
        allow: [projectRoot]
      }
    },
    build: {
      rollupOptions: {
        input: {
          index: resolve(projectRoot, 'src/renderer/index.html')
        }
      }
    }
  }
})
