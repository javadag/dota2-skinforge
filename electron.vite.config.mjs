import { resolve } from 'path'
import fs from 'fs'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import { loadEnv } from 'vite'
import commonjs from '@rollup/plugin-commonjs'
import tailwindcss from '@tailwindcss/vite'

const projectRoot = import.meta.dirname
const env = loadEnv('', projectRoot, '')
const r2PublicUrl = env.R2_PUBLIC_URL || process.env.R2_PUBLIC_URL || ''

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
    define: {
      'process.env.R2_PUBLIC_URL': JSON.stringify(r2PublicUrl)
    },
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
