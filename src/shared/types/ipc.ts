/**
 * Shared IPC & domain contracts between Main, Preload, and Renderer.
 */

import type { BugReportComment, BugReportDiagnostics, BugReportResult } from '../utils/bugReport'
import type { AppConfig } from '../constants/appConfig'
import type { LaunchOptionsSettings } from '../constants/launchOptions'
import type { HeroAbilityIconOverrides, HeroAbilityIcons } from './abilityIcons'
import type { HeroCustomizationsMap } from './customization'

export const IPC_CHANNELS = {
  systemGetInitialData: 'system:get-initial-data',
  systemOpenExternal: 'system:open-external',
  systemLaunchDota: 'system:launch-dota',

  modsCheckStatus: 'mods:check-status',
  modsGetHeroAbilityIcons: 'mods:get-hero-ability-icons',
  modsInstall: 'mods:install',
  modsUninstall: 'mods:uninstall',
  modsInstallProgress: 'mods:install-progress',

  settingsSelectDotaDir: 'settings:select-dota-dir',
  settingsRead: 'settings:read',
  settingsWrite: 'settings:write',
  settingsGetIconPackStats: 'settings:get-icon-pack-stats',
  settingsResetIconPacks: 'settings:reset-icon-packs',

  updateCheck: 'update:check',
  updateGetReleaseNotes: 'update:get-release-notes',
  updateDownload: 'update:download',
  updateInstall: 'update:install',
  updateDownloadProgress: 'update:download-progress',

  bugReportContext: 'bug-report:context',
  bugReportCaptureScreenshot: 'bug-report:capture-screenshot',
  bugReportPickScreenshot: 'bug-report:pick-screenshot',
  bugReportSubmit: 'bug-report:submit',
  bugReportList: 'bug-report:list',
  bugReportComment: 'bug-report:comment'
} as const

export interface StepProgress {
  step: number
  total: number
  message: string
}

export type ProgressCallback = (progress: StepProgress) => void

export interface PipelineStatus {
  validDotaDir: boolean
  dotaRunning: boolean
  installed: boolean
  signaturesBypassed: boolean
  gameinfoConfigured: boolean
  vpkFileExists?: boolean
}

export interface InstallReportPayload {
  patchedCount: number
  itemsTouched?: number
  warnings?: string[]
  skipped?: Array<{ hero: string; slot: string; itemName?: string; reason: string }>
  modelOverrides?: number
  modelSwaps?: number
  overlays?: Array<{ id: string; name: string; hero: string }>
  overlayFiles?: number
  overlayBytes?: number
  overlayMissing?: string[]
}

export type ModInstallResult =
  { success: true; patchedCount: number; report?: InstallReportPayload } | { success: false; error: string; patchedCount?: number }

export type ModUninstallResult = { success: true } | { success: false; error: string }

export interface SelectDirectoryResult {
  path: string
  isValid: boolean
}

export interface InitialDataPayload {
  appInfo: AppConfig
  dotaPath: string | null
  status: PipelineStatus
}

export interface AppSettings {
  dotaPath: string
  modFolder: string
  autoDetect: boolean
  launchAfter: boolean
  confirmRestore: boolean
  autoCheckUpdates: boolean
  lastSeenWhatsNewVersion?: string
  launchOptions?: LaunchOptionsSettings
}

export type AppSettingsPayload = Partial<AppSettings>

export interface IconCacheStats {
  count: number
  sizeBytes: number
  formattedSize: string
}

export interface UpdateAsset {
  name: string
  size: number
  browser_download_url: string
  sha256?: string
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
  checksumsAsset?: UpdateAsset
  error?: string
}

export interface ReleaseNotesInfo {
  version: string
  releaseNotes: string
  publishedAt: string
  htmlUrl: string
  loading?: boolean
  error?: string
}

export interface UpdateDownloadProgress {
  percent: number
  bytesReceived: number
  totalBytes: number
  speedBytesPerSec: number
}

export interface BugScreenshotResult {
  ok: boolean
  canceled?: boolean
  error?: string
  mime?: 'image/png' | 'image/jpeg'
  dataBase64?: string
  sizeBytes?: number
}

export interface BugReportSubmitInput {
  title: string
  description: string
  steps?: string
  logs?: string
  includeLogs: boolean
  diagnostics: BugReportDiagnostics
  screenshot?: { mime: string; dataBase64: string }
}

export interface TrackedBugReportItem {
  issueNumber: number
  issueUrl: string
  title: string
  submittedAt: number
  state: 'open' | 'closed' | 'unknown'
  stateReason?: string | null
  labels: string[]
  updatedAt?: string
  comments: BugReportComment[]
}

export interface BugReportListResult {
  ok: boolean
  reports: TrackedBugReportItem[]
  offline?: boolean
  error?: string
}

export interface BugReportCommentInput {
  issueNumber: number
  message: string
  screenshot?: { mime: string; dataBase64: string }
}

export interface BugReportCommentResult {
  ok: boolean
  comment?: BugReportComment
  error?: string
}

export interface SkinforgeBridge {
  getInitialData: () => Promise<InitialDataPayload>
  checkStatus: (customPath?: string) => Promise<PipelineStatus>
  selectDirectory: () => Promise<SelectDirectoryResult | null>
  getHeroAbilityIcons: (
    customPath: string,
    hero: string,
    slots: Record<string, string>,
    styles: Record<string, { style?: number }>
  ) => Promise<HeroAbilityIcons | null>
  installMods: (
    customPath?: string,
    equipped?: Record<string, Record<string, string>>,
    customizations?: HeroCustomizationsMap,
    abilityIcons?: HeroAbilityIconOverrides
  ) => Promise<ModInstallResult>
  uninstallMods: (customPath?: string) => Promise<ModUninstallResult>
  openExternal: (url: string) => Promise<void>
  launchDota: (launchArgs?: string) => Promise<{ success: boolean; method?: string; error?: string }>
  readSettings: () => Promise<AppSettingsPayload>
  writeSettings: (settings: AppSettingsPayload) => Promise<{ ok: true } | { ok: false; error: string }>
  getCacheStats: () => Promise<IconCacheStats>
  clearIconCache: () => Promise<boolean>
  onInstallProgress: (callback: (progress: StepProgress) => void) => () => void
  checkForUpdates: () => Promise<UpdateInfo>
  getReleaseNotes: (version: string) => Promise<ReleaseNotesInfo>
  downloadUpdate: (payload: {
    assetUrl: string
    filename: string
    expectedSha256?: string
  }) => Promise<{ ok: boolean; filePath?: string; sha256?: string; error?: string }>
  installUpdate: (payload: { filePath: string; expectedSha256?: string }) => Promise<{ ok: boolean; error?: string }>
  getBugReportContext: (input?: { activeTab?: string; dotaFound?: boolean; modsInstalled?: boolean }) => Promise<{
    diagnostics: BugReportDiagnostics
    errors: string
    configured: boolean
  }>
  captureBugScreenshot: () => Promise<BugScreenshotResult>
  pickBugScreenshot: () => Promise<BugScreenshotResult>
  submitBugReport: (input: BugReportSubmitInput) => Promise<BugReportResult>
  listBugReports: () => Promise<BugReportListResult>
  commentOnBugReport: (input: BugReportCommentInput) => Promise<BugReportCommentResult>
  onUpdateProgress: (callback: (progress: UpdateDownloadProgress) => void) => () => void
}

declare global {
  interface Window {
    skinforge: SkinforgeBridge
    appInfo: AppConfig
  }
}
