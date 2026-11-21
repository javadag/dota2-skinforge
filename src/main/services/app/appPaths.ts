/**
 * Application Path & Runtime Environment Service
 *
 * Single source of truth for project root, resource directories, writable state/cache paths,
 * lazy Electron `app` resolution, and local `.env` loading across dev, packaged, and CLI contexts.
 */

import fs from 'fs'
import path from 'path'
import { APP_CONFIG } from '../../../shared/constants/appConfig'

let cachedRoot: string | null = null

export function getElectronApp(): typeof import('electron').app | null {
  try {
    const electron = require('electron') as { app?: typeof import('electron').app }
    return electron?.app ?? null
  } catch {
    return null
  }
}

export function getRuntimeAppVersion(): string {
  const electronApp = getElectronApp()
  return (typeof electronApp?.getVersion === 'function' && electronApp.getVersion()) || APP_CONFIG.version
}

export function getAppRoot(): string {
  if (cachedRoot) return cachedRoot

  const electronApp = getElectronApp()
  if (electronApp && typeof electronApp.isPackaged === 'boolean' && electronApp.isPackaged) {
    const appPath = electronApp.getAppPath()
    if (typeof appPath === 'string' && appPath.length > 0) {
      cachedRoot = appPath
      return appPath
    }
  }

  let current = __dirname
  while (current && current !== path.dirname(current)) {
    if (fs.existsSync(path.join(current, 'package.json'))) {
      cachedRoot = current
      return current
    }
    current = path.dirname(current)
  }

  const cwd = process.cwd()
  cachedRoot = cwd
  return cwd
}

export function getDataPath(...subpaths: string[]): string {
  if (typeof process !== 'undefined' && process.resourcesPath) {
    const resourcePath = path.join(process.resourcesPath, 'data', ...subpaths)
    if (fs.existsSync(resourcePath)) return resourcePath
  }
  return path.join(getAppRoot(), 'data', ...subpaths)
}

export function getAssetsPath(...subpaths: string[]): string {
  if (typeof process !== 'undefined' && process.resourcesPath) {
    const resourcePath = path.join(process.resourcesPath, 'assets', ...subpaths)
    if (fs.existsSync(resourcePath)) return resourcePath
  }
  return path.join(getAppRoot(), 'assets', ...subpaths)
}

function getUserDataDir(): string | null {
  const electronApp = getElectronApp()
  if (electronApp && typeof electronApp.getPath === 'function') {
    return electronApp.getPath('userData')
  }
  return null
}

export function getStagingPackPath(): string {
  const electronApp = getElectronApp()
  if (electronApp && typeof electronApp.isPackaged === 'boolean' && electronApp.isPackaged) {
    return path.join(electronApp.getPath('userData'), '.staging_pack')
  }
  return path.join(getAppRoot(), '.staging_pack')
}

/** Writable file path inside `.state/`, creating parent directories if needed. */
export function ensureStateFilePath(...subpaths: string[]): string {
  const electronApp = getElectronApp()
  const root =
    electronApp && electronApp.isPackaged ? path.join(electronApp.getPath('userData'), '.state') : path.join(getAppRoot(), '.state')
  const full = path.join(root, ...subpaths)
  fs.mkdirSync(path.dirname(full), { recursive: true })
  return full
}

export function getSettingsFilePath(): string | null {
  const userData = getUserDataDir()
  return userData ? path.join(userData, 'skinforge_settings.json') : null
}

export function getUpdatesDir(overrideDir?: string): string {
  if (overrideDir) return overrideDir
  const baseDir = getUserDataDir() || path.join(getAppRoot(), '.state')
  return path.join(baseDir, 'updates')
}

export function getAssetCacheDir(): string {
  const envCache = process.env.SKINFORGE_ASSET_CACHE?.trim()
  if (envCache) return envCache
  const userData = getUserDataDir()
  if (userData) {
    return path.join(userData, 'assets', 'cosmetic-assets')
  }
  return path.join(getAppRoot(), '.cache', 'cosmetic-assets')
}

export function getBugReportStatePath(): string {
  const userData = getUserDataDir()
  return userData ? path.join(userData, 'bug_report_state.json') : path.join(getAppRoot(), '.state', 'bug_report_state.json')
}

export function getStagingIconsPath(...subpaths: string[]): string {
  return path.join(getAppRoot(), '.staging_icons', 'webp', ...subpaths)
}

export function getItemIconPackDir(): string {
  const userData = getUserDataDir()
  return userData ? path.join(userData, 'icon_pack') : path.join(getAppRoot(), '.state', 'icon_pack')
}

export function getAbilityIconPackDir(): string {
  return path.join(path.dirname(getItemIconPackDir()), 'ability-icons')
}

export function getBundledIconPackPath(): string {
  return getAssetsPath('icon-pack.tar.br')
}

export function getBundledIconPackManifestPath(): string {
  return getAssetsPath('icon-pack.json')
}

/**
 * Loads unset variables from `<repo>/.env` in unpackaged dev/CLI runs so local overrides
 * like `SKINFORGE_ASSET_SOURCE` work without hardcoding machine-specific paths in code.
 */
export function loadLocalEnvFile(): void {
  const electronApp = getElectronApp()
  if (electronApp && typeof electronApp.isPackaged === 'boolean' && electronApp.isPackaged) return

  const envPath = path.join(getAppRoot(), '.env')
  if (!fs.existsSync(envPath)) return

  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eqIndex = trimmed.indexOf('=')
    if (eqIndex <= 0) continue
    const key = trimmed.slice(0, eqIndex).trim()
    if (!key || process.env[key] !== undefined) continue
    const rawValue = trimmed.slice(eqIndex + 1).trim()
    process.env[key] = rawValue.replace(/^(['"])(.*)\1$/, '$2')
  }
}
