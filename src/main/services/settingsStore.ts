/**
 * Read access to the persisted user settings from the main process.
 *
 * Kept separate from `settingsIpc` so services (and CLI scripts) can read the mod folder
 * without pulling in Electron IPC registration. `electron` is resolved lazily so the
 * same module works under plain Node.
 */

import fs from 'fs'
import path from 'path'

export interface StoredSettings {
  dotaPath?: string
  modFolder?: string
  [key: string]: unknown
}

function userDataDir(): string | null {
  try {
    const { app } = require('electron') as { app?: { getPath?: (name: string) => string } }
    if (app && typeof app.getPath === 'function') return app.getPath('userData')
  } catch {
    // Not running inside Electron.
  }
  return null
}

export function settingsFilePath(): string | null {
  const dir = userDataDir()
  return dir ? path.join(dir, 'skinforge_settings.json') : null
}

export function readStoredSettings(): StoredSettings {
  const file = settingsFilePath()
  if (!file || !fs.existsSync(file)) return {}
  try {
    return JSON.parse(fs.readFileSync(file, 'utf-8')) as StoredSettings
  } catch {
    return {}
  }
}

/** Normalised mod folder name; never empty, never containing path separators. */
export function storedModFolder(fallback = 'skinforge'): string {
  const raw = readStoredSettings().modFolder
  if (typeof raw !== 'string') return fallback
  const name = raw.trim().replace(/[\\/:*?"<>|]/g, '')
  return name || fallback
}

/**
 * Migrates legacy settings from %appData%/Electron to %appData%/Dota 2 SkinForge
 * if the destination does not already have settings.
 */
export function migrateLegacySettings(legacyDir?: string, targetDir?: string): boolean {
  try {
    let legDir = legacyDir
    let tgtDir = targetDir

    if (!legDir || !tgtDir) {
      const electronApp = userDataDir()
      if (!electronApp) return false
      try {
        const { app } = require('electron') as { app?: { getPath?: (name: string) => string } }
        const appData = app?.getPath?.('appData') || ''
        legDir = legDir || path.join(appData, 'Electron')
        tgtDir = tgtDir || path.join(appData, 'Dota 2 SkinForge')
      } catch {
        return false
      }
    }

    const legacyFile = path.join(legDir, 'skinforge_settings.json')
    const targetFile = path.join(tgtDir, 'skinforge_settings.json')

    if (!fs.existsSync(legacyFile)) return false
    if (fs.existsSync(targetFile)) return false

    if (!fs.existsSync(tgtDir)) {
      fs.mkdirSync(tgtDir, { recursive: true })
    }

    fs.copyFileSync(legacyFile, targetFile)
    console.log(`[SettingsStore] Migrated legacy settings from ${legacyFile} to ${targetFile}`)
    return true
  } catch (err) {
    console.warn('[SettingsStore] Failed to migrate legacy settings:', err)
    return false
  }
}
