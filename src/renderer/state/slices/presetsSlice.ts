import type { StateCreator } from 'zustand'
import type { AppStoreState } from '../useAppStore'
import { dropStaleStyles } from '../../../shared/types/customization'

export interface Preset {
  id: string
  name: string
  timestamp: number
  heroSlots: Record<string, Record<string, string>>
}

export function getStoredPresets(): Preset[] {
  try {
    const data = localStorage.getItem('skinforge_presets')
    return data ? (JSON.parse(data) as Preset[]) : []
  } catch {
    return []
  }
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
    set((state) => {
      // A preset swaps items out wholesale: drop the styles chosen for what it replaced,
      // and the customizations of heroes the snapshot does not carry at all.
      let cust = state.heroCustomizations
      for (const [heroTag, before] of Object.entries(state.heroSlots)) {
        cust = dropStaleStyles(cust, heroTag, before, slots[heroTag] || {})
      }
      for (const heroTag of Object.keys(cust)) {
        if (slots[heroTag]) continue
        if (cust === state.heroCustomizations) cust = { ...cust }
        delete cust[heroTag]
      }
      if (cust !== state.heroCustomizations) {
        try {
          localStorage.setItem('skinforge_hero_customizations', JSON.stringify(cust))
        } catch {
          // ignore
        }
      }
      return { heroSlots: slots, heroCustomizations: cust }
    })
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
  }
})
