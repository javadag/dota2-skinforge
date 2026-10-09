// Centralized DOM Element Cache

export const DOM = {
  // Navigation
  navButtons: document.querySelectorAll<HTMLElement>('.snav-btn'),
  tabSections: document.querySelectorAll<HTMLElement>('.tab-section'),
  topbarTitle: document.getElementById('topbarTitle'),
  topbarSub: document.getElementById('topbarSub'),

  // Top Bar Actions
  btnApplyAll: document.getElementById('btnApplyAll') as HTMLButtonElement | null,
  btnRestore: document.getElementById('btnRestore') as HTMLButtonElement | null,
  btnRefreshTop: document.getElementById('btnRefreshTop') as HTMLButtonElement | null,
  dotaRunningPill: document.getElementById('dotaRunningPill'),

  // Status & Progress
  statusIndicator: document.getElementById('statusIndicator'),
  statusLabel: document.getElementById('statusLabel'),
  dotaPathSidebar: document.getElementById('dotaPathSidebar'),
  patchAlert: document.getElementById('patchAlert'),
  btnReapply: document.getElementById('btnReapply') as HTMLButtonElement | null,
  btnDismissAlert: document.getElementById('btnDismissAlert') as HTMLButtonElement | null,
  progressBar: document.getElementById('progressBar'),
  progressMsg: document.getElementById('progressMsg'),
  progressPct: document.getElementById('progressPct'),
  progressFill: document.getElementById('progressFill'),

  // Hero List & Filters
  heroSearch: document.getElementById('heroSearch') as HTMLInputElement | null,
  heroFilters: document.querySelectorAll<HTMLElement>('.hf-btn'),
  heroAttrFilters: document.getElementById('heroAttrFilters'),
  heroListScroll: document.getElementById('heroListScroll'),

  // Hero Slot Panel
  hspEmpty: document.getElementById('hspEmpty'),
  hspEmptyTitle: document.getElementById('hspEmptyTitle'),
  hspEmptyDesc: document.getElementById('hspEmptyDesc'),
  hspContent: document.getElementById('hspContent'),
  hspHeroImg: document.getElementById('hspHeroImg') as HTMLImageElement | null,
  hspHeroName: document.getElementById('hspHeroName'),
  hspHeroAttr: document.getElementById('hspHeroAttr'),
  btnUnlockAllSlots: document.getElementById('btnUnlockAllSlots') as HTMLButtonElement | null,
  btnResetSlots: document.getElementById('btnResetSlots') as HTMLButtonElement | null,
  slotsGrid: document.getElementById('slotsGrid'),
  asbSetName: document.getElementById('asbSetName'),
  btnSaveAsPreset: document.getElementById('btnSaveAsPreset') as HTMLButtonElement | null,

  // Presets Tab
  presetsList: document.getElementById('presetsList'),
  presetsEmpty: document.getElementById('presetsEmpty'),
  btnNewPreset: document.getElementById('btnNewPreset') as HTMLButtonElement | null,

  // Launch Tab
  twNovid: document.getElementById('twNovid') as HTMLInputElement | null,
  twMap: document.getElementById('twMap') as HTMLInputElement | null,
  twHigh: document.getElementById('twHigh') as HTMLInputElement | null,
  twConsole: document.getElementById('twConsole') as HTMLInputElement | null,
  twNojoy: document.getElementById('twNojoy') as HTMLInputElement | null,
  twDx11: document.getElementById('twDx11') as HTMLInputElement | null,
  launchOutput: document.getElementById('launchOutput'),
  btnCopyLaunch: document.getElementById('btnCopyLaunch') as HTMLButtonElement | null,

  // Settings Tab
  settingsDotaPath: document.getElementById('settingsDotaPath'),
  btnChangePathSettings: document.getElementById('btnChangePathSettings') as HTMLButtonElement | null,
  settingsModFolder: document.getElementById('settingsModFolder') as HTMLInputElement | null,
  settingAutoDetect: document.getElementById('settingAutoDetect') as HTMLInputElement | null,
  settingLaunchAfter: document.getElementById('settingLaunchAfter') as HTMLInputElement | null,
  settingConfirmRestore: document.getElementById('settingConfirmRestore') as HTMLInputElement | null,
  settingR2CdnUrl: document.getElementById('settingR2CdnUrl') as HTMLInputElement | null,
  iconCacheStatsLabel: document.getElementById('iconCacheStatsLabel'),
  btnClearIconCache: document.getElementById('btnClearIconCache') as HTMLButtonElement | null,
  btnClearPresets: document.getElementById('btnClearPresets') as HTMLButtonElement | null,
  btnResetSettings: document.getElementById('btnResetSettings') as HTMLButtonElement | null,
  btnSaveSettings: document.getElementById('btnSaveSettings') as HTMLButtonElement | null,
  settingsSavedMsg: document.getElementById('settingsSavedMsg'),

  // Modals
  slotModal: document.getElementById('slotModal'),
  slotModalTitle: document.getElementById('slotModalTitle'),
  slotModalSlotName: document.getElementById('slotModalSlotName'),
  slotModalClose: document.getElementById('slotModalClose') as HTMLButtonElement | null,
  slotModalSearch: document.getElementById('slotModalSearch') as HTMLInputElement | null,
  slotModalList: document.getElementById('slotModalList'),

  presetNameModal: document.getElementById('presetNameModal'),
  presetNameInput: document.getElementById('presetNameInput') as HTMLInputElement | null,
  presetNameClose: document.getElementById('presetNameClose') as HTMLButtonElement | null,
  btnPresetNameCancel: document.getElementById('btnPresetNameCancel') as HTMLButtonElement | null,
  btnPresetNameSave: document.getElementById('btnPresetNameSave') as HTMLButtonElement | null,

  // Console Log Drawer
  consoleToggle: document.getElementById('consoleToggle'),
  consoleBody: document.getElementById('consoleBody'),
  consoleFooter: document.querySelector<HTMLElement>('.console-footer'),
  cfStatus: document.getElementById('cfStatus'),
  logOutput: document.getElementById('logOutput')
}
