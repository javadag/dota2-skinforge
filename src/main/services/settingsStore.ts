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
