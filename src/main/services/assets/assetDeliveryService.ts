/**
 * Asset Delivery Service
 *
 * Provides transparent, local-first access to cosmetic asset packages.
 *
 * Resolution Order:
 * 1. Explicit local developer override (process.env.SKINFORGE_ASSET_SOURCE).
 * 2. Cached packages in user data folder (`<userData>/assets/cosmetic-assets/<group>`).
 * 3. Automatic download and extraction from Cloudflare R2 on demand with SHA-256 verification.
 */

import crypto from 'crypto'
import fs from 'fs'
import path from 'path'
import { APP_CONFIG } from '../../../shared/constants/appConfig'
import { ASSET_PACKAGE_BASE_PATH, type AssetPackageManifest, type AssetPackageEntry } from '../../../shared/types/assetPackages'
import { getAssetCacheDir, getDataPath, getElectronApp } from '../app/appPaths'
import { extractTarBrotliSafely } from './archiveUtils'

export { getAssetCacheDir }

export interface DownloadProgress {
  group: string
  percent: number
  bytesReceived: number
  totalBytes: number
  message: string
}

export type ProgressCallback = (progress: DownloadProgress) => void

const SHA256_HEX = /^[a-f0-9]{64}$/i
const DOWNLOAD_IDLE_TIMEOUT_MS = 30_000
const MAX_DOWNLOAD_ATTEMPTS = 3
const RETRY_BASE_DELAY_MS = 500

let cachedRemoteManifest: AssetPackageManifest | null = null
const inFlightDownloads = new Map<string, Promise<string>>()

/**
 * Prefer Electron's `net.fetch` when running in the packaged/desktop app so downloads
 * respect Windows system proxy settings, VPNs, and the OS certificate store. Fall back
 * to Node's global `fetch` in CLI scripts and unit tests.
 */
function getDefaultFetch(): typeof fetch {
  try {
    const app = getElectronApp()
    if (app?.isReady?.()) {
      const { net } = require('electron') as typeof import('electron')
      if (typeof net?.fetch === 'function') {
        return net.fetch.bind(net) as unknown as typeof fetch
      }
    }
  } catch {
    // Running outside Electron (CLI scripts or unit tests).
  }
  return fetch
}

class NonRetryableDownloadError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'NonRetryableDownloadError'
  }
}

