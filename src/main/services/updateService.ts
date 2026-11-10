/**
 * Update Service
 * Handles GitHub Releases check, asset downloading with progress,
 * installer/portable execution, and legacy settings migration.
 */

import fs from 'fs'
import path from 'path'
import http from 'http'
import https from 'https'
import crypto from 'crypto'
import { spawn } from 'child_process'

function getElectronApp(): typeof import('electron').app | null {
  try {
    const electron = require('electron')
    return electron?.app || null
  } catch {
    return null
  }
}

export interface ReleaseAsset {
  name: string
  size: number
  browser_download_url: string
  sha256?: string
}

export interface ParsedReleaseInfo {
  updateAvailable: boolean
  version: string
  displayVersion: string
  currentVersion: string
  name: string
  releaseNotes: string
  publishedAt: string
  htmlUrl: string
  assets: ReleaseAsset[]
  portableAsset?: ReleaseAsset
  installerAsset?: ReleaseAsset
  checksumsAsset?: ReleaseAsset
}

export interface DownloadProgress {
  percent: number
  bytesReceived: number
  totalBytes: number
  speedBytesPerSec: number
}

/**
 * Parses sha256 checksums from manifest text or release notes.
 * Matches standard format: `<64-hex-hash> [* ]<filename>`
 */
export function parseChecksums(manifestText: string): Record<string, string> {
  const result: Record<string, string> = {}
  if (!manifestText) return result
  const lines = manifestText.split(/\r?\n/)
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const match = trimmed.match(/^([a-fA-F0-9]{64})\s+[*]?(.+)$/)
    if (match) {
      const hash = match[1].toLowerCase()
      const filename = path.basename(match[2].trim())
      result[filename] = hash
    }
  }
  return result
}

/**
 * Validates that an executable to run is an .exe inside the updates directory,
 * preventing path traversal or execution of arbitrary files.
 */
export function validateUpdateInstallPath(filePath: string, updatesDir: string): boolean {
  if (!filePath || typeof filePath !== 'string') return false
  if (!filePath.toLowerCase().endsWith('.exe')) return false

  const resolvedPath = path.resolve(filePath)
  const resolvedUpdatesDir = path.resolve(updatesDir)

  const relative = path.relative(resolvedUpdatesDir, resolvedPath)
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    return false
  }

  return true
}

/**
 * Verifies that a file on disk matches the expected SHA-256 hash.
 */
export async function verifyFileSha256(filePath: string, expectedHash: string): Promise<boolean> {
  if (!expectedHash || !fs.existsSync(filePath)) return false
  const expected = expectedHash.trim().toLowerCase()
  return new Promise((resolve) => {
    const hash = crypto.createHash('sha256')
    const stream = fs.createReadStream(filePath)
    stream.on('data', (chunk) => hash.update(chunk))
    stream.on('end', () => {
      const actual = hash.digest('hex').toLowerCase()
      resolve(actual === expected)
    })
    stream.on('error', () => resolve(false))
  })
}

/**
 * Compare two semver strings (e.g. '1.3.1' vs 'v1.4.0').
 * Returns true if latest is strictly newer than current.
 */
export function isNewerVersion(currentVersion: string, latestVersion: string): boolean {
  const clean = (v: string) => v.trim().replace(/^v/i, '')
  const cParts = clean(currentVersion)
    .split(/[-+]/)[0]
    .split('.')
    .map((n) => parseInt(n, 10) || 0)
  const lParts = clean(latestVersion)
    .split(/[-+]/)[0]
    .split('.')
    .map((n) => parseInt(n, 10) || 0)

  // Pad to 3 parts (major, minor, patch)
  while (cParts.length < 3) cParts.push(0)
  while (lParts.length < 3) lParts.push(0)

  for (let i = 0; i < 3; i++) {
    if (lParts[i] > cParts[i]) return true
    if (lParts[i] < cParts[i]) return false
  }

  // If numbers match, check if current was a prerelease (e.g., 1.3.1-beta vs 1.3.1)
  const cHasPre = currentVersion.includes('-')
  const lHasPre = latestVersion.includes('-')
  if (cHasPre && !lHasPre) return true

  return false
}

