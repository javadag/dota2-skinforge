/**
 * Update Service
 * Handles GitHub Releases checks, verified asset downloading with progress,
 * and verified installer/portable execution.
 */

import { spawn } from 'child_process'
import crypto from 'crypto'
import fs from 'fs'
import path from 'path'
import { APP_CONFIG } from '../../../shared/constants/appConfig'
import type { UpdateAsset as ReleaseAsset, UpdateDownloadProgress as DownloadProgress } from '../../../shared/types/ipc'
import { computeFileSha256 } from '../assets/archiveUtils'
import { getElectronApp, getUpdatesDir } from './appPaths'

export type { DownloadProgress, ReleaseAsset }

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

const SHA256_HEX = /^[a-f0-9]{64}$/i
const MAX_REDIRECTS = 5
const REQUEST_TIMEOUT_MS = 12_000
const DOWNLOAD_IDLE_TIMEOUT_MS = 30_000

const verifiedReleaseAssets = new Map<string, { url: string; sha256: string }>()
let lastVerifiedDownload: { filePath: string; sha256: string } | null = null

/**
 * Parses sha256 checksums from manifest text or release notes.
 * Matches standard format: `<64-hex-hash> [* ]<filename>`
 */
export function parseChecksums(manifestText: string): Record<string, string> {
  const result: Record<string, string> = {}
  if (!manifestText) return result
  for (const line of manifestText.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const match = trimmed.match(/^([a-fA-F0-9]{64})\s+[*]?(.+)$/)
    if (match) {
      result[path.basename(match[2].trim())] = match[1].toLowerCase()
    }
  }
  return result
}

/**
 * Validates that an executable to run is an `.exe` inside the updates directory,
 * preventing path traversal or execution of arbitrary files.
 */
export function validateUpdateInstallPath(filePath: string, updatesDir: string): boolean {
  if (!filePath || typeof filePath !== 'string' || !filePath.toLowerCase().endsWith('.exe')) return false
  const relative = path.relative(path.resolve(updatesDir), path.resolve(filePath))
  return !relative.startsWith('..') && !path.isAbsolute(relative)
}

/**
 * Verifies that a file on disk matches the expected SHA-256 hash.
 */
export async function verifyFileSha256(filePath: string, expectedHash: string): Promise<boolean> {
  if (!expectedHash || !fs.existsSync(filePath)) return false
  try {
    const actual = await computeFileSha256(filePath)
    return actual.toLowerCase() === expectedHash.trim().toLowerCase()
  } catch {
    return false
  }
}

