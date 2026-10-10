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

function copyStaticFolderPlugin(items) {
  return {
    name: 'copy-static-assets-on-build',
    closeBundle() {
      for (const { src, dests } of items) {
        if (!fs.existsSync(src)) continue
        for (const dest of dests) {
          fs.mkdirSync(dest, { recursive: true })
          fs.cpSync(src, dest, { recursive: true })
        }
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
      serveStaticFolder('data', resolve(projectRoot, 'data')),
      copyStaticFolderPlugin([
        {
          src: resolve(projectRoot, 'assets'),
          dests: [resolve(projectRoot, 'out/renderer/assets'), resolve(projectRoot, 'out/assets')]
        },
        {
          src: resolve(projectRoot, 'data'),
          dests: [resolve(projectRoot, 'out/renderer/data'), resolve(projectRoot, 'out/data')]
        }
      ])
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
