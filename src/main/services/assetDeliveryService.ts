/**
 * Asset Delivery Service
 *
 * Provides transparent, local-first access to cosmetic asset packages.
 *
 * Resolution Order:
 * 1. Explicit local developer override (process.env.SKINFORGE_ASSET_SOURCE or D:\skinforge_assets if exists).
 * 2. Cached packages in user data folder (`<userData>/assets/cosmetic-assets/<group>`).
 * 3. Automatic download and extraction from Cloudflare R2 on demand with SHA-256 verification.
 */

import crypto from 'crypto'
import fs from 'fs'
import path from 'path'
import { APP_CONFIG } from '../../shared/constants/appConfig'
import type { AssetPackageManifest, AssetPackageEntry } from '../../shared/types/assetPackages'
import { getAppRoot, getDataPath } from './appPathService'
import { extractZipSafely } from './zipUtils'
import { extractTarBrotliSafely } from './tarUtils'

export interface DownloadProgress {
  group: string
  percent: number
  bytesReceived: number
  totalBytes: number
  message: string
}

export type ProgressCallback = (progress: DownloadProgress) => void

let cachedRemoteManifest: AssetPackageManifest | null = null

/**
 * Returns the local user directory where downloaded cosmetic asset packages reside.
 */
export function getAssetCacheDir(): string {
  try {
    const { app } = require('electron') as { app?: { getPath?: (name: string) => string } }
    if (app && typeof app.getPath === 'function') {
      return path.join(app.getPath('userData'), 'assets', 'cosmetic-assets')
    }
  } catch {
    // Non-electron runtime (tests / CLI)
  }
  return path.join(getAppRoot(), '.cache', 'cosmetic-assets')
}

/**
 * Reads the bundled fallback package manifest.
 */
export function getBundledPackageManifest(): AssetPackageManifest {
  try {
    const manifestFile = getDataPath('cosmetic-packages.json')
    if (fs.existsSync(manifestFile)) {
      return JSON.parse(fs.readFileSync(manifestFile, 'utf8')) as AssetPackageManifest
    }
  } catch {
    // Return empty fallback
  }
  return { version: 1, generatedAt: '', packages: {} }
}

/**
 * Fetches the latest packages.json manifest from Cloudflare R2, falling back to local bundled copy if offline.
 */
export async function fetchPackageManifest(fetchImpl = fetch): Promise<AssetPackageManifest> {
  if (cachedRemoteManifest) return cachedRemoteManifest

  const manifestUrl = `${APP_CONFIG.cdnUrl}/cosmetic-assets/packages.json`
  try {
    const res = await fetchImpl(manifestUrl, {
      signal: AbortSignal.timeout(6000)
    })
    if (res.ok) {
      const data = (await res.json()) as AssetPackageManifest
      if (data && data.packages) {
        cachedRemoteManifest = data
        return data
      }
    }
  } catch {
    // Failed or offline, use bundled
  }

  const bundled = getBundledPackageManifest()
  cachedRemoteManifest = bundled
  return bundled
}

/**
 * Checks whether a package's extracted files exist locally and match the expected version/integrity.
 */
export function isPackageReadyLocally(group: string, expectedEntry?: AssetPackageEntry): boolean {
  // 1. Check local developer directory (SKINFORGE_ASSET_SOURCE, D:\skinforge_assets, or D:\changer_cleaned)
  const envSource = process.env.SKINFORGE_ASSET_SOURCE
  if (envSource && fs.existsSync(path.join(envSource, group))) {
    return true
  }

  for (const localDir of ['D:\\skinforge_assets', 'D:\\changer_cleaned']) {
    if (fs.existsSync(path.join(localDir, group))) {
      return true
    }
  }

  // 2. Check user cache directory
  const groupDir = path.join(getAssetCacheDir(), group)
  if (!fs.existsSync(groupDir)) return false

  const stateFile = path.join(groupDir, '.package_state.json')
  if (fs.existsSync(stateFile)) {
    try {
      const state = JSON.parse(fs.readFileSync(stateFile, 'utf8'))
      if (!expectedEntry) return true
      if (state.sha256 === expectedEntry.sha256) return true
    } catch {
      // Re-download if corrupted state
      return false
    }
  } else if (!expectedEntry) {
    // Has files in folder
    const files = fs.readdirSync(groupDir)
    return files.length > 0
  }

  return false
}

/**
 * Downloads, verifies, and safely unpacks an asset package into the local cache directory.
 */
