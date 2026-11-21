import pkg from '../../../package.json'

export interface AppConfig {
  name: string
  shortName: string
  modFolder: string
  version: string
  displayVersion: string
  tagline: string
  description: string
  githubRepo: string
  cdnUrl: string
  /**
   * HTTPS endpoint of the bug-report relay (`workers/bug-report`). Public by design: it holds no
   * secret. Leave empty until the Worker is deployed; the in-app form then reports "not configured".
   */
  bugReportUrl: string
}

export const APP_CONFIG: AppConfig = {
  name: pkg.productName || 'Dota 2 SkinForge',
  shortName: pkg.shortName || 'SkinForge',
  modFolder: pkg.modFolder || 'skinforge',
  version: pkg.version,
  displayVersion: `v${pkg.version}`,
  tagline: pkg.tagline || 'Cosmetic Suite',
  description: pkg.description || 'Local Dota 2 cosmetic suite via VPK modding',
  githubRepo: 'javadag/dota2-skinforge',
  cdnUrl: 'https://dota2skinforge.space',
  bugReportUrl: 'https://skinforge-bug-report.j-aghebati93.workers.dev'
}

const MOD_FOLDER_PATTERN = /^[A-Za-z0-9_-]{1,64}$/

const RESERVED_MOD_FOLDERS = new Set([
  'dota',
  'core',
  'bin',
  'dota_core',
  'dota_addons',
  'dota_lv',
  'dota_imported',
  'game',
  'content',
  'con',
  'prn',
  'aux',
  'nul',
  'com1',
  'com2',
  'com3',
  'com4',
  'com5',
  'com6',
  'com7',
  'com8',
  'com9',
  'lpt1',
  'lpt2',
  'lpt3',
  'lpt4',
  'lpt5',
  'lpt6',
  'lpt7',
  'lpt8',
  'lpt9'
])

/** True when `value` is a safe single folder name inside `dota 2 beta/game/`. */
export function isValidModFolder(value: string): boolean {
  const trimmed = value.trim()
  return MOD_FOLDER_PATTERN.test(trimmed) && !RESERVED_MOD_FOLDERS.has(trimmed.toLowerCase())
}

/** Return a safe mod folder name, falling back to `APP_CONFIG.modFolder` for invalid or reserved names. */
export function sanitizeModFolder(raw: unknown, fallback = APP_CONFIG.modFolder): string {
  const safeFallback = isValidModFolder(fallback) ? fallback.trim() : 'skinforge'
  if (typeof raw !== 'string') return safeFallback
  const trimmed = raw.trim()
  return isValidModFolder(trimmed) ? trimmed : safeFallback
}