function describeNetworkError(err: unknown): string {
  if (!(err instanceof Error)) return String(err)
  const cause = (err as Error & { cause?: unknown }).cause
  if (cause instanceof Error) {
    const code = (cause as Error & { code?: string }).code
    return code ? `${err.message} (${code}: ${cause.message})` : `${err.message} (${cause.message})`
  }
  if (cause && typeof cause === 'object' && 'code' in cause) {
    return `${err.message} (${String((cause as { code: unknown }).code)})`
  }
  return err.message
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
export async function fetchPackageManifest(fetchImpl = getDefaultFetch()): Promise<AssetPackageManifest> {
  if (cachedRemoteManifest) return cachedRemoteManifest
  const bundled = getBundledPackageManifest()
  if (bundled.version === 2 && bundled.appVersion === APP_CONFIG.version) return bundled

  const manifestUrl = `${APP_CONFIG.cdnUrl}/cosmetic-assets/packages.json`
  try {
    const res = await fetchImpl(manifestUrl, {
      signal: AbortSignal.timeout(6000)
    })
    if (res.ok) {
      const data = (await res.json()) as AssetPackageManifest
      if (data && data.packages) {
        cachedRemoteManifest = {
          ...data,
          // Remote entries win over bundled entries so CDN updates take effect.
          packages: { ...bundled.packages, ...data.packages }
        }
        return cachedRemoteManifest
      }
    }
  } catch {
    // Failed or offline; return bundled without caching so reconnects retry R2.
  }

  return bundled
}

/**
 * Checks whether a package's extracted files exist locally and match the expected version/integrity.
 */
export function isPackageReadyLocally(group: string, expectedEntry?: AssetPackageEntry): boolean {
  // 1. Check explicit local developer override directory
  const envSource = process.env.SKINFORGE_ASSET_SOURCE?.trim()
  if (envSource && fs.existsSync(path.join(envSource, group))) {
    return true
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

async function closeStream(stream: fs.WriteStream): Promise<void> {
  if (stream.closed) return
  await new Promise<void>((resolve) => {
    stream.once('close', resolve)
    stream.destroy()
  })
}

async function downloadAndInstallPackageImpl(
  group: string,
  entry: AssetPackageEntry,
  onProgress?: ProgressCallback,
  fetchImpl = fetch
): Promise<string> {
  if (!entry.sha256 || !SHA256_HEX.test(entry.sha256.trim())) {
    throw new NonRetryableDownloadError(`Integrity check failed for package "${group}": missing valid SHA-256 checksum.`)
  }
  const expectedSha = entry.sha256.trim().toLowerCase()

  const cacheBase = getAssetCacheDir()
  const stagingDir = path.join(cacheBase, '.staging')
  const finalGroupDir = path.join(cacheBase, group)

  await fs.promises.mkdir(stagingDir, { recursive: true })

  const tempId = crypto.randomUUID()
  const tempPkgPath = path.join(stagingDir, `${group}-${tempId}.tar.br`)
  const tempExtractDir = path.join(stagingDir, `${group}-${tempId}`)

  const packageUrl = `${APP_CONFIG.cdnUrl}/${ASSET_PACKAGE_BASE_PATH}/${entry.file}`

  const controller = new AbortController()
  let idleTimer: ReturnType<typeof setTimeout> | null = null
  const resetIdleTimer = () => {
    if (idleTimer) clearTimeout(idleTimer)
    idleTimer = setTimeout(() => {
      controller.abort(new Error(`Download timed out for package "${group}".`))
    }, DOWNLOAD_IDLE_TIMEOUT_MS)
  }

  let fileStream: fs.WriteStream | null = null
  let reader: ReadableStreamDefaultReader<Uint8Array> | null = null

  try {
    onProgress?.({
      group,
      percent: 0,
      bytesReceived: 0,
      totalBytes: entry.size,
      message: `Downloading ${group} assets...`
    })

    // 1. Download package archive with idle timeout & backpressure handling
    resetIdleTimer()
    const res = await fetchImpl(packageUrl, { signal: controller.signal })
    if (!res.ok || !res.body) {
      const err = new Error(`Failed to download package "${group}" from CDN (HTTP ${res.status}): ${packageUrl}`)
      if (res.status >= 400 && res.status < 500 && res.status !== 408 && res.status !== 429) {
        throw new NonRetryableDownloadError(err.message)
      }
      throw err
    }

    const totalBytes = Number(res.headers.get('content-length')) || entry.size
    let receivedBytes = 0

    fileStream = fs.createWriteStream(tempPkgPath)
    let streamError: Error | null = null
    fileStream.on('error', (err) => {
      streamError = err
    })
    const hasher = crypto.createHash('sha256')

    reader = res.body.getReader()
    while (true) {
      resetIdleTimer()
      const { done, value } = await reader.read()
      if (done) break
      if (!value) continue
      if (streamError) throw streamError

      if (!fileStream.write(value)) {
        const activeStream = fileStream
        await new Promise<void>((resolve, reject) => {
          const onDrain = () => {
            activeStream.off('error', onErr)
            resolve()
          }
          const onErr = (err: Error) => {
            activeStream.off('drain', onDrain)
            reject(err)
          }
          activeStream.once('drain', onDrain)
          activeStream.once('error', onErr)
        })
      }
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

    if (idleTimer) {
      clearTimeout(idleTimer)
      idleTimer = null
    }
    if (streamError) throw streamError

    const activeStream = fileStream
    await new Promise<void>((resolve, reject) => {
      activeStream.once('error', reject)
      activeStream.end(() => {
        activeStream.off('error', reject)
        resolve()
      })
    })
    fileStream = null
    reader = null

    // 2. Verify SHA-256 integrity
    const actualSha = hasher.digest('hex').toLowerCase()
    if (actualSha !== expectedSha) {
      throw new NonRetryableDownloadError(`Integrity check failed for package "${group}". Expected ${expectedSha}, got ${actualSha}`)
    }

    // 3. Safe extraction
    onProgress?.({
      group,
      percent: 100,
      bytesReceived: receivedBytes,
      totalBytes,
      message: `Extracting ${group} assets...`
    })

    await extractTarBrotliSafely(tempPkgPath, tempExtractDir)

    // Write package state verification marker
    const state = {
      group,
      version: entry.version,
      sha256: expectedSha,
      installedAt: new Date().toISOString()
    }
    await fs.promises.writeFile(path.join(tempExtractDir, '.package_state.json'), JSON.stringify(state, null, 2), 'utf8')

    // 4. Atomic directory swap: move old cache aside before promoting new cache, restoring on failure.
    const oldBackup = path.join(stagingDir, `${group}-old-${tempId}`)
    let movedOld = false
    if (fs.existsSync(finalGroupDir)) {
      await fs.promises.rename(finalGroupDir, oldBackup)
      movedOld = true
    }
    try {
      await fs.promises.rename(tempExtractDir, finalGroupDir)
    } catch (renameErr) {
      if (movedOld && fs.existsSync(oldBackup) && !fs.existsSync(finalGroupDir)) {
        await fs.promises.rename(oldBackup, finalGroupDir).catch(() => {})
      }
      throw renameErr
    }
    if (movedOld) {
      fs.promises.rm(oldBackup, { recursive: true, force: true }).catch(() => {})
    }
    return finalGroupDir
  } finally {
    if (idleTimer) clearTimeout(idleTimer)
    if (reader) await reader.cancel().catch(() => {})
    if (fileStream) await closeStream(fileStream)
    if (fs.existsSync(tempPkgPath)) {
      fs.promises.unlink(tempPkgPath).catch(() => {})
    }
    if (fs.existsSync(tempExtractDir)) {
      fs.promises.rm(tempExtractDir, { recursive: true, force: true }).catch(() => {})
    }
  }
}

/**
 * Downloads, verifies, and safely unpacks an asset package into the local cache directory.
 * Deduplicates concurrent downloads for the same group.
 */
export async function downloadAndInstallPackage(
  group: string,
  entry: AssetPackageEntry,
  onProgress?: ProgressCallback,
  fetchImpl = getDefaultFetch()
): Promise<string> {
  const existing = inFlightDownloads.get(group)
  if (existing) return existing
  const promise = (async () => {
    let lastErr: unknown
    for (let attempt = 1; attempt <= MAX_DOWNLOAD_ATTEMPTS; attempt++) {
      try {
        return await downloadAndInstallPackageImpl(group, entry, onProgress, fetchImpl)
      } catch (err) {
        lastErr = err
        if (err instanceof NonRetryableDownloadError || attempt === MAX_DOWNLOAD_ATTEMPTS) {
          throw err instanceof NonRetryableDownloadError
            ? err
            : new Error(`Failed to download "${group}" assets: ${describeNetworkError(err)}`, { cause: err })
        }
        const delayMs = RETRY_BASE_DELAY_MS * attempt
        onProgress?.({
          group,
          percent: 0,
          bytesReceived: 0,
          totalBytes: entry.size,
          message: `Retrying ${group} download (${attempt}/${MAX_DOWNLOAD_ATTEMPTS - 1})...`
        })
        await new Promise((resolve) => setTimeout(resolve, delayMs))
      }
    }
    throw lastErr
  })().finally(() => {
    inFlightDownloads.delete(group)
  })
  inFlightDownloads.set(group, promise)
  return promise
}

export async function ensurePackagesForGroups(
  groups: Iterable<string>,
  onProgress?: (message: string) => void,
  fetchImpl = getDefaultFetch()
): Promise<void> {
  const neededGroups = new Set(['_global', ...groups])
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