/**
 * Parses raw GitHub release JSON into typed structure
 */
export function parseReleaseInfo(release: Record<string, unknown>, currentVersion: string): ParsedReleaseInfo {
  const tagName = String(release?.tag_name || '').trim()
  const cleanVersion = tagName.replace(/^v/i, '')
  const rawAssets = Array.isArray(release?.assets) ? (release.assets as Record<string, unknown>[]) : []
  const assets: ReleaseAsset[] = rawAssets.map((a) => ({
    name: String(a.name || ''),
    size: Number(a.size || 0),
    browser_download_url: String(a.browser_download_url || '')
  }))

  const portableAsset = assets.find((a) => a.name.toLowerCase().includes('portable') && a.name.endsWith('.exe'))
  const installerAsset = assets.find(
    (a) => (a.name.toLowerCase().includes('setup') || a.name.toLowerCase().includes('installer')) && a.name.endsWith('.exe')
  )
  const checksumsAsset = assets.find((a) => a.name.toLowerCase() === 'sha256sums.txt' || a.name.toLowerCase() === 'checksums.txt')

  const bodyChecksums = parseChecksums(String(release?.body || ''))
  if (portableAsset && bodyChecksums[portableAsset.name]) {
    portableAsset.sha256 = bodyChecksums[portableAsset.name]
  }
  if (installerAsset && bodyChecksums[installerAsset.name]) {
    installerAsset.sha256 = bodyChecksums[installerAsset.name]
  }

  const updateAvailable = isNewerVersion(currentVersion, cleanVersion)

  return {
    updateAvailable,
    version: cleanVersion,
    displayVersion: tagName.startsWith('v') ? tagName : `v${cleanVersion}`,
    currentVersion,
    name: String(release?.name || tagName),
    releaseNotes: String(release?.body || ''),
    publishedAt: String(release?.published_at || ''),
    htmlUrl: String(release?.html_url || ''),
    assets,
    portableAsset,
    installerAsset,
    checksumsAsset
  }
}

/**
 * Migrates legacy settings from %APPDATA%/Electron to %APPDATA%/Dota 2 SkinForge
 * if the destination does not already have settings.
 */
export function migrateLegacySettings(legacyDir?: string, targetDir?: string): boolean {
  try {
    let legDir = legacyDir
    let tgtDir = targetDir

    if (!legDir || !tgtDir) {
      const electronApp = getElectronApp()
      const appData = electronApp?.getPath('appData') || ''
      legDir = legDir || path.join(appData, 'Electron')
      tgtDir = tgtDir || path.join(appData, 'Dota 2 SkinForge')
    }

    const legacyFile = path.join(legDir, 'skinforge_settings.json')
    const targetFile = path.join(tgtDir, 'skinforge_settings.json')

    if (!fs.existsSync(legacyFile)) return false
    if (fs.existsSync(targetFile)) return false

    if (!fs.existsSync(tgtDir)) {
      fs.mkdirSync(tgtDir, { recursive: true })
    }

    fs.copyFileSync(legacyFile, targetFile)
    console.log(`[UpdateService] Migrated legacy settings from ${legacyFile} to ${targetFile}`)
    return true
  } catch (err) {
    console.warn('[UpdateService] Failed to migrate legacy settings:', err)
    return false
  }
}

function fetchText(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    https
      .get(url, { headers: { 'User-Agent': 'Dota2SkinForge' } }, (res) => {
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          return fetchText(res.headers.location).then(resolve).catch(reject)
        }
        if (res.statusCode !== 200) {
          return resolve('')
        }
        let data = ''
        res.on('data', (c) => (data += c))
        res.on('end', () => resolve(data))
        res.on('error', () => resolve(''))
      })
      .on('error', () => resolve(''))
  })
}

/**
 * Fetch the latest release from GitHub API
 */
