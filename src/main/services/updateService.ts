/**
 * Update Service
 * Handles GitHub Releases check, asset downloading with progress,
 * installer/portable execution, and legacy settings migration.
 */

import fs from 'fs'
import path from 'path'
import https from 'https'
import { spawn } from 'child_process'

export interface ReleaseAsset {
  name: string
  size: number
  browser_download_url: string
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
}

export interface DownloadProgress {
  percent: number
  bytesReceived: number
  totalBytes: number
  speedBytesPerSec: number
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
    installerAsset
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
      const { app } = require('electron')
      const appData = app.getPath('appData')
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

        res.on('end', () => {
          try {
            const json = JSON.parse(rawData)
            const info = parseReleaseInfo(json, currentVersion)
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

      const req = https.get(
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

/**
 * Downloads update asset to userData/updates/ directory
 */
export async function downloadUpdate(
  assetDownloadUrl: string,
  filename: string,
  onProgress?: (progress: DownloadProgress) => void
): Promise<{ ok: boolean; filePath?: string; error?: string }> {
  try {
    const { app } = require('electron')
    const updatesDir = path.join(app.getPath('userData'), 'updates')
    if (!fs.existsSync(updatesDir)) {
      fs.mkdirSync(updatesDir, { recursive: true })
    }

    const destPath = path.join(updatesDir, filename)
    // Remove old downloaded file if it exists
    if (fs.existsSync(destPath)) {
      try {
        fs.unlinkSync(destPath)
      } catch {}
    }

    const savedPath = await downloadFileWithRedirects(assetDownloadUrl, destPath, onProgress)
    return { ok: true, filePath: savedPath }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return { ok: false, error: msg }
  }
}

/**
 * Launches the newly downloaded executable and exits current app.
 */
export function installUpdate(filePath: string): { ok: boolean; error?: string } {
  try {
    if (!fs.existsSync(filePath)) {
      return { ok: false, error: 'Downloaded update file not found.' }
    }

    console.log(`[UpdateService] Launching update installer: ${filePath}`)
    const child = spawn(filePath, [], {
      detached: true,
      stdio: 'ignore'
    })
    child.unref()

    const { app } = require('electron')
    setTimeout(() => {
      app.quit()
    }, 500)

    return { ok: true }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return { ok: false, error: msg }
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    isNewerVersion,
    parseReleaseInfo,
    migrateLegacySettings,
    checkForUpdates,
    downloadUpdate,
    installUpdate
  }
}