/**
 * Compare two semver strings (e.g. `'1.3.1'` vs `'v1.4.0'`).
 * Returns true if `latestVersion` is strictly newer than `currentVersion`.
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

  while (cParts.length < 3) cParts.push(0)
  while (lParts.length < 3) lParts.push(0)

  for (let i = 0; i < 3; i++) {
    if (lParts[i] > cParts[i]) return true
    if (lParts[i] < cParts[i]) return false
  }

  return currentVersion.includes('-') && !latestVersion.includes('-')
}

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
  if (portableAsset && bodyChecksums[portableAsset.name]) portableAsset.sha256 = bodyChecksums[portableAsset.name]
  if (installerAsset && bodyChecksums[installerAsset.name]) installerAsset.sha256 = bodyChecksums[installerAsset.name]

  return {
    updateAvailable: isNewerVersion(currentVersion, cleanVersion),
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

function isLoopbackHttp(parsed: URL): boolean {
  return (
    parsed.protocol === 'http:' &&
    (parsed.hostname === '127.0.0.1' || parsed.hostname === 'localhost' || parsed.hostname === '::1' || parsed.hostname === '[::1]')
  )
}

function isTrustedRemoteUrl(urlStr: string, requireGitHubHost: boolean, allowLoopbackHttp = false): boolean {
  try {
    const parsed = new URL(urlStr)
    if (allowLoopbackHttp && isLoopbackHttp(parsed)) return true
    if (parsed.protocol !== 'https:') return false
    if (!requireGitHubHost) return true
    const host = parsed.hostname.toLowerCase()
    if (host === 'github.com') {
      return parsed.pathname.toLowerCase().startsWith(`/${APP_CONFIG.githubRepo.toLowerCase()}/releases/download/`)
    }
    return host.endsWith('.githubusercontent.com')
  } catch {
    return false
  }
}

async function fetchWithVerifiedRedirects(
  initialUrl: string,
  headers: Record<string, string>,
  signal: AbortSignal,
  requireGitHubInitialHost: boolean,
  allowLoopbackHttp = false
): Promise<Response> {
  let currentUrl = initialUrl
  for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount++) {
    if (!isTrustedRemoteUrl(currentUrl, requireGitHubInitialHost && redirectCount === 0, allowLoopbackHttp)) {
      throw new Error(
        requireGitHubInitialHost && redirectCount === 0
          ? 'Security violation: untrusted update download URL.'
          : 'Refused non-HTTPS redirect.'
      )
    }

    const res = await fetch(currentUrl, {
      headers,
      redirect: 'manual',
      signal
    })

    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get('location')
      if (!location) throw new Error(`Redirect missing Location header (HTTP ${res.status})`)
      currentUrl = new URL(location, currentUrl).toString()
      continue
    }

    return res
  }
  throw new Error('Too many redirects.')
}

async function fetchGitHubText(targetUrl: string, headers: Record<string, string>, notFoundMessage: string): Promise<string> {
  const res = await fetchWithVerifiedRedirects(targetUrl, headers, AbortSignal.timeout(REQUEST_TIMEOUT_MS), false)
  if (res.status === 404) throw new Error(notFoundMessage)
  if (res.status !== 200) throw new Error(`GitHub API returned status code ${res.status}`)
  return res.text()
}

export async function checkForUpdates(currentVersion: string, repo: string = APP_CONFIG.githubRepo): Promise<ParsedReleaseInfo> {
  const rawData = await fetchGitHubText(
    `https://api.github.com/repos/${repo}/releases/latest`,
    { 'User-Agent': 'Dota2SkinForge', Accept: 'application/vnd.github.v3+json' },
    'No releases found.'
  )

  let json: Record<string, unknown>
  try {
    json = JSON.parse(rawData) as Record<string, unknown>
  } catch (err) {
    throw new Error(`Failed to parse release response: ${err}`, { cause: err })
  }

  const info = parseReleaseInfo(json, currentVersion)
  if (info.checksumsAsset?.browser_download_url && (!info.portableAsset?.sha256 || !info.installerAsset?.sha256)) {
    try {
      const checksumsText = await fetchGitHubText(
        info.checksumsAsset.browser_download_url,
        { 'User-Agent': 'Dota2SkinForge' },
        'Checksums asset not found.'
      )
      if (checksumsText) {
        const checksumMap = parseChecksums(checksumsText)
        if (info.portableAsset && checksumMap[info.portableAsset.name]) {
          info.portableAsset.sha256 = checksumMap[info.portableAsset.name]
        }
        if (info.installerAsset && checksumMap[info.installerAsset.name]) {
          info.installerAsset.sha256 = checksumMap[info.installerAsset.name]
        }
      }
    } catch {
      // Missing checksums asset will fail verification before executing an update.
    }
  }
  verifiedReleaseAssets.clear()
  for (const asset of [info.portableAsset, info.installerAsset]) {
    if (asset?.browser_download_url && asset.sha256 && SHA256_HEX.test(asset.sha256)) {
      verifiedReleaseAssets.set(asset.browser_download_url, {
        url: asset.browser_download_url,
        sha256: asset.sha256.toLowerCase()
      })
    }
  }
  return info
}

/** Fetches the release notes for one installed version (used by the first-run What's New dialog). */
export async function getReleaseNotesForVersion(
  version: string,
  repo: string = APP_CONFIG.githubRepo
): Promise<{ version: string; releaseNotes: string; publishedAt: string; htmlUrl: string }> {
  const cleanVersion = version.trim().replace(/^v/i, '')
  const rawData = await fetchGitHubText(
    `https://api.github.com/repos/${repo}/releases/tags/v${encodeURIComponent(cleanVersion)}`,
    { 'User-Agent': 'Dota2SkinForge', Accept: 'application/vnd.github.v3+json' },
    'Release notes are not available for this version.'
  )

  try {
    const release = JSON.parse(rawData) as Record<string, unknown>
    return {
      version: cleanVersion,
      releaseNotes: String(release.body || '').trim(),
      publishedAt: String(release.published_at || ''),
      htmlUrl: String(release.html_url || `https://github.com/${repo}/releases/tag/v${cleanVersion}`)
    }
  } catch (err) {
    throw new Error('Failed to parse release notes response.', { cause: err })
  }
}