export async function downloadAndInstallPackage(
  group: string,
  entry: AssetPackageEntry,
  onProgress?: ProgressCallback,
  fetchImpl = fetch
): Promise<string> {
  const cacheBase = getAssetCacheDir()
  const stagingDir = path.join(cacheBase, '.staging')
  const finalGroupDir = path.join(cacheBase, group)

  await fs.promises.mkdir(stagingDir, { recursive: true })

  const tempId = crypto.randomUUID()
  const archiveExt = entry.file.endsWith('.tar.br') ? '.tar.br' : path.extname(entry.file) || '.zip'
  const tempPkgPath = path.join(stagingDir, `${group}-${tempId}${archiveExt}`)
  const tempExtractDir = path.join(stagingDir, `${group}-${tempId}`)

  const packageUrl = `${APP_CONFIG.cdnUrl}/cosmetic-assets/packages/${entry.file}`

  try {
    onProgress?.({
      group,
      percent: 0,
      bytesReceived: 0,
      totalBytes: entry.size,
      message: `Downloading ${group} assets...`
    })

    // 1. Download package archive
    const res = await fetchImpl(packageUrl)
    if (!res.ok || !res.body) {
      throw new Error(`Failed to download package "${group}" from CDN (HTTP ${res.status}): ${packageUrl}`)
    }

    const totalBytes = Number(res.headers.get('content-length')) || entry.size
    let receivedBytes = 0

    const fileStream = fs.createWriteStream(tempPkgPath)
    const hasher = crypto.createHash('sha256')

    const reader = res.body.getReader()
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      if (value) {
        fileStream.write(value)
        hasher.update(value)
        receivedBytes += value.length
        const percent = totalBytes > 0 ? Math.min(100, Math.round((receivedBytes / totalBytes) * 100)) : 0
        onProgress?.({
          group,
          percent,
          bytesReceived: receivedBytes,
          totalBytes,
          message: `Downloading ${group} assets (${percent}%)...`
        })
      }
    }

    await new Promise<void>((resolve, reject) => {
      fileStream.end((err?: Error | null) => {
        if (err) reject(err)
        else resolve()
      })
    })

    // 2. Verify SHA-256 integrity
    const actualSha = hasher.digest('hex')
    if (entry.sha256 && actualSha !== entry.sha256) {
      throw new Error(`Integrity check failed for package "${group}". Expected ${entry.sha256}, got ${actualSha}`)
    }

    // 3. Safe extraction
    onProgress?.({
      group,
      percent: 100,
      bytesReceived: receivedBytes,
      totalBytes,
      message: `Extracting ${group} assets...`
    })

    if (archiveExt === '.tar.br') {
      await extractTarBrotliSafely(tempPkgPath, tempExtractDir)
    } else {
      await extractZipSafely(tempPkgPath, tempExtractDir)
    }

    // Write package state verification marker
    const state = {
      group,
      version: entry.version,
      sha256: entry.sha256,
      installedAt: new Date().toISOString()
    }
    await fs.promises.writeFile(path.join(tempExtractDir, '.package_state.json'), JSON.stringify(state, null, 2), 'utf8')

    // 4. Atomic directory swap
    if (fs.existsSync(finalGroupDir)) {
      try {
        await fs.promises.rm(finalGroupDir, { recursive: true, force: true })
      } catch {
        // Fallback rename if direct rm is locked momentarily
        const oldBackup = path.join(stagingDir, `${group}-old-${tempId}`)
        await fs.promises.rename(finalGroupDir, oldBackup)
        fs.promises.rm(oldBackup, { recursive: true, force: true }).catch(() => {})
      }
    }

    await fs.promises.rename(tempExtractDir, finalGroupDir)
    return finalGroupDir
  } finally {
    // Cleanup temporary package archive and staging directory
    if (fs.existsSync(tempPkgPath)) {
      fs.promises.unlink(tempPkgPath).catch(() => {})
    }
    if (fs.existsSync(tempExtractDir)) {
      fs.promises.rm(tempExtractDir, { recursive: true, force: true }).catch(() => {})
    }
  }
}

/**
 * Ensures all packages required by the given item IDs (and any dependencies like _global)
 * are ready locally, downloading any missing ones.
 */
export async function ensurePackagesForItems(
  itemIds: Iterable<number | string>,
  manifestItems: Record<string, { group: string }>,
  onProgress?: (message: string) => void,
  fetchImpl = fetch
): Promise<void> {
  const neededGroups = new Set<string>()

  // Always include _global if packages exist
  neededGroups.add('_global')

  for (const id of itemIds) {
    const entry = manifestItems[String(id)]
    if (entry?.group) {
      neededGroups.add(entry.group)
    }
  }

  const packageManifest = await fetchPackageManifest(fetchImpl)

  for (const group of neededGroups) {
    const packageEntry = packageManifest.packages[group]

    // If package is already ready locally, skip
    if (isPackageReadyLocally(group, packageEntry)) {
      continue
    }

    if (!packageEntry) {
      // No R2 package entry exists for this group; rely on whatever local files exist
      continue
    }

    // Check dependencies first
    if (packageEntry.dependencies) {
      for (const dep of packageEntry.dependencies) {
        if (!isPackageReadyLocally(dep, packageManifest.packages[dep])) {
          const depEntry = packageManifest.packages[dep]
          if (depEntry) {
            onProgress?.(`Preparing base assets (${dep})...`)
            await downloadAndInstallPackage(
              dep,
              depEntry,
              (p) => onProgress?.(`${p.message} (${(p.bytesReceived / (1024 * 1024)).toFixed(1)} MB)`),
              fetchImpl
            )
          }
        }
      }
    }

    onProgress?.(`Downloading ${group} assets...`)
    await downloadAndInstallPackage(
      group,
      packageEntry,
      (p) => onProgress?.(`${p.message} (${(p.bytesReceived / (1024 * 1024)).toFixed(1)} MB)`),
      fetchImpl
    )
  }
}
