import { create } from 'zustand'
import type { CategoryKey } from '../../data/categoryMeta'
import type { HeroAttribute } from '../../shared/constants/attributes'
import {
  formatHeroName,
  getHeroSlotsDefinition,
  initCatalog,
  setCatalogHeroes,
  type HeroSlot,
  type HeroSlotsCatalogEntry
} from '../components/slotGenerator'
import type { HeroEntry, InstallProgress, PipelineStatus } from '../env'

export type AppTab = 'heroes' | 'presets' | 'launch' | 'settings' | 'about'
export type AttributeFilter = 'all' | HeroAttribute
export type CategoryGroup = CategoryKey

export interface Preset {
  id: string
  name: string
  timestamp: number
  heroSlots: Record<string, Record<string, string>>
}

export interface AppSettings {
  dotaPath: string
  modFolder: string
  autoDetect: boolean
  launchAfter: boolean
  confirmRestore: boolean
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
  selectedHero: HeroEntry | null
  heroSlots: Record<string, Record<string, string>>
  activeCatalog: HeroSlotsCatalogEntry | null

  // Modals & Panels
  activeModalSlot: HeroSlot | null
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

  // Actions
  setTab: (tab: AppTab, category?: CategoryGroup | null) => void
  setCategoryGroup: (group: CategoryGroup) => void
  setAttrFilter: (attr: AttributeFilter) => void
  setSearchQuery: (query: string) => void
  setSelectedHero: (hero: HeroEntry | null) => void
  setHeroSlot: (heroTag: string, slotId: string, itemName: string) => void
  resetHeroSlot: (heroTag: string, slotId: string) => void
  resetAllHeroSlots: (heroTag: string) => void
  unlockBestSet: (hero: HeroEntry) => void

  // Modals
  openSlotModal: (hero: HeroEntry, slot: HeroSlot) => void
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
  refreshStatus: () => Promise<void>
  launchDota: () => void

  // UI Utilities
  addLog: (message: string, type?: 'info' | 'warn' | 'error' | 'success') => void
  toggleConsole: () => void
  setPatchAlertVisible: (visible: boolean) => void
  initApp: () => Promise<void>
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

export const useAppStore = create<AppStoreState>((set, get) => ({
  activeTab: 'heroes',
  activeCategoryGroup: 'hero',
  attrFilter: 'all',
  searchQuery: '',

  heroes: [],
  selectedHero: null,
  heroSlots: getStoredHeroSlots(),
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
    confirmRestore: true
  },
  cacheStats: null,
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
      const updated = {
        ...state.heroSlots,
        [heroTag]: {
          ...(state.heroSlots[heroTag] || {}),
          [slotId]: itemName
        }
      }
      try {
        localStorage.setItem('skinforge_hero_slots', JSON.stringify(updated))
      } catch {
        // ignore localStorage errors
      }
      return { heroSlots: updated }
    })
  },

  resetHeroSlot: (heroTag, slotId) => {
    set((state) => {
      if (!state.heroSlots[heroTag]) return state
      const currentSlots = { ...state.heroSlots[heroTag] }
      delete currentSlots[slotId]
      const updated = {
        ...state.heroSlots,
        [heroTag]: currentSlots
      }
      try {
        localStorage.setItem('skinforge_hero_slots', JSON.stringify(updated))
      } catch {
        // ignore
      }
      return { heroSlots: updated }
    })
  },

  resetAllHeroSlots: (heroTag) => {
    set((state) => {
      const updated = { ...state.heroSlots }
      delete updated[heroTag]
      try {
        localStorage.setItem('skinforge_hero_slots', JSON.stringify(updated))
      } catch {
        // ignore
      }
      return { heroSlots: updated }
    })
    get().addLog(`Reset all slots for ${formatHeroName(heroTag)} to default.`, 'info')
  },

  unlockBestSet: (hero) => {
    const catalog = getHeroSlotsDefinition(hero.tag, hero)
    let count = 0
    const newHeroSlots = { ...(get().heroSlots[hero.tag] || {}) }

    catalog.slots.forEach((slot) => {
      const items = catalog.items[slot.id] || []
      const bestItem = items.find((it) => it.best) || items[0]
      if (bestItem) {
        newHeroSlots[slot.id] = bestItem.name
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
    set((state) => ({
      settings: { ...state.settings, ...newSettings }
    }))
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
      confirmRestore: true
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

    const equipped = state.heroSlots || {}
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
      const res = await window.skinforge.installMods(state.dotaPath, equipped)
      if (res && res.success) {
        const count = res.patchedCount || 0
        if (count === 0) {
          state.addLog('Notice: 0 items were matched with the items schema. Please select valid cosmetics.', 'warn')
          set({ progress: { step: 10, total: 10, message: 'Notice: 0 items applied' } })
        } else {
          state.addLog(`Successfully compiled and injected ${count} cosmetic loadout(s) into Dota 2!`, 'success')
          set({ progress: { step: 10, total: 10, message: `Success (${count} items applied)!` } })
        }

        const status = await window.skinforge.checkStatus(state.dotaPath)
        set({ status })

        if (state.settings.launchAfter) {
          state.addLog('Launching Dota 2...', 'info')
          window.skinforge.openExternal('steam://run/570')
        }
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

  refreshStatus: async () => {
    stateRefresh: {
      if (!window.skinforge || typeof window.skinforge.checkStatus !== 'function') break stateRefresh
      get().addLog('Refreshing status...', 'info')
      const status = await window.skinforge.checkStatus(get().dotaPath)
      set({ status })
    }
  },

  launchDota: () => {
    get().addLog('Launching Dota 2 via Steam (steam://run/570)...', 'info')
    if (window.skinforge && typeof window.skinforge.openExternal === 'function') {
      window.skinforge.openExternal('steam://run/570')
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
      setCatalogHeroes(heroes)
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
        status,
        cacheStats,
        settings: {
          ...state.settings,
          dotaPath: typeof savedSettings.dotaPath === 'string' ? savedSettings.dotaPath : dotaPath,
          modFolder: typeof savedSettings.modFolder === 'string' ? savedSettings.modFolder : 'skinforge',
          autoDetect: typeof savedSettings.autoDetect === 'boolean' ? savedSettings.autoDetect : true,
          launchAfter: typeof savedSettings.launchAfter === 'boolean' ? savedSettings.launchAfter : false,
          confirmRestore: typeof savedSettings.confirmRestore === 'boolean' ? savedSettings.confirmRestore : true
        }
      }))

      // CRITICAL: Log for smoke test pattern /Loaded (\d+) heroes/
      addLog(`Loaded ${heroes.length} heroes from local database.`, 'success')
      if (dotaPath) {
        addLog(`Dota 2 installation identified: ${dotaPath}`, 'info')
      } else {
        addLog('Dota 2 directory not automatically found. Please set it in Settings.', 'warn')
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      addLog(`Initialization error: ${msg}`, 'error')
    }
  }
}))