async function closeWriteStream(stream: fs.WriteStream): Promise<void> {
  if (stream.closed) return
  await new Promise<void>((resolve) => {
    stream.once('close', resolve)
    stream.destroy()
  })
}

async function streamDownloadAndHash(
  targetUrl: string,
  destPath: string,
  onProgress?: (progress: DownloadProgress) => void,
  allowLoopbackHttp = false
): Promise<string> {
  const controller = new AbortController()
  let idleTimer: ReturnType<typeof setTimeout> | null = null
  const resetIdleTimer = () => {
    if (idleTimer) clearTimeout(idleTimer)
    idleTimer = setTimeout(() => {
      controller.abort(new Error('Update download timed out due to inactivity.'))
    }, DOWNLOAD_IDLE_TIMEOUT_MS)
  }

  resetIdleTimer()
  let res: Response
  try {
    res = await fetchWithVerifiedRedirects(targetUrl, { 'User-Agent': 'Dota2SkinForge' }, controller.signal, true, allowLoopbackHttp)
  } catch (err) {
    if (idleTimer) clearTimeout(idleTimer)
    throw err
  }

  if (res.status !== 200 || !res.body) {
    if (idleTimer) clearTimeout(idleTimer)
    throw new Error(`Download failed with status ${res.status}`)
  }

  const totalBytes = parseInt(res.headers.get('content-length') || '0', 10)
  let bytesReceived = 0
  let lastTime = Date.now()
  let bytesSinceLastTime = 0
  let currentSpeed = 0

  const hasher = crypto.createHash('sha256')
  const fileStream = fs.createWriteStream(destPath)
  let streamError: Error | null = null
  fileStream.on('error', (err) => {
    streamError = err
  })

  const reader = res.body.getReader()
  try {
    while (true) {
      resetIdleTimer()
      const { done, value } = await reader.read()
      if (done) break
      if (!value) continue
      if (streamError) throw streamError

      if (!fileStream.write(value)) {
        await new Promise<void>((resolve, reject) => {
          const onDrain = () => {
            fileStream.off('error', onErr)
            resolve()
          }
          const onErr = (err: Error) => {
            fileStream.off('drain', onDrain)
            reject(err)
          }
          fileStream.once('drain', onDrain)
          fileStream.once('error', onErr)
        })
      }
      hasher.update(value)
      bytesReceived += value.length
      bytesSinceLastTime += value.length

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
    }

    if (streamError) throw streamError
    await new Promise<void>((resolve, reject) => {
      fileStream.once('error', reject)
      fileStream.end(() => {
        fileStream.off('error', reject)
        resolve()
      })
    })
    return hasher.digest('hex').toLowerCase()
  } catch (err) {
    await reader.cancel().catch(() => {})
    await closeWriteStream(fileStream)
    try {
      if (fs.existsSync(destPath)) fs.unlinkSync(destPath)
    } catch {}
    throw err
  } finally {
    if (idleTimer) clearTimeout(idleTimer)
  }
}

