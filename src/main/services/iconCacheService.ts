/**
 * Dota 2 SkinForge — Icon Cache & Custom Protocol Service
 * Handles skinforge-icon:// requests with local disk write-through caching.
 */

import { app, net, protocol } from 'electron'
import fs from 'fs'
import path from 'path'
import { APP_CONFIG } from '../../shared/constants/appConfig'
import { normalizeIconPath } from '../../shared/armory/iconKeys'
import {
  getAssetsPath,
  getBundledIconPackManifestPath,
  getBundledIconPackPath,
  getIconPackDir,
  getStagingIconsPath
} from './appPathService'
import { extractTarBrotliSafely } from './tarUtils'

export const DEFAULT_CDN_URL = APP_CONFIG.cdnUrl
const inFlightRequests = new Map<string, Promise<Response>>()
let packReady: Promise<void> | null = null

export { normalizeIconPath }

export function resolveCachePath(baseDir: string, relativePath: string): string {
  return path.join(baseDir, 'icon_cache', relativePath)
}

export function formatBytes(bytes: number): string {
  if (bytes <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(1024))
  return `${(bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`
}

async function serveLocalFile(filePath: string): Promise<Response | null> {
  try {
    if (!fs.existsSync(filePath)) return null
    const stat = fs.statSync(filePath)
    if (stat.size <= 0) return null
    const buf = await fs.promises.readFile(filePath)
    return new Response(buf, {
      status: 200,
      headers: {
        'Content-Type': filePath.toLowerCase().endsWith('.png') ? 'image/png' : 'image/webp',
        'Access-Control-Allow-Origin': '*'
      }
    })
  } catch {
    return null
  }
}

/**
 * Extracts the bundled icon pack into userData once per pack version.
 * Highest-read asset in the app, so it must never hit the network.
 */
async function extractBundledIconPack(): Promise<void> {
  const packFile = getBundledIconPackPath()
  if (!fs.existsSync(packFile)) return

  let version = '0'
  try {
    version = String(JSON.parse(fs.readFileSync(getBundledIconPackManifestPath(), 'utf8')).version ?? '0')
  } catch {
    // No manifest: still use the pack, just re-check it every launch
  }

  const packDir = getIconPackDir()
  const marker = path.join(packDir, '.version')
  try {
    if (fs.readFileSync(marker, 'utf8').trim() === version) return
  } catch {
    // Not extracted yet
  }

  fs.rmSync(packDir, { recursive: true, force: true })
  await extractTarBrotliSafely(packFile, packDir, 32)
  fs.writeFileSync(marker, version)
}

export function ensureIconPack(): Promise<void> {
  if (!packReady) {
    packReady = extractBundledIconPack().catch((err) => {
      console.error('[IconCache] Bundled icon pack extraction failed:', err)
    })
  }
  return packReady
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

    // Tier 1: Local Disk Cache Hit (%userData%/icon_cache)
    const cached = await serveLocalFile(resolveCachePath(app.getPath('userData'), relativePath))
    if (cached) return cached

    // Tier 2: Local Staged Icons (.staging_icons/webp, dev builds)
    const staged = await serveLocalFile(getStagingIconsPath(relativePath))
    if (staged) return staged

    // Tier 3: Bundled Icon Pack (extracted once per version)
    await ensureIconPack()
    const packed = await serveLocalFile(path.join(getIconPackDir(), relativePath))
    if (packed) return packed

    // Tier 4: Local Project Assets fallback
    const asset = await serveLocalFile(getAssetsPath(relativePath))
    if (asset) return asset

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
          const localPath = resolveCachePath(app.getPath('userData'), relativePath)

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

  await walk(path.join(baseDir, 'icon_cache'))

  // The bundled pack is extracted wholesale and never changes while installed, so read
  // its size from the manifest instead of stat-ing 14k files on every launch.
  try {
    const manifest = JSON.parse(fs.readFileSync(getBundledIconPackManifestPath(), 'utf8'))
    const marker = fs.readFileSync(path.join(baseDir, 'icon_pack', '.version'), 'utf8').trim()
    if (marker === String(manifest.version)) {
      count += Number(manifest.count) || 0
      sizeBytes += Number(manifest.bytes) || 0
    }
  } catch {
    // Pack not built or not extracted yet
  }

  return { count, sizeBytes, formattedSize: formatBytes(sizeBytes) }
}

export async function clearIconCache(baseDir = app.getPath('userData')): Promise<boolean> {
  // Force a fresh extraction of the bundled pack on the next icon request.
  packReady = null
  try {
    for (const root of [path.join(baseDir, 'icon_cache'), path.join(baseDir, 'icon_pack')]) {
      if (fs.existsSync(root)) {
        await fs.promises.rm(root, { recursive: true, force: true })
      }
    }
    return true
  } catch (e) {
    console.error('[IconCache] Clear cache error:', e)
    return false
  }
}
