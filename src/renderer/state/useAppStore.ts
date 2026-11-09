import { create } from 'zustand'
import type { CategoryKey } from '../../data/categoryMeta'
import type { HeroAttribute } from '../../shared/constants/attributes'
import type { HeroCustomizationsMap, ItemCustomization } from '../../shared/types/customization'
import { formatHeroName, getHeroSlotsDefinition, initCatalog, type CatalogSlot, type HeroCatalogEntry } from '../components/slotGenerator'
import type { HeroEntry, InstallProgress, PipelineStatus } from '../env'
import type { HeroSet } from '../utils/heroSets'

export type AppTab = 'heroes' | 'presets' | 'launch' | 'settings' | 'about'
export type AttributeFilter = 'all' | HeroAttribute
export type CategoryGroup = CategoryKey

export interface Preset {
  id: string
  name: string
  timestamp: number
  heroSlots: Record<string, Record<string, string>>
}

export interface LaunchOptionsSettings {
  novid: boolean
  map: boolean
  high: boolean
  console: boolean
  nojoy: boolean
  dx11: boolean
  customArgs?: string
}

export interface AppSettings {
  dotaPath: string
  modFolder: string
  autoDetect: boolean
  launchAfter: boolean
  confirmRestore: boolean
  autoCheckUpdates: boolean
  launchOptions?: LaunchOptionsSettings
}

export const DEFAULT_LAUNCH_OPTIONS: LaunchOptionsSettings = {
  novid: true,
  map: true,
  high: true,
  console: false,
  nojoy: true,
  dx11: false,
  customArgs: ''
}

export function buildLaunchArgsString(options?: Partial<LaunchOptionsSettings>): string {
  const opts = { ...DEFAULT_LAUNCH_OPTIONS, ...(options || {}) }
  const flags: string[] = []
  if (opts.novid) flags.push('-novid')
  if (opts.map) flags.push('-map dota')
  if (opts.high) flags.push('-high')
  if (opts.console) flags.push('-console')
  if (opts.nojoy) flags.push('-nojoy')
  if (opts.dx11) flags.push('-dx11')
  if (opts.customArgs && opts.customArgs.trim()) {
    flags.push(opts.customArgs.trim())
  }
  return flags.join(' ')
}

export interface LogEntry {
  id: string
  time: string
  message: string
  type: 'info' | 'warn' | 'error' | 'success'
}

export interface CacheStats {
  count: number
  sizeBytes: number
  formattedSize: string
}

export interface AppStoreState {
  // Navigation & Filtering
  activeTab: AppTab
  activeCategoryGroup: CategoryGroup
  attrFilter: AttributeFilter
  searchQuery: string

  // Hero & Equipment State
  heroes: HeroEntry[]
  categories: HeroEntry[]
  selectedHero: HeroEntry | null
  heroSlots: Record<string, Record<string, string>>
  heroStanceSlots: Record<string, { default?: Record<string, string>; persona?: Record<string, string> }>
  heroActiveStance: Record<string, 'default' | 'persona'>
  heroCustomizations: HeroCustomizationsMap
  activeCatalog: HeroCatalogEntry | null

  // Modals & Panels
  activeModalSlot: CatalogSlot | null
  modalRarityFilter: string
  modalSearchQuery: string
  isPresetModalOpen: boolean
  patchAlertVisible: boolean
  isConsoleOpen: boolean

  // System & IPC State
  dotaPath: string
  status: PipelineStatus | null
  isBusy: boolean
  progress: InstallProgress | null
  presets: Preset[]
  settings: AppSettings
  cacheStats: CacheStats | null
  logs: LogEntry[]

  // Update State
  updateStatus: 'idle' | 'checking' | 'available' | 'up-to-date' | 'downloading' | 'downloaded' | 'error'
  updateInfo: import('../env').UpdateInfo | null
  updateProgress: import('../env').UpdateDownloadProgress | null
  downloadedUpdatePath: string | null
  downloadedUpdateSha256: string | null
  isUpdateModalOpen: boolean
  isBugReportOpen: boolean
  // Actions
  setTab: (tab: AppTab, category?: CategoryGroup | null) => void
  setCategoryGroup: (group: CategoryGroup) => void
  setAttrFilter: (attr: AttributeFilter) => void
  setSearchQuery: (query: string) => void
  setSelectedHero: (hero: HeroEntry | null) => void
  setHeroSlot: (heroTag: string, slotId: string, itemName: string) => void
  setSlotCustomization: (heroTag: string, slotId: string, customization: Partial<ItemCustomization>) => void
  resetHeroSlot: (heroTag: string, slotId: string) => void
  resetAllHeroSlots: (heroTag: string) => void
  clearAllEquippedSlots: () => void
  setHeroActiveStance: (heroTag: string, stance: 'default' | 'persona') => void
  equipSet: (heroTag: string, set: HeroSet) => void
  unlockBestSet: (hero: HeroEntry) => void

  // Modals
  openSlotModal: (hero: HeroEntry, slot: CatalogSlot) => void
  closeSlotModal: () => void
  setModalRarityFilter: (rarity: string) => void
  setModalSearchQuery: (query: string) => void
  openPresetModal: () => void
  closePresetModal: () => void

  // Presets
  addPreset: (name: string) => void
  applyPreset: (preset: Preset) => void
  deletePreset: (presetId: string) => void
  clearAllPresets: () => void