export interface DownloadUpdateOptions {
  updatesDir?: string
  /** Test-only escape hatch allowing `http://127.0.0.1` mock servers. Never enabled in production. */
  allowLoopbackHttp?: boolean
  /** Require the URL and SHA-256 to match an asset discovered by `checkForUpdates()` in the main process. */
  requireVerifiedRelease?: boolean
}

export async function downloadUpdate(
  assetDownloadUrl: string,
  filename: string,
  onProgress?: (progress: DownloadProgress) => void,
  expectedSha256?: string,
  options?: DownloadUpdateOptions
): Promise<{ ok: boolean; filePath?: string; sha256?: string; error?: string }> {
  try {
    let resolvedSha = expectedSha256?.trim().toLowerCase()
    if (options?.requireVerifiedRelease) {
      const pinned = verifiedReleaseAssets.get(assetDownloadUrl)
      if (!pinned) {
        return { ok: false, error: 'Security violation: update asset was not verified by the latest release check.' }
      }
      if (resolvedSha && resolvedSha !== pinned.sha256) {
        return { ok: false, error: 'Security violation: update checksum mismatch with verified release.' }
      }
      resolvedSha = pinned.sha256
    }

    if (!resolvedSha || !SHA256_HEX.test(resolvedSha)) {
      return { ok: false, error: 'Integrity check failed: missing release SHA-256 checksum.' }
    }
    if (!isTrustedRemoteUrl(assetDownloadUrl, true, options?.allowLoopbackHttp)) {
      return { ok: false, error: 'Security violation: untrusted update download URL.' }
    }

    const updatesDir = getUpdatesDir(options?.updatesDir)
    const destPath = path.join(updatesDir, path.basename(filename))
    if (!validateUpdateInstallPath(destPath, updatesDir)) {
      return { ok: false, error: 'Security violation: invalid update filename.' }
    }

    fs.mkdirSync(updatesDir, { recursive: true })
    if (fs.existsSync(destPath)) {
      try {
        fs.unlinkSync(destPath)
      } catch {}
    }

    const actualSha = await streamDownloadAndHash(assetDownloadUrl, destPath, onProgress, options?.allowLoopbackHttp)
    if (actualSha !== resolvedSha) {
      try {
        fs.unlinkSync(destPath)
      } catch {}
      return {
        ok: false,
        error: `Integrity check failed: SHA-256 mismatch (expected ${resolvedSha.slice(0, 8)}..., got ${actualSha.slice(0, 8)}...). Download discarded.`
      }
    }

    lastVerifiedDownload = { filePath: path.resolve(destPath), sha256: actualSha }
    return { ok: true, filePath: destPath, sha256: actualSha }
  } catch (err: unknown) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

export interface InstallUpdateOptions {
  updatesDir?: string
  skipSpawn?: boolean
  /** Require the file and checksum to match the latest verified `downloadUpdate()` result. */
  requireVerifiedRelease?: boolean
  /** Override `PORTABLE_EXECUTABLE_FILE` in tests. */
  portableTargetPath?: string
}

function escapePowerShellLiteral(value: string): string {
  return `'${value.replace(/'/g, "''")}'`
}

export function buildPortableReplaceEncodedCommand(sourcePath: string, targetPath: string): string {
  const src = escapePowerShellLiteral(path.resolve(sourcePath))
  const dst = escapePowerShellLiteral(path.resolve(targetPath))
  const script = [
    `$src = ${src}`,
    `$dst = ${dst}`,
    '$moved = $false',
    'for ($i = 0; $i -lt 80; $i++) {',
    '  try {',
    '    Move-Item -LiteralPath $src -Destination $dst -Force -ErrorAction Stop',
    '    $moved = $true',
    '    break',
    '  } catch {',
    '    Start-Sleep -Milliseconds 250',
    '  }',
    '}',
    '$launch = if ($moved -or (Test-Path -LiteralPath $dst)) { $dst } else { $src }',
    '$dir = Split-Path -Parent $launch',
    'Start-Process -FilePath $launch -WorkingDirectory $dir'
  ].join('\n')
  return Buffer.from(script, 'utf16le').toString('base64')
}

export function cleanupStaleUpdates(updatesDir?: string): void {
  const dir = getUpdatesDir(updatesDir)
  if (!fs.existsSync(dir)) return
  for (const entry of fs.readdirSync(dir)) {
    if (!entry.toLowerCase().endsWith('.exe')) continue
    try {
      fs.unlinkSync(path.join(dir, entry))
    } catch {
      // Ignore locked executables still finishing an install
    }
  }
}

async function spawnDetachedExecutable(filePath: string, args: string[] = []): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(filePath, args, {
      detached: true,
      stdio: 'ignore',
      windowsHide: args.length > 0
    })
    child.once('error', reject)
    child.once('spawn', () => {
      child.unref()
      resolve()
    })
  })
}