export async function checkForUpdates(currentVersion: string, repo: string = 'javadag/dota2-skinforge'): Promise<ParsedReleaseInfo> {
  const url = `https://api.github.com/repos/${repo}/releases/latest`

  return new Promise((resolve, reject) => {
    const req = https.get(
      url,
      {
        headers: {
          'User-Agent': 'Dota2SkinForge',
          Accept: 'application/vnd.github.v3+json'
        }
      },
      (res) => {
        if (res.statusCode === 404) {
          return reject(new Error('No releases found.'))
        }

        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          // Follow redirect
          return checkForUpdates(currentVersion, repo).then(resolve).catch(reject)
        }

        if (res.statusCode !== 200) {
          return reject(new Error(`GitHub API returned status code ${res.statusCode}`))
        }

        let rawData = ''
        res.on('data', (chunk) => {
          rawData += chunk
        })

        res.on('end', async () => {
          try {
            const json = JSON.parse(rawData)
            const info = parseReleaseInfo(json, currentVersion)
            if (info.checksumsAsset?.browser_download_url && (!info.portableAsset?.sha256 || !info.installerAsset?.sha256)) {
              try {
                const checksumsText = await fetchText(info.checksumsAsset.browser_download_url)
                if (checksumsText) {
                  const checksumMap = parseChecksums(checksumsText)
                  if (info.portableAsset && checksumMap[info.portableAsset.name]) {
                    info.portableAsset.sha256 = checksumMap[info.portableAsset.name]
                  }
                  if (info.installerAsset && checksumMap[info.installerAsset.name]) {
                    info.installerAsset.sha256 = checksumMap[info.installerAsset.name]
                  }
                }
              } catch {}
            }
            resolve(info)
          } catch (err) {
            reject(new Error(`Failed to parse release response: ${err}`))
          }
        })
      }
    )

    req.on('error', (err) => {
      reject(new Error(`Network error checking for updates: ${err.message}`))
    })

    req.setTimeout(12000, () => {
      req.destroy()
      reject(new Error('Update check timed out.'))
    })
  })
}

/**
 * Helper to download file with redirect following
 */
function downloadFileWithRedirects(
  targetUrl: string,
  destPath: string,
  onProgress?: (progress: DownloadProgress) => void
): Promise<string> {
  return new Promise((resolve, reject) => {
    function startRequest(urlStr: string, redirectCount = 0) {
      if (redirectCount > 5) {
        return reject(new Error('Too many redirects while downloading update.'))
      }

      const client = urlStr.startsWith('http://') ? http : https
      const req = client.get(
        urlStr,
        {
          headers: {
            'User-Agent': 'Dota2SkinForge'
          }
        },
        (res) => {
          // Handle redirect (GitHub release assets redirect to AWS S3)
          if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
            res.resume() // Drain stream
            return startRequest(res.headers.location, redirectCount + 1)
          }

          if (res.statusCode !== 200) {
            res.resume()
            return reject(new Error(`Download failed with status ${res.statusCode}`))
          }

          const totalBytes = parseInt(res.headers['content-length'] || '0', 10)
          let bytesReceived = 0
          let lastTime = Date.now()
          let bytesSinceLastTime = 0
          let currentSpeed = 0

          const fileStream = fs.createWriteStream(destPath)

          res.on('data', (chunk) => {
            bytesReceived += chunk.length
            bytesSinceLastTime += chunk.length

            const now = Date.now()
            const delta = now - lastTime
            if (delta >= 400) {
              currentSpeed = (bytesSinceLastTime / delta) * 1000
              lastTime = now
              bytesSinceLastTime = 0
            }

            if (onProgress) {
              const percent = totalBytes > 0 ? Math.min(100, (bytesReceived / totalBytes) * 100) : 0
              onProgress({
                percent: Math.round(percent * 10) / 10,
                bytesReceived,
                totalBytes,
                speedBytesPerSec: Math.round(currentSpeed)
              })
            }
          })

          res.pipe(fileStream)

          fileStream.on('finish', () => {
            fileStream.close(() => resolve(destPath))
          })

          fileStream.on('error', (err) => {
            fs.unlink(destPath, () => {})
            reject(err)
          })
        }
      )

      req.on('error', (err) => {
        fs.unlink(destPath, () => {})
        reject(err)
      })
    }

    startRequest(targetUrl)
  })
}

