/**
 * Icon Pack Service (`skinforge-icon://` protocol + bundled WebP archive extraction)
 *
 * Manages SHA-256 verified `.tar.br` extraction, caching, stats, and protocol serving for
 * both cosmetic item icons (`icon-pack.tar.br`) and ability icons (`ability-icons.tar.br`).
 */

import fs from 'fs'
import path from 'path'
import { getIconFallback, normalizeIconPath } from '../../../shared/armory/iconKeys'
import type { IconCacheStats } from '../../../shared/types/ipc'
import {
  getAbilityIconPackDir,
  getAssetsPath,
  getBundledIconPackManifestPath,
  getBundledIconPackPath,
  getElectronApp,
  getItemIconPackDir,
  getStagingIconsPath
} from '../app/appPaths'
import { computeFileSha256, extractTarBrotliSafely } from './archiveUtils'

export interface IconPackManifest {
  sha256: string
  catalogHash: string
  sourceHash?: string
  count: number
  bytes: number
  px: number
  quality: number
}

export interface AbilityIconManifest {
  sha256: string
  count: number
  bytes: number
  icons: string[]
}

type ArchiveManifest = Pick<IconPackManifest, 'sha256' | 'count' | 'bytes'>

let cachedAbilityManifest: AbilityIconManifest | undefined

export function readIconPackManifest(manifestPath: string): IconPackManifest {
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as IconPackManifest
  const isDigest = (value: unknown) => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value)
  if (
    !isDigest(manifest?.sha256) ||
    !isDigest(manifest.catalogHash) ||
    !Number.isSafeInteger(manifest.count) ||
    manifest.count <= 0 ||
    !Number.isSafeInteger(manifest.bytes) ||
    manifest.bytes <= 0
  ) {
    throw new Error('Invalid icon pack manifest')
  }
  return manifest
}

export function getAbilityIconManifest(): AbilityIconManifest {
  if (!cachedAbilityManifest) {
    cachedAbilityManifest = JSON.parse(fs.readFileSync(getAssetsPath('ability-icons.json'), 'utf8')) as AbilityIconManifest
  }
  return cachedAbilityManifest
}

export function isIconPackExtracted(packDir: string, manifest: ArchiveManifest): boolean {
  try {
    return fs.readFileSync(path.join(packDir, '.version'), 'utf8') === manifest.sha256
  } catch {
    return false
  }
}

export async function installIconPack(archive: string, packDir: string, manifest: ArchiveManifest): Promise<void> {
  if (isIconPackExtracted(packDir, manifest)) return
  if ((await computeFileSha256(archive)) !== manifest.sha256) throw new Error('Bundled icon pack checksum mismatch')

  await fs.promises.mkdir(path.dirname(packDir), { recursive: true })
  const staging = await fs.promises.mkdtemp(`${packDir}-`)
  try {
    const { fileCount, bytesExtracted } = await extractTarBrotliSafely(archive, staging, 32)
    if (fileCount !== manifest.count || bytesExtracted !== manifest.bytes) throw new Error('Incomplete bundled icon pack')
    await fs.promises.writeFile(path.join(staging, '.version'), manifest.sha256)
    await fs.promises.rm(packDir, { recursive: true, force: true })
    await fs.promises.rename(staging, packDir)
  } finally {
    await fs.promises.rm(staging, { recursive: true, force: true })
  }
}

let itemPackReady: Promise<boolean> | undefined
let abilityPackReady: Promise<void> | undefined
let clearing: Promise<boolean> | undefined

export function ensureIconPack(): Promise<boolean> {
  if (clearing) return clearing.then(() => ensureIconPack())
  if (!itemPackReady) {
    itemPackReady = (async () => {
      const manifest = readIconPackManifest(getBundledIconPackManifestPath())
      await installIconPack(getBundledIconPackPath(), getItemIconPackDir(), manifest)
      return true
    })().catch((error) => {
      console.error('[IconPackService] Bundled icon pack extraction failed:', error)
      itemPackReady = undefined
      return false
    })
  }
  return itemPackReady
}

