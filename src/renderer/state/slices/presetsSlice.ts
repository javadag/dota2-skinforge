import type { StateCreator } from 'zustand'
import type { HeroAbilityIconOverrides } from '../../../shared/types/abilityIcons'
import { dropStaleStyles } from '../../../shared/types/customization'
import { isPlainObject, lowercaseSlotKeys, readJsonStorage, removeStorageKeys, STORAGE_KEYS, writeJsonStorage } from '../storage'
import type { AppStoreState } from '../useAppStore'
import { splitStanceSlots } from './loadoutSlice'

export interface Preset {
  id: string
  name: string
  timestamp: number
  heroSlots: Record<string, Record<string, string>>
  abilityIcons?: HeroAbilityIconOverrides
}

function getStoredPresets(): Preset[] {
  const raw = readJsonStorage<unknown[]>(STORAGE_KEYS.presets, [])
  const presets: Preset[] = []
  // Legacy presets can hold mixed-case slot IDs such as Valve's "Legs"; slots are lowercase now.
  for (const item of raw) {
    if (!isPlainObject(item) || typeof item.id !== 'string' || typeof item.name !== 'string') continue
    const cleanSlots: Record<string, Record<string, string>> = {}
    if (isPlainObject(item.heroSlots)) {
      for (const [heroTag, slots] of Object.entries(item.heroSlots)) {
        if (!isPlainObject(slots)) continue
        const lowered = lowercaseSlotKeys(slots as Record<string, string>)
        if (Object.keys(lowered).length > 0) cleanSlots[heroTag] = lowered
      }
    }
    presets.push({
      id: item.id,
      name: item.name,
      timestamp: typeof item.timestamp === 'number' ? item.timestamp : Date.now(),
      heroSlots: cleanSlots,
      abilityIcons: isPlainObject(item.abilityIcons) ? (item.abilityIcons as HeroAbilityIconOverrides) : undefined
    })
  }
  return presets
}

export interface PresetsSlice {
  presets: Preset[]
  addPreset: (name: string) => void
  applyPreset: (preset: Preset) => void
  deletePreset: (presetId: string) => void
  clearAllPresets: () => void
}

export const createPresetsSlice: StateCreator<AppStoreState, [], [], PresetsSlice> = (set, get) => ({
  presets: getStoredPresets(),

  addPreset: (name) => {
    const newPreset: Preset = {
      id: 'preset_' + Date.now(),
      name,
      timestamp: Date.now(),
      heroSlots: JSON.parse(JSON.stringify(get().heroSlots)) as Record<string, Record<string, string>>,
      abilityIcons: get().heroAbilityIcons
    }
    set((state) => {
      const updated = [newPreset, ...state.presets]
      writeJsonStorage(STORAGE_KEYS.presets, updated)
      return { presets: updated, isPresetModalOpen: false }
    })
    get().addLog(`Created preset "${name}".`, 'success')
  },

  applyPreset: (preset) => {
    set((state) => {
      const savedSlots = preset.heroSlots || {}
      const heroAbilityIcons = preset.abilityIcons ?? {}
      const heroSlots: AppStoreState['heroSlots'] = {}
      const heroStanceSlots = { ...state.heroStanceSlots }
      const heroActiveStance = { ...state.heroActiveStance }
      let heroCustomizations = state.heroCustomizations

      for (const hero of new Set([...Object.keys(state.heroSlots), ...Object.keys(savedSlots)])) {
        const currentStance = state.heroActiveStance[hero] || 'default'
        const stances = { ...heroStanceSlots[hero], [currentStance]: state.heroSlots[hero] || {} }
        const saved = splitStanceSlots(savedSlots[hero] || {})
        const hasDefault = Object.keys(saved.default).length > 0
        const hasPersona = Object.keys(saved.persona).length > 0
        const active = hasDefault === hasPersona ? currentStance : hasPersona ? 'persona' : 'default'

        // Presets contain active items. Keep the other stance's loadout unless the preset supplies it.
        for (const stance of ['default', 'persona'] as const) {
          if (stance !== active && !Object.keys(saved[stance]).length) continue
          heroCustomizations = dropStaleStyles(heroCustomizations, hero, stances[stance] || {}, saved[stance])
          stances[stance] = saved[stance]
        }
        heroStanceSlots[hero] = stances
        heroActiveStance[hero] = active
        if (hasDefault || hasPersona) heroSlots[hero] = saved[active]
      }

      writeJsonStorage(STORAGE_KEYS.heroSlots, heroSlots)
      writeJsonStorage(STORAGE_KEYS.heroStanceSlots, heroStanceSlots)
      writeJsonStorage(STORAGE_KEYS.heroActiveStance, heroActiveStance)
      writeJsonStorage(STORAGE_KEYS.abilityIcons, heroAbilityIcons)
      if (heroCustomizations !== state.heroCustomizations) {
        writeJsonStorage(STORAGE_KEYS.heroCustomizations, heroCustomizations)
      }
      return { heroSlots, heroStanceSlots, heroActiveStance, heroCustomizations, heroAbilityIcons }
    })
    get().addLog(`Applied cosmetic preset "${preset.name}".`, 'success')
  },

  deletePreset: (presetId) => {
    set((state) => {
      const updated = state.presets.filter((p) => p.id !== presetId)
      writeJsonStorage(STORAGE_KEYS.presets, updated)
      return { presets: updated }
    })
    get().addLog('Preset deleted.', 'info')
  },

  clearAllPresets: () => {
    set({ presets: [] })
    removeStorageKeys(STORAGE_KEYS.presets)
    get().addLog('All presets cleared.', 'warn')
  }
})