export async function installUpdate(
  filePath: string,
  expectedSha256?: string,
  options?: InstallUpdateOptions
): Promise<{ ok: boolean; error?: string }> {
  try {
    const updatesDir = getUpdatesDir(options?.updatesDir)

    if (!validateUpdateInstallPath(filePath, updatesDir)) {
      return {
        ok: false,
        error: 'Security violation: update executable must be a valid .exe inside the updates directory.'
      }
    }

    if (!fs.existsSync(filePath)) {
      return { ok: false, error: 'Downloaded update file not found.' }
    }

    let resolvedSha = expectedSha256?.trim().toLowerCase()
    if (options?.requireVerifiedRelease) {
      if (!lastVerifiedDownload || path.resolve(filePath) !== lastVerifiedDownload.filePath) {
        return { ok: false, error: 'Security violation: update file was not produced by a verified download.' }
      }
      resolvedSha = lastVerifiedDownload.sha256
    }

    if (!resolvedSha || !SHA256_HEX.test(resolvedSha)) {
      return {
        ok: false,
        error: 'Integrity check failed: missing release SHA-256 checksum.'
      }
    }

    const isValid = await verifyFileSha256(filePath, resolvedSha)
    if (!isValid) {
      return {
        ok: false,
        error: 'Integrity check failed: binary SHA-256 does not match release checksum.'
      }
    }

    if (options?.skipSpawn) {
      return { ok: true }
    }

    const portableTarget = options?.portableTargetPath ?? process.env.PORTABLE_EXECUTABLE_FILE
    const isPortableSelfUpdate =
      process.platform === 'win32' &&
      path.basename(filePath).toLowerCase().includes('portable') &&
      Boolean(portableTarget) &&
      portableTarget!.toLowerCase().endsWith('.exe') &&
      path.resolve(portableTarget!) !== path.resolve(filePath)

    if (isPortableSelfUpdate) {
      console.log(`[UpdateService] Replacing portable executable ${portableTarget} from ${filePath}`)
      const encoded = buildPortableReplaceEncodedCommand(filePath, portableTarget!)
      await spawnDetachedExecutable('powershell.exe', [
        '-NoProfile',
        '-NonInteractive',
        '-WindowStyle',
        'Hidden',
        '-EncodedCommand',
        encoded
      ])
    } else {
      console.log(`[UpdateService] Launching verified update installer: ${filePath}`)
      try {
        await spawnDetachedExecutable(filePath)
      } catch (spawnErr: unknown) {
        const code = (spawnErr as NodeJS.ErrnoException | null)?.code
        if (process.platform === 'win32' && code === 'EACCES') {
          // NSIS installers requiring UAC elevation fail direct spawn with EACCES; ShellExecute prompts UAC.
          const electron = require('electron') as typeof import('electron')
          const openError = await electron.shell.openPath(filePath)
          if (openError) throw new Error(openError, { cause: spawnErr })
        } else {
          throw spawnErr
        }
      }
    }

    const electronApp = getElectronApp()
    setTimeout(() => {
      electronApp?.quit()
    }, 500)

    return { ok: true }
  } catch (err: unknown) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}
