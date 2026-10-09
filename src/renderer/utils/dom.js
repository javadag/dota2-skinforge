// Centralized DOM Element Cache
export const DOM = {
  // Navigation
  navButtons: document.querySelectorAll('.snav-btn'),
  tabSections: document.querySelectorAll('.tab-section'),
  topbarTitle: document.getElementById('topbarTitle'),
  topbarSub: document.getElementById('topbarSub'),

  // Top Bar Actions
  btnApplyAll: document.getElementById('btnApplyAll'),
  btnRestore: document.getElementById('btnRestore'),
  btnRefreshTop: document.getElementById('btnRefreshTop'),
  dotaRunningPill: document.getElementById('dotaRunningPill'),

  // Status & Progress
  statusIndicator: document.getElementById('statusIndicator'),
  statusLabel: document.getElementById('statusLabel'),
  dotaPathSidebar: document.getElementById('dotaPathSidebar'),
  patchAlert: document.getElementById('patchAlert'),
  btnReapply: document.getElementById('btnReapply'),
  btnDismissAlert: document.getElementById('btnDismissAlert'),
  progressBar: document.getElementById('progressBar'),
  progressMsg: document.getElementById('progressMsg'),
  progressPct: document.getElementById('progressPct'),
  progressFill: document.getElementById('progressFill'),

  // Hero List & Filters
  heroSearch: document.getElementById('heroSearch'),
  heroFilters: document.querySelectorAll('.hf-btn'),
  heroAttrFilters: document.getElementById('heroAttrFilters'),
  heroListScroll: document.getElementById('heroListScroll'),

  // Hero Slot Panel
  hspEmpty: document.getElementById('hspEmpty'),
  hspEmptyTitle: document.getElementById('hspEmptyTitle'),
  hspEmptyDesc: document.getElementById('hspEmptyDesc'),
  hspContent: document.getElementById('hspContent'),
  hspHeroImg: document.getElementById('hspHeroImg'),
  hspHeroName: document.getElementById('hspHeroName'),
  hspHeroAttr: document.getElementById('hspHeroAttr'),
  btnUnlockAllSlots: document.getElementById('btnUnlockAllSlots'),
  btnResetSlots: document.getElementById('btnResetSlots'),
  slotsGrid: document.getElementById('slotsGrid'),
  asbSetName: document.getElementById('asbSetName'),
  btnSaveAsPreset: document.getElementById('btnSaveAsPreset'),

  // Presets Tab
  presetsList: document.getElementById('presetsList'),
  presetsEmpty: document.getElementById('presetsEmpty'),
  btnNewPreset: document.getElementById('btnNewPreset'),

  // Launch Tab
  twNovid: document.getElementById('twNovid'),
  twMap: document.getElementById('twMap'),
  twHigh: document.getElementById('twHigh'),
  twConsole: document.getElementById('twConsole'),
  twNojoy: document.getElementById('twNojoy'),
  twDx11: document.getElementById('twDx11'),
  launchOutput: document.getElementById('launchOutput'),
  btnCopyLaunch: document.getElementById('btnCopyLaunch'),

  // Settings Tab
  settingsDotaPath: document.getElementById('settingsDotaPath'),
  btnChangePathSettings: document.getElementById('btnChangePathSettings'),
  settingsModFolder: document.getElementById('settingsModFolder'),
  settingAutoDetect: document.getElementById('settingAutoDetect'),
  settingLaunchAfter: document.getElementById('settingLaunchAfter'),
  settingConfirmRestore: document.getElementById('settingConfirmRestore'),
  btnClearPresets: document.getElementById('btnClearPresets'),
  btnResetSettings: document.getElementById('btnResetSettings'),
  btnSaveSettings: document.getElementById('btnSaveSettings'),
  settingsSavedMsg: document.getElementById('settingsSavedMsg'),

  // Modals
  slotModal: document.getElementById('slotModal'),
  slotModalTitle: document.getElementById('slotModalTitle'),
  slotModalSlotName: document.getElementById('slotModalSlotName'),
  slotModalClose: document.getElementById('slotModalClose'),
  slotModalSearch: document.getElementById('slotModalSearch'),
  slotModalList: document.getElementById('slotModalList'),

  presetNameModal: document.getElementById('presetNameModal'),
  presetNameInput: document.getElementById('presetNameInput'),
  presetNameClose: document.getElementById('presetNameClose'),
  btnPresetNameCancel: document.getElementById('btnPresetNameCancel'),
  btnPresetNameSave: document.getElementById('btnPresetNameSave'),

  // Console Log Drawer
  consoleToggle: document.getElementById('consoleToggle'),
  consoleBody: document.getElementById('consoleBody'),
  consoleFooter: document.querySelector('.console-footer'),
  cfStatus: document.getElementById('cfStatus'),
  logOutput: document.getElementById('logOutput'),
};
