import type { StateCreator } from 'zustand'
import type { HeroCustomizationsMap, ItemCustomization } from '../../../shared/types/customization'
import { isPersonaSlotId } from '../../../shared/constants/personaSlots'
import { RARITY_RANK, rarityRank } from '../../../shared/armory/rarityConfig'
import { formatHeroName, getHeroSlotsDefinition, type HeroArmoryEntry } from '../../components/slotGenerator'
import type { HeroEntry } from '../../env'
import type { HeroSet } from '../../utils/heroSets'
import type { AppStoreState } from '../useAppStore'

export { isPersonaSlotId, RARITY_RANK, rarityRank }

export function getStoredHeroSlots(): Record<string, Record<string, string>> {
  try {
    const data = localStorage.getItem('skinforge_hero_slots')
    return data ? (JSON.parse(data) as Record<string, Record<string, string>>) : {}
  } catch {
    return {}
  }
}

export function getStoredActiveStances(): Record<string, 'default' | 'persona'> {
  try {
    const data = localStorage.getItem('skinforge_hero_active_stance')
    return data ? (JSON.parse(data) as Record<string, 'default' | 'persona'>) : {}
  } catch {
    return {}
  }
}

export function getStoredStanceSlots(
  initialSlots: Record<string, Record<string, string>>
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
  for (const [heroTag, slots] of Object.entries(initialSlots)) {
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

export function getStoredHeroCustomizations(): HeroCustomizationsMap {
  try {
    const data = localStorage.getItem('skinforge_hero_customizations')
    return data ? (JSON.parse(data) as HeroCustomizationsMap) : {}
  } catch {
    return {}
  }
}

export function getInitialLoadoutState() {
  const initialSlots = getStoredHeroSlots()
  const initialStanceSlots = getStoredStanceSlots(initialSlots)
  const initialActiveStance = getStoredActiveStances()

  // Align initialHeroSlots with each hero's active stance so it never holds cross-stance leftovers
  for (const heroTag of Object.keys(initialSlots)) {
    const stance = initialActiveStance[heroTag] || 'default'
    const stanceData = initialStanceSlots[heroTag]?.[stance] || {}
    const cleanSlots: Record<string, string> = {}
    for (const [slot, item] of Object.entries(stanceData)) {
      if (stance === 'persona' ? isPersonaSlotId(slot) : !isPersonaSlotId(slot)) {
        cleanSlots[slot] = item
      }
    }
    initialSlots[heroTag] = cleanSlots
  }

  return {
    heroSlots: initialSlots,
    heroStanceSlots: initialStanceSlots,
    heroActiveStance: initialActiveStance,
    heroCustomizations: getStoredHeroCustomizations()
  }
}

export interface LoadoutSlice {
  heroes: HeroEntry[]
  categories: HeroEntry[]
  selectedHero: HeroEntry | null
  heroSlots: Record<string, Record<string, string>>
  heroStanceSlots: Record<string, { default?: Record<string, string>; persona?: Record<string, string> }>
  heroActiveStance: Record<string, 'default' | 'persona'>
  heroCustomizations: HeroCustomizationsMap
  activeArmory: HeroArmoryEntry | null

  setSelectedHero: (hero: HeroEntry | null) => void
  setHeroSlot: (heroTag: string, slotId: string, itemName: string) => void
  setSlotCustomization: (heroTag: string, slotId: string, customization: Partial<ItemCustomization>) => void
  resetHeroSlot: (heroTag: string, slotId: string) => void
  resetAllHeroSlots: (heroTag: string) => void
  clearAllEquippedSlots: () => void
  setHeroActiveStance: (heroTag: string, stance: 'default' | 'persona') => void
  equipSet: (heroTag: string, set: HeroSet) => void
  unlockBestSet: (hero: HeroEntry) => void
}

export const createLoadoutSlice: StateCreator<AppStoreState, [], [], LoadoutSlice> = (set, get) => {
  const initial = getInitialLoadoutState()

  return {
    heroes: [],
    categories: [],
    selectedHero: null,
    heroSlots: initial.heroSlots,
    heroStanceSlots: initial.heroStanceSlots,
    heroActiveStance: initial.heroActiveStance,
    heroCustomizations: initial.heroCustomizations,
    activeArmory: null,

    setSelectedHero: (hero) => {
      if (!hero) {
        set({ selectedHero: null, activeArmory: null })
        return
      }
      const armory = getHeroSlotsDefinition(hero.tag, hero)
      set({ selectedHero: hero, activeArmory: armory })
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
          const armory = getHeroSlotsDefinition(heroTag)
          const personaSlot = armory?.slots.find((s) => s.slot === 'persona')
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
        const armory = getHeroSlotsDefinition(heroTag)
        const personaSlot = armory?.slots.find((s) => s.slot === 'persona')
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

      const rawTarget =
        currentStance === targetStance ? state.heroSlots[heroTag] || {} : state.heroStanceSlots[heroTag]?.[targetStance] || {}

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
        const armory = getHeroSlotsDefinition(heroTag)
        const personaSlot = armory?.slots.find((s) => s.slot === 'persona')
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
      const armory = getHeroSlotsDefinition(hero.tag, hero)
      if (!armory) return
      let count = 0
      const newHeroSlots = { ...(get().heroSlots[hero.tag] || {}) }

      armory.slots.forEach((slot) => {
        // The armory lists items alphabetically, so pick the rarest explicitly.
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
    }
  }
}
