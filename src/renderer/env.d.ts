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

export type ModInstallResult =
  { success: true; patchedCount: number; report?: ModCompileReport } | { success: false; error: string; patchedCount?: number }

/** Mirrors `src/main/services/modifier/plan.ts` and `compile.ts`. */
export type ModPatchReason = 'requested' | 'set-companion' | 'persona-activation' | 'persona-piece' | 'persona-hide'

export interface ModAppliedPatch {
  hero: string
  slot: string
  itemName: string
  targetId: string
  reason: ModPatchReason
  style: number
  assumedSlot?: string
}

export interface ModCompileReport {
  patchedCount: number
  itemsTouched: number
  applied: ModAppliedPatch[]
  warnings: string[]
  skipped: Array<{ hero: string; slot: string; itemName: string; reason: string }>
  validation: { ok: boolean; itemCountBefore: number; itemCountAfter: number; errors: string[] }
  entityModelOverrides?: Array<{ hero: string; baseModel: string; overrideModel: string }>
}

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
  mods?: number
}

export interface InitialDataPayload {
  appInfo: import('../shared/constants/appConfig').AppConfig
  dotaPath: string
  status: PipelineStatus
  heroes: HeroEntry[]
  categories?: HeroEntry[]
  groups: Array<{ key: string; title: string }> | string[]
}

export interface AppSettingsPayload {
  dotaPath?: string
  modFolder?: string
  autoDetect?: boolean
  launchAfter?: boolean
  confirmRestore?: boolean
  autoCheckUpdates?: boolean
  r2CdnUrl?: string
}

export interface UpdateAsset {
  name: string
  size: number
  browser_download_url: string
}

export interface UpdateInfo {
  updateAvailable: boolean
  version?: string
  displayVersion?: string
  currentVersion?: string
  name?: string
  releaseNotes?: string
  publishedAt?: string
  htmlUrl?: string
  assets?: UpdateAsset[]
  portableAsset?: UpdateAsset
  installerAsset?: UpdateAsset
  error?: string
}

export interface UpdateDownloadProgress {
  percent: number
  bytesReceived: number
  totalBytes: number
  speedBytesPerSec: number
}

export interface SkinforgeBridge {
  appInfo: import('../shared/constants/appConfig').AppConfig
  getInitialData: () => Promise<InitialDataPayload>
  checkStatus: (customPath?: string) => Promise<PipelineStatus>
  selectDirectory: () => Promise<SelectDirectoryResult | null>
  installMods: (
    customPath?: string,
    equipped?: Record<string, Record<string, string>>,
    customizations?: import('../shared/types/customization').HeroCustomizationsMap
  ) => Promise<ModInstallResult>
  uninstallMods: (customPath?: string) => Promise<ModUninstallResult>
  openExternal: (url: string) => Promise<void>
  readSettings: () => Promise<AppSettingsPayload>
  writeSettings: (settings: AppSettingsPayload) => Promise<{ ok: true } | { ok: false; error: string }>
  getCacheStats: () => Promise<{ count: number; sizeBytes: number; formattedSize: string }>
  clearIconCache: () => Promise<boolean>
  onInstallProgress: (callback: (progress: InstallProgress) => void) => void
  checkForUpdates: () => Promise<UpdateInfo>
  downloadUpdate: (payload: { assetUrl: string; filename: string }) => Promise<{ ok: boolean; filePath?: string; error?: string }>
  installUpdate: (payload: { filePath: string }) => Promise<{ ok: boolean; error?: string }>
  onUpdateProgress: (callback: (progress: UpdateDownloadProgress) => void) => () => void
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