export interface DownloadUpdateOptions {
  updatesDir?: string
}

/**
 * Downloads update asset to userData/updates/ directory and verifies checksum if provided.
 */
export async function downloadUpdate(
  assetDownloadUrl: string,
  filename: string,
  onProgress?: (progress: DownloadProgress) => void,
  expectedSha256?: string,
  options?: DownloadUpdateOptions
): Promise<{ ok: boolean; filePath?: string; sha256?: string; error?: string }> {
  try {
    let updatesDir = options?.updatesDir
    if (!updatesDir) {
      const electronApp = getElectronApp()
      updatesDir = path.join(electronApp?.getPath('userData') || '', 'updates')
    }
    if (!fs.existsSync(updatesDir)) {
      fs.mkdirSync(updatesDir, { recursive: true })
    }

    const safeFilename = path.basename(filename)
    const destPath = path.join(updatesDir, safeFilename)
    if (!validateUpdateInstallPath(destPath, updatesDir)) {
      return { ok: false, error: 'Security violation: invalid update filename.' }
    }

    // Remove old downloaded file if it exists
    if (fs.existsSync(destPath)) {
      try {
        fs.unlinkSync(destPath)
      } catch {}
    }

    const savedPath = await downloadFileWithRedirects(assetDownloadUrl, destPath, onProgress)

    // Compute actual hash
    const actualSha = await new Promise<string>((resolve, reject) => {
      const hash = crypto.createHash('sha256')
      const stream = fs.createReadStream(savedPath)
      stream.on('data', (c) => hash.update(c))
      stream.on('end', () => resolve(hash.digest('hex').toLowerCase()))
      stream.on('error', reject)
    })

    if (expectedSha256) {
      const normalizedExpected = expectedSha256.trim().toLowerCase()
      if (actualSha !== normalizedExpected) {
        try {
          fs.unlinkSync(savedPath)
        } catch {}
        return {
          ok: false,
          error: `Integrity check failed: SHA-256 mismatch (expected ${normalizedExpected.slice(0, 8)}..., got ${actualSha.slice(0, 8)}...). Download discarded.`
        }
      }
    }

    return { ok: true, filePath: savedPath, sha256: actualSha }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return { ok: false, error: msg }
  }
}

export interface InstallUpdateOptions {
  updatesDir?: string
  skipSpawn?: boolean
}

/**
 * Validates integrity and launches the newly downloaded executable, then exits current app.
 */
export async function installUpdate(
  filePath: string,
  expectedSha256?: string,
  options?: InstallUpdateOptions
): Promise<{ ok: boolean; error?: string }> {
  try {
    let updatesDir = options?.updatesDir
    if (!updatesDir) {
      const electronApp = getElectronApp()
      updatesDir = path.join(electronApp?.getPath('userData') || '', 'updates')
    }

    if (!validateUpdateInstallPath(filePath, updatesDir)) {
      return {
        ok: false,
        error: 'Security violation: update executable must be a valid .exe inside the updates directory.'
      }
    }

    if (!fs.existsSync(filePath)) {
      return { ok: false, error: 'Downloaded update file not found.' }
    }

    if (expectedSha256) {
      const isValid = await verifyFileSha256(filePath, expectedSha256)
      if (!isValid) {
        return {
          ok: false,
          error: 'Integrity check failed: binary SHA-256 does not match release checksum.'
        }
      }
    }

    if (options?.skipSpawn) {
      return { ok: true }
    }

    console.log(`[UpdateService] Launching verified update installer: ${filePath}`)
    const child = spawn(filePath, [], {
      detached: true,
      stdio: 'ignore'
    })
    child.unref()

    const electronApp = getElectronApp()
    setTimeout(() => {
      electronApp?.quit()
    }, 500)

    return { ok: true }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return { ok: false, error: msg }
  }
}
