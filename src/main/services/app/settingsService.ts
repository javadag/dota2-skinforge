/**
 * User Settings Persistence & Migration Service
 *
 * Centralizes reading, writing, sanitizing, and migrating `skinforge_settings.json`
 * across IPC handlers and main-process services.
 */

import fs from 'fs'
import path from 'path'
import { APP_CONFIG, sanitizeModFolder } from '../../../shared/constants/appConfig'
import type { AppSettingsPayload } from '../../../shared/types/ipc'
import { getElectronApp, getSettingsFilePath } from './appPaths'

export function readStoredSettings(): AppSettingsPayload {
  const file = getSettingsFilePath()
  if (!file || !fs.existsSync(file)) return {}
  try {
    const parsed: unknown = JSON.parse(fs.readFileSync(file, 'utf-8'))
    return parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as AppSettingsPayload) : {}
  } catch {
    return {}
  }
}

export function writeStoredSettings(settings: AppSettingsPayload): void {
  if (!settings || typeof settings !== 'object' || Array.isArray(settings)) {
    throw new Error('Invalid settings payload.')
  }
  const file = getSettingsFilePath()
  if (!file) throw new Error('User data directory is unavailable.')
  const next: AppSettingsPayload = { ...settings }
  if (typeof next.modFolder === 'string') {
    next.modFolder = sanitizeModFolder(next.modFolder)
  }
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, JSON.stringify(next, null, 2), 'utf-8')
}

/** Normalised mod folder name; strictly allowlisted so it can never traverse or match core Dota dirs. */
export function storedModFolder(fallback = APP_CONFIG.modFolder): string {
  return sanitizeModFolder(readStoredSettings().modFolder, fallback)
}

/**
 * Migrates legacy settings from `%appData%/Electron` to `%appData%/<APP_CONFIG.name>`
 * if the destination does not already have settings.
 */
export function migrateLegacySettings(legacyDir?: string, targetDir?: string): boolean {
  try {
    let legDir = legacyDir
    let tgtDir = targetDir

    if (!legDir || !tgtDir) {
      const electronApp = getElectronApp()
      if (!electronApp || typeof electronApp.getPath !== 'function') return false
      const appData = electronApp.getPath('appData')
      legDir = legDir || path.join(appData, 'Electron')
      tgtDir = tgtDir || path.join(appData, APP_CONFIG.name)
    }

    const legacyFile = path.join(legDir, 'skinforge_settings.json')
    const targetFile = path.join(tgtDir, 'skinforge_settings.json')

    if (!fs.existsSync(legacyFile) || fs.existsSync(targetFile)) return false

    fs.mkdirSync(tgtDir, { recursive: true })
    fs.copyFileSync(legacyFile, targetFile)
    console.log(`[SettingsService] Migrated legacy settings from ${legacyFile} to ${targetFile}`)
    return true
  } catch (err) {
    console.warn('[SettingsService] Failed to migrate legacy settings:', err)
    return false
  }
}