async function ensureAbilityIconPack(): Promise<void> {
  if (clearing) await clearing
  abilityPackReady ??= installIconPack(getAssetsPath('ability-icons.tar.br'), getAbilityIconPackDir(), getAbilityIconManifest()).catch(
    (error) => {
      abilityPackReady = undefined
      throw error
    }
  )
  await abilityPackReady
}

export function registerIconScheme(): void {
  const { protocol } = require('electron') as typeof import('electron')
  protocol.registerSchemesAsPrivileged([
    {
      scheme: 'skinforge-icon',
      privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true }
    }
  ])
}

async function readLocalIcon(relativePath: string, packAvailable: boolean): Promise<Buffer | undefined> {
  const isPackaged = Boolean(getElectronApp()?.isPackaged)
  const candidates = [
    ...(!isPackaged ? [getStagingIconsPath(relativePath)] : []),
    ...(packAvailable ? [path.join(getItemIconPackDir(), relativePath)] : []),
    getAssetsPath(relativePath)
  ]
  for (const file of candidates) {
    try {
      const data = await fs.promises.readFile(file)
      if (data.length >= 12 && data.toString('ascii', 0, 4) === 'RIFF' && data.toString('ascii', 8, 12) === 'WEBP') return data
    } catch {
      // Try the next local source.
    }
  }
}

export function registerIconProtocol(): void {
  const { protocol } = require('electron') as typeof import('electron')
  protocol.handle('skinforge-icon', async (request) => {
    const relativePath = normalizeIconPath(request.url)
    if (!relativePath) return new Response(null, { status: 400 })

    if (relativePath.startsWith('spellicons/')) {
      try {
        await ensureAbilityIconPack()
        const data = await fs.promises.readFile(path.join(getAbilityIconPackDir(), relativePath))
        return new Response(new Uint8Array(data), { headers: { 'Content-Type': 'image/webp', 'Access-Control-Allow-Origin': '*' } })
      } catch {
        return new Response(null, { status: 404 })
      }
    }

    const packAvailable = await ensureIconPack()
    const fallback = getIconFallback(relativePath.slice(0, -'.webp'.length))
    const data =
      (await readLocalIcon(relativePath, packAvailable)) ?? (fallback ? await readLocalIcon(`${fallback}.webp`, packAvailable) : undefined)
    if (!data) return new Response(null, { status: 404 })

    return new Response(new Uint8Array(data), {
      headers: { 'Content-Type': 'image/webp', 'Access-Control-Allow-Origin': '*' }
    })
  })
}

export async function getIconCacheStats(): Promise<IconCacheStats> {
  let count = 0
  let sizeBytes = 0
  try {
    const manifest = readIconPackManifest(getBundledIconPackManifestPath())
    if (isIconPackExtracted(getItemIconPackDir(), manifest)) {
      count += manifest.count
      sizeBytes += manifest.bytes
    }
  } catch {
    // Ignore missing/invalid icon pack manifest
  }
  try {
    const abilityManifest = getAbilityIconManifest()
    if (isIconPackExtracted(getAbilityIconPackDir(), abilityManifest)) {
      count += abilityManifest.count
      sizeBytes += abilityManifest.bytes
    }
  } catch {
    // Ignore missing/invalid ability icon manifest
  }
  if (count === 0 && sizeBytes === 0) {
    return { count: 0, sizeBytes: 0, formattedSize: '0 B' }
  }
  return { count, sizeBytes, formattedSize: `${(sizeBytes / 1048576).toFixed(1)} MB` }
}

export function clearIconCache(): Promise<boolean> {
  if (!clearing) {
    clearing = (async () => {
      await itemPackReady
      await abilityPackReady?.catch(() => {})
      itemPackReady = undefined
      abilityPackReady = undefined
      await fs.promises.rm(getItemIconPackDir(), { recursive: true, force: true })
      await fs.promises.rm(getAbilityIconPackDir(), { recursive: true, force: true })
      const electronApp = getElectronApp()
      if (electronApp?.getPath) {
        await fs.promises.rm(path.join(electronApp.getPath('userData'), 'icon_cache'), { recursive: true, force: true })
      }
      return true
    })()
      .catch((error) => {
        console.error('[IconPackService] Clear cache failed:', error)
        return false
      })
      .finally(() => {
        clearing = undefined
      })
  }
  return clearing
}
