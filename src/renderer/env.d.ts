/// <reference types="vite/client" />

export interface InstallProgress {
  step: number
  total: number
  message: string
}

export interface PipelineStatus {
  validDotaDir: boolean
  dotaRunning: boolean
  installed: boolean
  signaturesBypassed: boolean
  gameinfoConfigured: boolean
  vpkFileExists?: boolean
}

export type StatusResult = PipelineStatus

export type ModInstallResult = { success: true; patchedCount: number } | { success: false; error: string; patchedCount?: number }

export type ModUninstallResult = { success: true } | { success: false; error: string }

export interface SelectDirectoryResult {
  path: string
  isValid: boolean
}

export interface HeroEntry {
  tag: string
  name?: string
  attr?: string
  g?: string
  alias?: string[]
  img?: string
  mods?: string
}

export interface InitialDataPayload {
  appInfo: import('../shared/constants/appConfig').AppConfig
  dotaPath: string
  status: PipelineStatus
  heroes: HeroEntry[]
  groups: string[]
}

export interface AppSettingsPayload {
  dotaPath?: string
  modFolder?: string
  autoDetect?: boolean
  launchAfter?: boolean
  confirmRestore?: boolean
  r2CdnUrl?: string
}

export interface SkinforgeBridge {
  appInfo: import('../shared/constants/appConfig').AppConfig
  getInitialData: () => Promise<InitialDataPayload>
  checkStatus: (customPath?: string) => Promise<PipelineStatus>
  selectDirectory: () => Promise<SelectDirectoryResult | null>
  installMods: (customPath?: string, equipped?: Record<string, Record<string, string>>) => Promise<ModInstallResult>
  uninstallMods: (customPath?: string) => Promise<ModUninstallResult>
  openExternal: (url: string) => Promise<void>
  readSettings: () => Promise<AppSettingsPayload>
  writeSettings: (settings: AppSettingsPayload) => Promise<{ ok: true } | { ok: false; error: string }>
  getCacheStats: () => Promise<{ count: number; sizeBytes: number; formattedSize: string }>
  clearIconCache: () => Promise<boolean>
  onInstallProgress: (callback: (progress: InstallProgress) => void) => void
}

declare global {
  interface Window {
    skinforge: SkinforgeBridge
    appInfo: import('../shared/constants/appConfig').AppConfig
    heroAliases?: {
      HERO_ALIASES: Record<string, string>
      getCanonicalHero: (tag?: string) => string
    }
  }
}