  // Settings
  updateSettings: (newSettings: Partial<AppSettings>) => void
  saveSettings: () => Promise<boolean>
  resetSettings: () => void
  selectDotaDirectory: () => Promise<void>
  clearIconCache: () => Promise<void>

  // Mod Pipeline & System
  applyMods: () => Promise<void>
  restoreMods: () => Promise<void>
  installBundle: () => Promise<void>
  refreshStatus: () => Promise<void>
  launchDota: () => void

  // Update Actions
  checkForUpdates: (manual?: boolean) => Promise<void>
  downloadUpdate: (assetUrl: string, filename: string, expectedSha256?: string) => Promise<void>
  installUpdate: () => Promise<void>
  setUpdateModalOpen: (open: boolean) => void
  setBugReportOpen: (open: boolean) => void
  // UI Utilities
  addLog: (message: string, type?: 'info' | 'warn' | 'error' | 'success') => void
  toggleConsole: () => void
  setPatchAlertVisible: (visible: boolean) => void
  initApp: () => Promise<void>
}

/** Rarest-first ordering used by "Unlock Best Set". */
const RARITY_RANK: Record<string, number> = {
  arcana: 8,
  immortal: 7,
  legendary: 6,
  mythical: 5,
  rare: 4,
  uncommon: 3,
  common: 2,
  seasonal: 1,
  persona: 1,
  taunt: 0
}

function rarityRank(rarity?: string): number {
  return RARITY_RANK[(rarity || '').toLowerCase()] ?? 0
}

function getStoredPresets(): Preset[] {
  try {
    const data = localStorage.getItem('skinforge_presets')
    return data ? (JSON.parse(data) as Preset[]) : []
  } catch {
    return []
  }
}

function getStoredHeroSlots(): Record<string, Record<string, string>> {
  try {
    const data = localStorage.getItem('skinforge_hero_slots')
    return data ? (JSON.parse(data) as Record<string, Record<string, string>>) : {}
  } catch {
    return {}
  }
}

function getStoredActiveStances(): Record<string, 'default' | 'persona'> {
  try {
    const data = localStorage.getItem('skinforge_hero_active_stance')
    return data ? (JSON.parse(data) as Record<string, 'default' | 'persona'>) : {}
  } catch {
    return {}
  }
}

export const isPersonaSlotId = (slotId: string): boolean =>
  slotId === 'persona' || slotId === 'persona_selector' || slotId.startsWith('persona_') || slotId.includes('_persona_')

function getStoredStanceSlots(
  initialHeroSlots: Record<string, Record<string, string>>
): Record<string, { default?: Record<string, string>; persona?: Record<string, string> }> {
  try {
    const data = localStorage.getItem('skinforge_hero_stance_slots')
    if (data) {
      const parsed = JSON.parse(data) as Record<string, { default?: Record<string, string>; persona?: Record<string, string> }>
      for (const stances of Object.values(parsed)) {
        if (stances.default) {
          for (const s of Object.keys(stances.default)) {
            if (isPersonaSlotId(s)) delete stances.default[s]
          }
        }
        if (stances.persona) {
          for (const s of Object.keys(stances.persona)) {
            if (!isPersonaSlotId(s)) delete stances.persona[s]
          }
        }
      }
      return parsed
    }
  } catch {
    // ignore
  }

  // Migrate existing single-dictionary heroSlots if any
  const migrated: Record<string, { default?: Record<string, string>; persona?: Record<string, string> }> = {}
  for (const [heroTag, slots] of Object.entries(initialHeroSlots)) {
    const defSlots: Record<string, string> = {}
    const pSlots: Record<string, string> = {}
    for (const [slot, item] of Object.entries(slots)) {
      if (isPersonaSlotId(slot)) {
        pSlots[slot] = item
      } else {
        defSlots[slot] = item
      }
    }
    migrated[heroTag] = {
      default: defSlots,
      persona: pSlots
    }
  }
  return migrated
}

function getStoredHeroCustomizations(): HeroCustomizationsMap {
  try {
    const data = localStorage.getItem('skinforge_hero_customizations')
    return data ? (JSON.parse(data) as HeroCustomizationsMap) : {}
  } catch {
    return {}
  }
}

const initialHeroSlots = getStoredHeroSlots()
const initialStanceSlots = getStoredStanceSlots(initialHeroSlots)
const initialActiveStance = getStoredActiveStances()

// Align initialHeroSlots with each hero's active stance so it never holds cross-stance leftovers
for (const heroTag of Object.keys(initialHeroSlots)) {
  const stance = initialActiveStance[heroTag] || 'default'
  const stanceData = initialStanceSlots[heroTag]?.[stance] || {}
  const cleanSlots: Record<string, string> = {}
  for (const [slot, item] of Object.entries(stanceData)) {
    if (stance === 'persona' ? isPersonaSlotId(slot) : !isPersonaSlotId(slot)) {
      cleanSlots[slot] = item
    }
  }
  initialHeroSlots[heroTag] = cleanSlots
}

