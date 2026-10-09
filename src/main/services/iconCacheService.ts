/**
 * Dota 2 SkinForge — Icon Cache & Custom Protocol Service
 * Handles skinforge-icon:// requests with local disk write-through caching.
 */

import { app, net, protocol } from 'electron'
import fs from 'fs'
import path from 'path'
import { APP_CONFIG } from '../../shared/constants/appConfig'
import { getAssetsPath, getStagingIconsPath } from './appPathService'

export const DEFAULT_CDN_URL = APP_CONFIG.cdnUrl
const inFlightRequests = new Map<string, Promise<Response>>()

export function normalizeIconPath(uri: string): string {
  let clean = uri.replace(/^skinforge-icon:\/\/+/, '')
  clean = clean.split('?')[0].split('#')[0]
  if (clean.endsWith('.png') || clean.endsWith('.vtex_c')) {
    clean = clean.replace(/\.(png|vtex_c)$/i, '.webp')
  }
  if (!clean.endsWith('.webp')) {
    clean = `${clean}.webp`
  }
  return clean
}

export function resolveCachePath(baseDir: string, relativePath: string): string {
  return path.join(baseDir, 'icon_cache', relativePath)
}

export function formatBytes(bytes: number): string {
  if (bytes <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(1024))
  return `${(bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`
}

export function registerIconScheme(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: 'skinforge-icon',
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        corsEnabled: true
      }
    }
  ])
}

export function registerIconProtocol(getSettings?: () => { r2CdnUrl?: string }): void {
  protocol.handle('skinforge-icon', async (request) => {
    const relativePath = normalizeIconPath(request.url)
    const cacheDir = app.getPath('userData')
    const localPath = resolveCachePath(cacheDir, relativePath)

    // Tier 1: Local Disk Cache Hit (%userData%/icon_cache)
    try {
      if (fs.existsSync(localPath)) {
        const stat = fs.statSync(localPath)
        if (stat.size > 0) {
          const buf = await fs.promises.readFile(localPath)
          return new Response(buf, {
            status: 200,
            headers: {
              'Content-Type': 'image/webp',
              'Access-Control-Allow-Origin': '*'
            }
          })
        }
      }
    } catch {
      // Continue to next tier on read error
    }

    // Tier 2: Local Staged Icons (.staging_icons/webp)
    try {
      const stagingPath = getStagingIconsPath(relativePath)
      if (fs.existsSync(stagingPath)) {
        const stat = fs.statSync(stagingPath)
        if (stat.size > 0) {
          const buf = await fs.promises.readFile(stagingPath)
          return new Response(buf, {
            status: 200,
            headers: {
              'Content-Type': 'image/webp',
              'Access-Control-Allow-Origin': '*'
            }
          })
        }
      }
    } catch {
      // Continue to next tier on read error
    }

    // Tier 3: Local Project Assets fallback
    try {
      const assetPath = getAssetsPath(relativePath)
      if (fs.existsSync(assetPath)) {
        const stat = fs.statSync(assetPath)
        if (stat.size > 0) {
          const buf = await fs.promises.readFile(assetPath)
          const isPng = assetPath.toLowerCase().endsWith('.png')
          return new Response(buf, {
            status: 200,
            headers: {
              'Content-Type': isPng ? 'image/png' : 'image/webp',
              'Access-Control-Allow-Origin': '*'
            }
          })
        }
      }
    } catch {
      // Continue to remote fetch on read error
    }

    // Deduplicate in-flight requests for identical images
    const existing = inFlightRequests.get(relativePath)
    if (existing) {
      return existing
    }

    const fetchPromise = (async (): Promise<Response> => {
      const settings = getSettings ? getSettings() : {}
      const cdnBase = (settings.r2CdnUrl || DEFAULT_CDN_URL).replace(/\/+$/, '')
      const remoteUrl = `${cdnBase}/${relativePath}`

      try {
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), 6000)

        const res = await net.fetch(remoteUrl, { signal: controller.signal })
        clearTimeout(timeoutId)

        if (res.ok) {
          const arrayBuf = await res.arrayBuffer()
          const buffer = Buffer.from(arrayBuf)

          // Asynchronously write to local disk cache
          fs.promises
            .mkdir(path.dirname(localPath), { recursive: true })
            .then(() => fs.promises.writeFile(localPath, buffer))
            .catch((err) => console.error('[IconCache] Cache write error:', err))

          return new Response(buffer, {
            status: 200,
            headers: {
              'Content-Type': 'image/webp',
              'Access-Control-Allow-Origin': '*'
            }
          })
        }
      } catch {
        // Network timeout / DNS error / offline
      }

      return new Response('Icon not found', {
        status: 404,
        headers: {
          'Access-Control-Allow-Origin': '*'
        }
      })
    })().finally(() => {
      inFlightRequests.delete(relativePath)
    })

    inFlightRequests.set(relativePath, fetchPromise)
    return fetchPromise
  })
}

export async function getIconCacheStats(
  baseDir = app.getPath('userData')
): Promise<{ count: number; sizeBytes: number; formattedSize: string }> {
  const root = path.join(baseDir, 'icon_cache')
  let count = 0
  let sizeBytes = 0

  async function walk(dir: string): Promise<void> {
    if (!fs.existsSync(dir)) return
    const entries = await fs.promises.readdir(dir, { withFileTypes: true })
    for (const entry of entries) {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        await walk(full)
      } else if (entry.isFile()) {
        count++
        const stat = await fs.promises.stat(full)
        sizeBytes += stat.size
      }
    }
  }

  await walk(root)
  return { count, sizeBytes, formattedSize: formatBytes(sizeBytes) }
}

export async function clearIconCache(baseDir = app.getPath('userData')): Promise<boolean> {
  const root = path.join(baseDir, 'icon_cache')
  try {
    if (fs.existsSync(root)) {
      await fs.promises.rm(root, { recursive: true, force: true })
    }
    return true
  } catch (e) {
    console.error('[IconCache] Clear cache error:', e)
    return false
  }
}