export const useAppStore = create<AppStoreState>((set, get) => ({
  activeTab: 'heroes',
  activeCategoryGroup: 'hero',
  attrFilter: 'all',
  searchQuery: '',

  heroes: [],
  categories: [],
  selectedHero: null,
  heroSlots: initialHeroSlots,
  heroStanceSlots: initialStanceSlots,
  heroActiveStance: initialActiveStance,
  heroCustomizations: getStoredHeroCustomizations(),
  activeCatalog: null,

  activeModalSlot: null,
  modalRarityFilter: 'all',
  modalSearchQuery: '',
  isPresetModalOpen: false,
  patchAlertVisible: false,
  isConsoleOpen: false,

  dotaPath: '',
  status: null,
  isBusy: false,
  progress: null,
  presets: getStoredPresets(),
  settings: {
    dotaPath: '',
    modFolder: 'skinforge',
    autoDetect: true,
    launchAfter: false,
    confirmRestore: true,
    autoCheckUpdates: true,
    launchOptions: DEFAULT_LAUNCH_OPTIONS
  },
  cacheStats: null,
  updateStatus: 'idle',
  updateInfo: null,
  updateProgress: null,
  downloadedUpdatePath: null,
  downloadedUpdateSha256: null,
  isUpdateModalOpen: false,
  isBugReportOpen: false,
  logs: [
    {
      id: 'init',
      time: new Date().toLocaleTimeString(),
      message: 'Dota 2 SkinForge initialized.',
      type: 'info'
    }
  ],

  setTab: (tab, category = null) => {
    set((state) => ({
      activeTab: tab,
      activeCategoryGroup: category ?? (tab === 'heroes' ? state.activeCategoryGroup : 'hero')
    }))
  },

  setCategoryGroup: (group) => {
    set({ activeCategoryGroup: group, activeTab: 'heroes' })
  },

  setAttrFilter: (attr) => set({ attrFilter: attr }),

  setSearchQuery: (query) => set({ searchQuery: query }),

  setSelectedHero: (hero) => {
    if (!hero) {
      set({ selectedHero: null, activeCatalog: null })
      return
    }
    const catalog = getHeroSlotsDefinition(hero.tag, hero)
    set({ selectedHero: hero, activeCatalog: catalog })
  },

  setHeroSlot: (heroTag, slotId, itemName) => {
    set((state) => {
      const currentStance = state.heroActiveStance[heroTag] || 'default'
      const currentSlots = state.heroSlots[heroTag] || {}
      const updatedHero: Record<string, string> = {}
      for (const [s, it] of Object.entries(currentSlots)) {
        if (currentStance === 'persona' ? isPersonaSlotId(s) : !isPersonaSlotId(s)) {
          updatedHero[s] = it
        }
      }
      updatedHero[slotId] = itemName
      const updatedHeroSlots = {
        ...state.heroSlots,
        [heroTag]: updatedHero
      }
      const updatedStanceSlots = {
        ...state.heroStanceSlots,
        [heroTag]: {
          ...(state.heroStanceSlots[heroTag] || {}),
          [currentStance]: updatedHero
        }
      }
      try {
        localStorage.setItem('skinforge_hero_slots', JSON.stringify(updatedHeroSlots))
        localStorage.setItem('skinforge_hero_stance_slots', JSON.stringify(updatedStanceSlots))
      } catch {
        // ignore localStorage errors
      }
      return { heroSlots: updatedHeroSlots, heroStanceSlots: updatedStanceSlots }
    })
  },

  setSlotCustomization: (heroTag, slotId, update) => {
    set((state) => {
      const heroCurrent = state.heroCustomizations[heroTag] || {}
      const slotCurrent = heroCurrent[slotId] || {}
      const updated = {
        ...state.heroCustomizations,
        [heroTag]: {
          ...heroCurrent,
          [slotId]: { ...slotCurrent, ...update }
        }
      }
      try {
        localStorage.setItem('skinforge_hero_customizations', JSON.stringify(updated))
      } catch {
        // ignore
      }
      return { heroCustomizations: updated }
    })
  },

  resetHeroSlot: (heroTag, slotId) => {
    set((state) => {
      if (!state.heroSlots[heroTag]) return state
      const currentStance = state.heroActiveStance[heroTag] || 'default'
      const currentSlots = { ...state.heroSlots[heroTag] }
      delete currentSlots[slotId]
      const updatedHeroSlots = {
        ...state.heroSlots,
        [heroTag]: currentSlots
      }
      const updatedStanceSlots = {
        ...state.heroStanceSlots,
        [heroTag]: {
          ...(state.heroStanceSlots[heroTag] || {}),
          [currentStance]: currentSlots
        }
      }

      const updatedCust = { ...state.heroCustomizations }
      if (updatedCust[heroTag]) {
        const curCust = { ...updatedCust[heroTag] }
        delete curCust[slotId]
        updatedCust[heroTag] = curCust
      }

      try {
        localStorage.setItem('skinforge_hero_slots', JSON.stringify(updatedHeroSlots))
        localStorage.setItem('skinforge_hero_stance_slots', JSON.stringify(updatedStanceSlots))
        localStorage.setItem('skinforge_hero_customizations', JSON.stringify(updatedCust))
      } catch {
        // ignore
      }
      return { heroSlots: updatedHeroSlots, heroStanceSlots: updatedStanceSlots, heroCustomizations: updatedCust }
    })
  },

  resetAllHeroSlots: (heroTag) => {
    set((state) => {
      const currentStance = state.heroActiveStance[heroTag] || 'default'
      const updatedHeroSlots = { ...state.heroSlots }
      delete updatedHeroSlots[heroTag]

      const updatedStanceSlots = { ...state.heroStanceSlots }
      if (updatedStanceSlots[heroTag]) {
        const heroStances = { ...updatedStanceSlots[heroTag] }
        delete heroStances[currentStance]
        updatedStanceSlots[heroTag] = heroStances
      }

      // If resetting while in persona stance, auto-re-equip the persona base model
      if (currentStance === 'persona') {
        const catalog = getHeroSlotsDefinition(heroTag)
        const personaSlot = catalog?.slots.find((s) => s.slot === 'persona')
        const personaMod = personaSlot?.mods?.[0]
        if (personaMod) {
          updatedHeroSlots[heroTag] = { persona: personaMod.name }
          updatedStanceSlots[heroTag] = {
            ...(updatedStanceSlots[heroTag] || {}),
            persona: { persona: personaMod.name }
          }
        }
      }

      const updatedCust = { ...state.heroCustomizations }
      delete updatedCust[heroTag]

      try {
        localStorage.setItem('skinforge_hero_slots', JSON.stringify(updatedHeroSlots))
        localStorage.setItem('skinforge_hero_stance_slots', JSON.stringify(updatedStanceSlots))
        localStorage.setItem('skinforge_hero_customizations', JSON.stringify(updatedCust))
      } catch {
        // ignore
      }
      return { heroSlots: updatedHeroSlots, heroStanceSlots: updatedStanceSlots, heroCustomizations: updatedCust }
    })
    get().addLog(`Reset active slots for ${formatHeroName(heroTag)} to default.`, 'info')
  },

  clearAllEquippedSlots: () => {
    const state = get()
    const totalEquipped = Object.values(state.heroSlots || {}).reduce((acc, slots) => acc + Object.keys(slots || {}).length, 0)
    if (totalEquipped === 0) {
      state.addLog('No items are currently equipped in your loadout.', 'info')
      return
    }

    if (!confirm(`Are you sure you want to clear all ${totalEquipped} equipped cosmetic item(s) from your loadout?`)) {
      return
    }

    set({
      heroSlots: {},
      heroStanceSlots: {},
      heroCustomizations: {}
    })

    try {
      localStorage.removeItem('skinforge_hero_slots')
      localStorage.removeItem('skinforge_hero_stance_slots')
      localStorage.removeItem('skinforge_hero_customizations')
    } catch {
      // ignore
    }

    get().addLog(`Cleared all ${totalEquipped} equipped cosmetic slot(s) from loadout.`, 'info')
  },

  setHeroActiveStance: (heroTag, stance) => {
    const state = get()
    const currentStance = state.heroActiveStance[heroTag] || 'default'
    if (currentStance === stance) return

    // 1. Save current active slots into previous stance storage (cleanly partitioned)
    const currentSlots = state.heroSlots[heroTag] || {}
    const sanitizedCurrent: Record<string, string> = {}
    for (const [s, it] of Object.entries(currentSlots)) {
      if (currentStance === 'persona' ? isPersonaSlotId(s) : !isPersonaSlotId(s)) {
        sanitizedCurrent[s] = it
      }
    }

    const updatedStanceSlots = {
      ...state.heroStanceSlots,
      [heroTag]: {
        ...(state.heroStanceSlots[heroTag] || {}),
        [currentStance]: sanitizedCurrent
      }
    }

    // 2. Retrieve slots for the new stance (cleanly partitioned)
    const rawTarget = updatedStanceSlots[heroTag]?.[stance] || {}
    const targetSlots: Record<string, string> = {}
    for (const [s, it] of Object.entries(rawTarget)) {
      if (stance === 'persona' ? isPersonaSlotId(s) : !isPersonaSlotId(s)) {
        targetSlots[s] = it
      }
    }

    // 3. Auto-equip persona if switching to persona stance
    if (stance === 'persona') {
      const catalog = getHeroSlotsDefinition(heroTag)
      const personaSlot = catalog?.slots.find((s) => s.slot === 'persona')
      const personaMod = personaSlot?.mods?.[0]
      if (personaMod && !targetSlots['persona']) {
        targetSlots['persona'] = personaMod.name
      }
    }

    // 4. Update active stance and slots
    const updatedActiveStance: Record<string, 'default' | 'persona'> = {
      ...state.heroActiveStance,
      [heroTag]: stance
    }
    updatedStanceSlots[heroTag] = {
      ...(updatedStanceSlots[heroTag] || {}),
      [stance]: targetSlots
    }

    const updatedHeroSlots = {
      ...state.heroSlots,
      [heroTag]: targetSlots
    }

    try {
      localStorage.setItem('skinforge_hero_active_stance', JSON.stringify(updatedActiveStance))
      localStorage.setItem('skinforge_hero_stance_slots', JSON.stringify(updatedStanceSlots))
      localStorage.setItem('skinforge_hero_slots', JSON.stringify(updatedHeroSlots))
    } catch {
      // ignore
    }

    set({
      heroActiveStance: updatedActiveStance,
      heroStanceSlots: updatedStanceSlots,
      heroSlots: updatedHeroSlots
    })

    const stanceLabel = stance === 'persona' ? 'Persona' : 'Default'
    get().addLog(`Switched ${formatHeroName(heroTag)} to ${stanceLabel} stance.`, 'info')
  },

  equipSet: (heroTag, setObj) => {
    const state = get()
    const targetStance = setObj.isPersona ? 'persona' : 'default'
    const currentStance = state.heroActiveStance[heroTag] || 'default'

    const rawTarget = currentStance === targetStance ? state.heroSlots[heroTag] || {} : state.heroStanceSlots[heroTag]?.[targetStance] || {}

    const targetSlots: Record<string, string> = {}
    for (const [s, it] of Object.entries(rawTarget)) {
      if (targetStance === 'persona' ? isPersonaSlotId(s) : !isPersonaSlotId(s)) {
        targetSlots[s] = it
      }
    }

    // Equip each set item into its respective slot
    for (const item of setObj.items) {
      targetSlots[item.slot] = item.name
    }

    // If persona set, ensure persona base is equipped
    if (setObj.isPersona && !targetSlots['persona']) {
      const catalog = getHeroSlotsDefinition(heroTag)
      const personaSlot = catalog?.slots.find((s) => s.slot === 'persona')
      const personaMod = personaSlot?.mods?.[0]
      if (personaMod) targetSlots['persona'] = personaMod.name
    }

    const updatedStanceSlots = {
      ...state.heroStanceSlots,
      [heroTag]: {
        ...(state.heroStanceSlots[heroTag] || {}),
        [targetStance]: targetSlots
      }
    }

    const updatedActiveStance: Record<string, 'default' | 'persona'> = {
      ...state.heroActiveStance,
      [heroTag]: targetStance
    }

    const updatedHeroSlots = {
      ...state.heroSlots,
      [heroTag]: targetSlots
    }

    try {
      localStorage.setItem('skinforge_hero_active_stance', JSON.stringify(updatedActiveStance))
      localStorage.setItem('skinforge_hero_stance_slots', JSON.stringify(updatedStanceSlots))
      localStorage.setItem('skinforge_hero_slots', JSON.stringify(updatedHeroSlots))
    } catch {
      // ignore
    }

    set({
      heroActiveStance: updatedActiveStance,
      heroStanceSlots: updatedStanceSlots,
      heroSlots: updatedHeroSlots
    })

    get().addLog(`Equipped entire set "${setObj.name}" for ${formatHeroName(heroTag)} (${setObj.items.length} pieces).`, 'success')
  },

  unlockBestSet: (hero) => {
    const catalog = getHeroSlotsDefinition(hero.tag, hero)
    if (!catalog) return
    let count = 0
    const newHeroSlots = { ...(get().heroSlots[hero.tag] || {}) }

    catalog.slots.forEach((slot) => {
      // The catalog lists items alphabetically, so pick the rarest explicitly.
      const bestItem = [...slot.mods].sort((a, b) => rarityRank(b.rarity) - rarityRank(a.rarity))[0]
      if (bestItem) {
        newHeroSlots[slot.slot] = bestItem.name
        count++
      }
    })

    set((state) => {
      const updated = {
        ...state.heroSlots,
        [hero.tag]: newHeroSlots
      }
      try {
        localStorage.setItem('skinforge_hero_slots', JSON.stringify(updated))
      } catch {
        // ignore
      }
      return { heroSlots: updated }
    })

    get().addLog(`Equipped best cosmetics set for ${formatHeroName(hero.tag)} (${count} slots).`, 'success')
  },

  openSlotModal: (hero, slot) => {
    const catalog = getHeroSlotsDefinition(hero.tag, hero)
    set({
      selectedHero: hero,
      activeCatalog: catalog,
      activeModalSlot: slot,
      modalRarityFilter: 'all',
      modalSearchQuery: ''
    })
  },

  closeSlotModal: () => {
    set({ activeModalSlot: null, modalSearchQuery: '' })
  },

  setModalRarityFilter: (rarity) => set({ modalRarityFilter: rarity }),

  setModalSearchQuery: (query) => set({ modalSearchQuery: query }),

  openPresetModal: () => set({ isPresetModalOpen: true }),

  closePresetModal: () => set({ isPresetModalOpen: false }),

  addPreset: (name) => {
    const newPreset: Preset = {
      id: 'preset_' + Date.now(),
      name,
      timestamp: Date.now(),
      heroSlots: JSON.parse(JSON.stringify(get().heroSlots)) as Record<string, Record<string, string>>
    }
    set((state) => {
      const updated = [newPreset, ...state.presets]
      try {
        localStorage.setItem('skinforge_presets', JSON.stringify(updated))
      } catch {
        // ignore
      }
      return { presets: updated, isPresetModalOpen: false }
    })
    get().addLog(`Created preset "${name}".`, 'success')
  },

  applyPreset: (preset) => {
    const slots = JSON.parse(JSON.stringify(preset.heroSlots || {})) as Record<string, Record<string, string>>
    set({ heroSlots: slots })
    try {
      localStorage.setItem('skinforge_hero_slots', JSON.stringify(slots))
    } catch {
      // ignore
    }
    get().addLog(`Applied cosmetic preset "${preset.name}".`, 'success')
  },

  deletePreset: (presetId) => {
    set((state) => {
      const updated = state.presets.filter((p) => p.id !== presetId)
      try {
        localStorage.setItem('skinforge_presets', JSON.stringify(updated))
      } catch {
        // ignore
      }
      return { presets: updated }
    })
    get().addLog('Preset deleted.', 'info')
  },

  clearAllPresets: () => {
    set({ presets: [] })
    try {
      localStorage.removeItem('skinforge_presets')
    } catch {
      // ignore
    }
    get().addLog('All presets cleared.', 'warn')
  },

  updateSettings: (newSettings) => {
    set((state) => {
      const updated = { ...state.settings, ...newSettings }
      if (window.skinforge && typeof window.skinforge.writeSettings === 'function') {
        window.skinforge.writeSettings(updated).catch(() => {})
      }
      return { settings: updated }
    })
  },

  saveSettings: async () => {
    const { settings } = get()
    try {
      if (window.skinforge && typeof window.skinforge.writeSettings === 'function') {
        await window.skinforge.writeSettings(settings)
      }
      get().addLog('Settings saved successfully.', 'success')
      return true
    } catch (e: unknown) {
      const err = e instanceof Error ? e.message : String(e)
      get().addLog(`Failed to save settings: ${err}`, 'error')
      return false
    }
  },

  resetSettings: () => {
    const defaults: AppSettings = {
      dotaPath: get().dotaPath,
      modFolder: 'skinforge',
      autoDetect: true,
      launchAfter: false,
      confirmRestore: true,
      autoCheckUpdates: true
    }
    set({ settings: defaults })
    get().saveSettings()
    get().addLog('Settings reset to defaults.', 'info')
  },

  selectDotaDirectory: async () => {
    if (!window.skinforge || typeof window.skinforge.selectDirectory !== 'function') return
    try {
      const res = await window.skinforge.selectDirectory()
      if (res && res.path) {
        set({ dotaPath: res.path })
        get().updateSettings({ dotaPath: res.path })
        await get().saveSettings()
        const status = await window.skinforge.checkStatus(res.path)
        set({ status })
        get().addLog(`Game directory updated: ${res.path}`, 'info')
      }
    } catch (e: unknown) {
      const err = e instanceof Error ? e.message : String(e)
      get().addLog(`Directory selection failed: ${err}`, 'error')
    }
  },

  clearIconCache: async () => {
    if (!window.skinforge || typeof window.skinforge.clearIconCache !== 'function') return
    try {
      const ok = await window.skinforge.clearIconCache()
      if (ok) {
        const stats = await window.skinforge.getCacheStats()
        set({ cacheStats: stats })
        get().addLog('Local icon cache cleared successfully.', 'success')
      }
    } catch (e: unknown) {
      const err = e instanceof Error ? e.message : String(e)
      get().addLog(`Failed to clear icon cache: ${err}`, 'error')
    }
  },

  applyMods: async () => {
    const state = get()
    if (state.isBusy) return

    if (state.status && state.status.dotaRunning) {
      alert('Dota 2 is currently running. Please close Dota 2 before applying mods.')
      return
    }

    const rawEquipped = state.heroSlots || {}
    const equipped: Record<string, Record<string, string>> = {}
    for (const [heroTag, slots] of Object.entries(rawEquipped)) {
      if (!slots) continue
      const stance = state.heroActiveStance[heroTag] || 'default'
      const cleanHeroSlots: Record<string, string> = {}
      for (const [slotId, itemName] of Object.entries(slots)) {
        if (!itemName) continue
        if (stance === 'persona' ? isPersonaSlotId(slotId) : !isPersonaSlotId(slotId)) {
          cleanHeroSlots[slotId] = itemName
        }
      }
      if (Object.keys(cleanHeroSlots).length > 0) {
        equipped[heroTag] = cleanHeroSlots
      }
    }
    const totalSelected = Object.values(equipped).reduce((acc, slots) => acc + Object.keys(slots || {}).length, 0)
    if (totalSelected === 0) {
      state.addLog('No custom cosmetics equipped! Select items or Unlock Best Set first.', 'warn')
      alert(
        'No custom cosmetics are currently equipped!\n\nPlease customize slots on your hero in the equipment grid or click "Unlock Best Set" before clicking Apply.'
      )
      return
    }

    set({ isBusy: true, progress: { step: 1, total: 10, message: 'Preparing custom items and VPK package...' } })
    state.addLog(`Compiling ${totalSelected} equipped cosmetic slot(s) into Dota 2 items schema...`, 'info')

    try {
      const res = await window.skinforge.installMods(state.dotaPath, equipped, state.heroCustomizations)
      if (res && res.success) {
        const count = res.patchedCount || 0
        if (count === 0) {
          state.addLog('Notice: 0 items were matched with the items schema. Please select valid cosmetics.', 'warn')
          set({ progress: { step: 10, total: 10, message: 'Notice: 0 items applied' } })
        } else {
          state.addLog(`Successfully compiled and injected ${count} cosmetic loadout(s) into Dota 2!`, 'success')
          set({ progress: { step: 10, total: 10, message: `Success (${count} items applied)!` } })
        }

        const skipped = (res.report?.skipped ?? []).filter((s) => !s.reason?.includes('already provides it'))
        if (skipped.length) {
          state.addLog(
            `${skipped.length} selection(s) could not be applied: ` +
              skipped
                .slice(0, 4)
                .map((s) => `${s.hero}/${s.slot}`)
                .join(', ') +
              (skipped.length > 4 ? '...' : ''),
            'warn'
          )
        }
        for (const warning of res.report?.warnings ?? []) state.addLog(warning, 'warn')

        const status = await window.skinforge.checkStatus(state.dotaPath)
        set({ status })

        if (state.settings.launchAfter) {
          state.addLog('Launching Dota 2...', 'info')
          window.skinforge.openExternal('steam://run/570')
        }
      } else if (res) {
        const msg = res.error || 'Unknown error'
        state.addLog(`Installation failed: ${msg}`, 'error')
        set({ progress: { step: 10, total: 10, message: 'Install failed' } })
        alert(`Failed to apply mods:\n${msg}`)
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      state.addLog(`Installation error: ${msg}`, 'error')
      alert(`Failed to apply mods: ${msg}`)
    } finally {
      set({ isBusy: false })
      setTimeout(() => set({ progress: null }), 2000)
    }
  },

  restoreMods: async () => {
    const state = get()
    if (state.isBusy) return

    if (state.settings.confirmRestore) {
      if (!confirm('Restore clean game files? This will deactivate all modded cosmetics.')) {
        return
      }
    }

    set({ isBusy: true, progress: { step: 2, total: 10, message: 'Restoring original game configuration...' } })
    state.addLog('Restoring vanilla Dota 2 game files...', 'info')

    try {
      const res = await window.skinforge.uninstallMods(state.dotaPath)
      if (res && res.success) {
        state.addLog('Vanilla restoration complete! Game is now unmodded.', 'success')
        set({ progress: { step: 10, total: 10, message: 'Restored' } })
        const status = await window.skinforge.checkStatus(state.dotaPath)
        set({ status })
      } else if (res) {
        const msg = res.error || 'Unknown error'
        state.addLog(`Restore failed: ${msg}`, 'error')
        alert(`Failed to restore:\n${msg}`)
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      state.addLog(`Restore error: ${msg}`, 'error')
      alert(`Failed to restore: ${msg}`)
    } finally {
      set({ isBusy: false })
      setTimeout(() => set({ progress: null }), 2000)
    }
  },

  installBundle: async () => {
    const state = get()
    if (state.isBusy) return

    if (state.status && state.status.dotaRunning) {
      alert('Dota 2 is currently running. Please close Dota 2 before installing a pack.')
      return
    }

    const bundleDir = await window.skinforge.selectBundleDirectory()
    if (!bundleDir) return

    if (!confirm(`Install the pack in:\n${bundleDir}\n\nThis replaces the currently installed cosmetic pack.`)) {
      return
    }

    set({ isBusy: true, progress: { step: 1, total: 4, message: 'Reading pack folder...' } })
    state.addLog(`Staging pack from ${bundleDir}...`, 'info')

    try {
      const res = await window.skinforge.installBundle(state.dotaPath, bundleDir)
      if (res && res.success) {
        state.addLog(`Pack installed (${res.patchedCount ?? 0} item blocks). Launch Dota 2 to see it.`, 'success')
        set({ progress: { step: 4, total: 4, message: `Installed (${res.patchedCount ?? 0} blocks)` } })
        const status = await window.skinforge.checkStatus(state.dotaPath)
        set({ status })
      } else {
        const msg = res?.error ?? 'Unknown error'
        state.addLog(`Pack install failed: ${msg}`, 'error')
        alert(`Failed to install pack:\n${msg}`)
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      state.addLog(`Pack install error: ${msg}`, 'error')
      alert(`Failed to install pack:\n${msg}`)
    } finally {
      set({ isBusy: false })
      setTimeout(() => set({ progress: null }), 2000)
    }
  },

  refreshStatus: async () => {
    stateRefresh: {
      if (!window.skinforge || typeof window.skinforge.checkStatus !== 'function') break stateRefresh
      get().addLog('Refreshing status...', 'info')
      const status = await window.skinforge.checkStatus(get().dotaPath)
      set({ status })
    }
  },

  launchDota: async () => {
    const state = get()
    const launchArgs = buildLaunchArgsString(state.settings.launchOptions)
    state.addLog(`Launching Dota 2 via Steam (${launchArgs || 'no flags'})...`, 'info')

    if (window.skinforge && typeof window.skinforge.launchDota === 'function') {
      const res = await window.skinforge.launchDota(launchArgs)
      if (res && !res.success && res.error) {
        state.addLog(`Launch warning: ${res.error}`, 'warn')
      }
    } else if (window.skinforge && typeof window.skinforge.openExternal === 'function') {
      const url = launchArgs ? `steam://run/570//${encodeURIComponent(launchArgs)}/` : 'steam://run/570'
      await window.skinforge.openExternal(url)
    }
  },

  addLog: (message, type = 'info') => {
    const time = new Date().toLocaleTimeString()
    console.log(`[SkinForge:${type}] ${message}`)
    set((state) => ({
      logs: [
        ...state.logs.slice(-200),
        {
          id: 'log_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
          time,
          message,
          type
        }
      ]
    }))
  },

  toggleConsole: () => set((state) => ({ isConsoleOpen: !state.isConsoleOpen })),

  setPatchAlertVisible: (visible) => set({ patchAlertVisible: visible }),

  initApp: async () => {
    const { addLog } = get()
    try {
      // Progress IPC listener
      if (window.skinforge && typeof window.skinforge.onInstallProgress === 'function') {
        window.skinforge.onInstallProgress((data: InstallProgress) => {
          if (data && data.total) {
            set({ progress: data })
            addLog(`[${data.step}/${data.total}] ${data.message}`, 'info')
          }
        })
      }

      // Initialize catalog
      await initCatalog()

      if (!window.skinforge || typeof window.skinforge.getInitialData !== 'function') {
        throw new Error('IPC bridge window.skinforge is not available.')
      }

      const initial = await window.skinforge.getInitialData()
      const dotaPath = initial.dotaPath || ''
      const heroes = initial.heroes || []
      const categories = initial.categories || []
      const status = initial.status

      let savedSettings: Partial<AppSettings> = {}
      try {
        savedSettings = (await window.skinforge.readSettings()) || {}
      } catch {
        // ignore
      }

      let cacheStats: CacheStats | null = null
      try {
        cacheStats = await window.skinforge.getCacheStats()
      } catch {
        // ignore
      }

      set((state) => ({
        dotaPath,
        heroes,
        categories,
        status,
        cacheStats,
        settings: {
          ...state.settings,
          dotaPath: typeof savedSettings.dotaPath === 'string' ? savedSettings.dotaPath : dotaPath,
          modFolder: typeof savedSettings.modFolder === 'string' ? savedSettings.modFolder : 'skinforge',
          autoDetect: typeof savedSettings.autoDetect === 'boolean' ? savedSettings.autoDetect : true,
          launchAfter: typeof savedSettings.launchAfter === 'boolean' ? savedSettings.launchAfter : false,
          confirmRestore: typeof savedSettings.confirmRestore === 'boolean' ? savedSettings.confirmRestore : true,
          autoCheckUpdates: typeof savedSettings.autoCheckUpdates === 'boolean' ? savedSettings.autoCheckUpdates : true,
          launchOptions: {
            ...DEFAULT_LAUNCH_OPTIONS,
            ...(savedSettings.launchOptions || {})
          }
        }
      }))

      // CRITICAL: Log for smoke test pattern /Loaded (\d+) heroes/
      addLog(`Loaded ${heroes.length} heroes from local database.`, 'success')
      if (dotaPath) {
        addLog(`Dota 2 installation identified: ${dotaPath}`, 'info')
      } else {
        addLog('Dota 2 directory not automatically found. Please set it in Settings.', 'warn')
      }

      // Check for updates automatically in background if enabled
      const currentSettings = get().settings
      if (currentSettings.autoCheckUpdates) {
        setTimeout(() => {
          get().checkForUpdates(false)
        }, 1500)
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      addLog(`Initialization error: ${msg}`, 'error')
    }
  },

  setUpdateModalOpen: (open: boolean) => {
    set({ isUpdateModalOpen: open })
  },

  setBugReportOpen: (open: boolean) => {
    set({ isBugReportOpen: open })
  },

  checkForUpdates: async (manual: boolean = false) => {
    if (!window.skinforge || typeof window.skinforge.checkForUpdates !== 'function') return

    set({ updateStatus: 'checking' })
    if (manual) {
      get().addLog('Checking for updates...', 'info')
    }

    try {
      const info = await window.skinforge.checkForUpdates()
      if (info.error) {
        set({ updateStatus: 'error', updateInfo: info })
        if (manual) {
          get().addLog(`Update check failed: ${info.error}`, 'error')
        }
        return
      }

      if (info.updateAvailable) {
        set({ updateStatus: 'available', updateInfo: info, isUpdateModalOpen: true })
        get().addLog(`A new version of SkinForge is available: ${info.displayVersion}!`, 'success')
      } else {
        set({ updateStatus: 'up-to-date', updateInfo: info })
        if (manual) {
          get().addLog(`SkinForge is up to date (${info.currentVersion || 'current'}).`, 'info')
        }
      }
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err)
      set({ updateStatus: 'error' })
      if (manual) {
        get().addLog(`Update check error: ${errMsg}`, 'error')
      }
    }
  },

  downloadUpdate: async (assetUrl: string, filename: string, expectedSha256?: string) => {
    if (!window.skinforge || typeof window.skinforge.downloadUpdate !== 'function') return

    set({ updateStatus: 'downloading', updateProgress: null, downloadedUpdateSha256: null })
    get().addLog(`Downloading update: ${filename}...`, 'info')

    let cleanup: (() => void) | undefined
    if (typeof window.skinforge.onUpdateProgress === 'function') {
      cleanup = window.skinforge.onUpdateProgress((progress) => {
        set({ updateProgress: progress })
      })
    }

    try {
      const res = await window.skinforge.downloadUpdate({ assetUrl, filename, expectedSha256 })
      if (cleanup) cleanup()

      if (res && res.ok && res.filePath) {
        set({
          updateStatus: 'downloaded',
          downloadedUpdatePath: res.filePath,
          downloadedUpdateSha256: res.sha256 || expectedSha256 || null
        })
        const hashMsg = res.sha256 ? ` (SHA-256: ${res.sha256.slice(0, 12)}...)` : ''
        get().addLog(`Update downloaded and integrity verified${hashMsg}`, 'success')
      } else {
        set({ updateStatus: 'error' })
        get().addLog(`Failed to download update: ${res?.error || 'Unknown error'}`, 'error')
      }
    } catch (err: unknown) {
      if (cleanup) cleanup()
      const msg = err instanceof Error ? err.message : String(err)
      set({ updateStatus: 'error' })
      get().addLog(`Download failed: ${msg}`, 'error')
    }
  },

  installUpdate: async () => {
    const { downloadedUpdatePath, downloadedUpdateSha256 } = get()
    if (!downloadedUpdatePath || !window.skinforge || typeof window.skinforge.installUpdate !== 'function') return

    get().addLog('Launching verified update installer...', 'info')
    const res = await window.skinforge.installUpdate({
      filePath: downloadedUpdatePath,
      expectedSha256: downloadedUpdateSha256 || undefined
    })
    if (res && !res.ok) {
      get().addLog(`Failed to launch update: ${res.error || 'Unknown error'}`, 'error')
    }
  }
}))
