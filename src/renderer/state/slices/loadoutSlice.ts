import type { StateCreator } from 'zustand'
import { formatCatalogName, resolveArmoryEntry, type ArmoryEntry, type CatalogEntry } from '../../../shared/armory/armoryCatalog'
import { countEquippedSlots, isPersonaSlotId } from '../../../shared/armory/armoryTypes'
import type { HeroSet } from '../../../shared/armory/heroSets'
import { countAbilityIconOverrides, type HeroAbilityIconOverrides } from '../../../shared/types/abilityIcons'
import type { HeroCustomizationsMap, ItemCustomization } from '../../../shared/types/customization'
import { dropStaleStyles } from '../../../shared/types/customization'
import { isPlainObject, lowercaseSlotKeys, readJsonStorage, removeStorageKeys, STORAGE_KEYS, writeJsonStorage } from '../storage'
import type { AppStoreState } from '../useAppStore'

export type HeroStance = 'default' | 'persona'

export function splitStanceSlots(slots: Record<string, string>): Record<HeroStance, Record<string, string>> {
  const result: Record<HeroStance, Record<string, string>> = { default: {}, persona: {} }
  for (const [slot, item] of Object.entries(slots)) {
    result[isPersonaSlotId(slot) ? 'persona' : 'default'][slot] = item
  }
  return result
}

/** Return only the slots belonging to `stance` (`persona` vs `default`). */
export function filterSlotsForStance(slots: Record<string, string>, stance: HeroStance): Record<string, string> {
  const filtered: Record<string, string> = {}
  for (const [slot, item] of Object.entries(slots)) {
    if (!item) continue
    if (stance === 'persona' ? isPersonaSlotId(slot) : !isPersonaSlotId(slot)) {
      filtered[slot] = item
    }
  }
  return filtered
}

function getDefaultPersonaModName(heroTag: string): string | undefined {
  const armory = resolveArmoryEntry(heroTag)
  return armory?.slots.find((s) => s.slot === 'persona')?.mods?.[0]?.name
}

function loadStoredStanceSlots(
  initialSlots: Record<string, Record<string, string>>
): Record<string, { default?: Record<string, string>; persona?: Record<string, string> }> {
  const parsed = readJsonStorage<unknown>(STORAGE_KEYS.heroStanceSlots, null)
  if (isPlainObject(parsed)) {
    const clean: Record<string, { default?: Record<string, string>; persona?: Record<string, string> }> = {}
    for (const [heroTag, stances] of Object.entries(parsed)) {
      if (!isPlainObject(stances)) continue
      const entry: { default?: Record<string, string>; persona?: Record<string, string> } = {}
      if (isPlainObject(stances.default)) {
        entry.default = filterSlotsForStance(stances.default as Record<string, string>, 'default')
      }
      if (isPlainObject(stances.persona)) {
        entry.persona = filterSlotsForStance(stances.persona as Record<string, string>, 'persona')
      }
      clean[heroTag] = entry
    }
    return clean
  }

  // Migrate legacy single-dictionary heroSlots into partitioned stance slots.
  const migrated: Record<string, { default?: Record<string, string>; persona?: Record<string, string> }> = {}
  for (const [heroTag, slots] of Object.entries(initialSlots)) {
    if (!isPlainObject(slots)) continue
    migrated[heroTag] = splitStanceSlots(slots)
  }
  return migrated
}

function getInitialLoadoutState() {
  const rawSlots = readJsonStorage<Record<string, unknown>>(STORAGE_KEYS.heroSlots, {})
  const initialSlots: Record<string, Record<string, string>> = {}
  for (const [heroTag, slots] of Object.entries(rawSlots)) {
    if (isPlainObject(slots)) initialSlots[heroTag] = lowercaseSlotKeys(slots as Record<string, string>)
  }

  const initialStanceSlots = loadStoredStanceSlots(initialSlots)
  const rawActiveStance = readJsonStorage<Record<string, unknown>>(STORAGE_KEYS.heroActiveStance, {})
  const initialActiveStance: Record<string, HeroStance> = {}
  for (const [heroTag, stance] of Object.entries(rawActiveStance)) {
    if (stance === 'default' || stance === 'persona') initialActiveStance[heroTag] = stance
  }

  const rawCustomizations = readJsonStorage<Record<string, unknown>>(STORAGE_KEYS.heroCustomizations, {})
  const initialCustomizations: HeroCustomizationsMap = {}
  for (const [heroTag, cust] of Object.entries(rawCustomizations)) {
    if (isPlainObject(cust)) initialCustomizations[heroTag] = lowercaseSlotKeys(cust as Record<string, ItemCustomization>)
  }

  // Normalize legacy mixed-case slot keys (e.g. Valve's "Legs" on Drow Ranger).
  for (const stances of Object.values(initialStanceSlots)) {
    if (stances.default) stances.default = lowercaseSlotKeys(stances.default)
    if (stances.persona) stances.persona = lowercaseSlotKeys(stances.persona)
  }

  // Align active heroSlots with each hero's active stance so cross-stance leftovers never leak in.
  for (const heroTag of Object.keys(initialSlots)) {
    const stance = initialActiveStance[heroTag] || 'default'
    const filtered = filterSlotsForStance(initialStanceSlots[heroTag]?.[stance] || {}, stance)
    if (Object.keys(filtered).length > 0) initialSlots[heroTag] = filtered
    else delete initialSlots[heroTag]
  }

  return {
    heroSlots: initialSlots,
    heroStanceSlots: initialStanceSlots,
    heroActiveStance: initialActiveStance,
    heroCustomizations: initialCustomizations
  }
}

export interface LoadoutSlice {
  heroes: CatalogEntry[]
  categories: CatalogEntry[]
  selectedHero: CatalogEntry | null
  heroSlots: Record<string, Record<string, string>>
  heroStanceSlots: Record<string, { default?: Record<string, string>; persona?: Record<string, string> }>
  heroActiveStance: Record<string, HeroStance>
  heroCustomizations: HeroCustomizationsMap
  heroAbilityIcons: HeroAbilityIconOverrides
  activeArmory: ArmoryEntry | null

  setSelectedHero: (hero: CatalogEntry | null) => void
  setHeroSlot: (heroTag: string, slotId: string, itemName: string) => void
  setSlotCustomization: (heroTag: string, slotId: string, customization: Partial<ItemCustomization>) => void
  setAbilityIcon: (heroTag: string, ability: string, icon?: string) => void
  resetHeroAbilityIcons: (heroTag: string) => void
  resetHeroSlot: (heroTag: string, slotId: string) => void
  resetAllHeroSlots: (heroTag: string) => void
  clearAllEquippedSlots: () => Promise<void>
  setHeroActiveStance: (heroTag: string, stance: HeroStance) => void
  equipSet: (heroTag: string, set: HeroSet) => void
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
    heroAbilityIcons: readJsonStorage<HeroAbilityIconOverrides>(STORAGE_KEYS.abilityIcons, {}),
    activeArmory: null,

    setSelectedHero: (hero) => {
      // Reset picker filters on every navigation so a modal filter never empties a single-slot category view.
      if (!hero) {
        set({ selectedHero: null, activeArmory: null, modalRarityFilter: 'all', modalSearchQuery: '' })
        return
      }
      set({
        selectedHero: hero,
        activeArmory: resolveArmoryEntry(hero.tag, hero),
        modalRarityFilter: 'all',
        modalSearchQuery: ''
      })
    },

    setHeroSlot: (heroTag, slotId, itemName) => {
      set((state) => {
        const currentStance = state.heroActiveStance[heroTag] || 'default'
        const currentSlots = state.heroSlots[heroTag] || {}
        const updatedHero = { ...filterSlotsForStance(currentSlots, currentStance), [slotId]: itemName }
        const updatedHeroSlots = { ...state.heroSlots, [heroTag]: updatedHero }
        const updatedStanceSlots = {
          ...state.heroStanceSlots,
          [heroTag]: { ...(state.heroStanceSlots[heroTag] || {}), [currentStance]: updatedHero }
        }
        const updatedCust = dropStaleStyles(state.heroCustomizations, heroTag, currentSlots, updatedHero)

        writeJsonStorage(STORAGE_KEYS.heroSlots, updatedHeroSlots)
        writeJsonStorage(STORAGE_KEYS.heroStanceSlots, updatedStanceSlots)
        if (updatedCust !== state.heroCustomizations) writeJsonStorage(STORAGE_KEYS.heroCustomizations, updatedCust)

        return { heroSlots: updatedHeroSlots, heroStanceSlots: updatedStanceSlots, heroCustomizations: updatedCust }
      })
    },

    setSlotCustomization: (heroTag, slotId, update) => {
      set((state) => {
        const heroCurrent = state.heroCustomizations[heroTag] || {}
        const updated = {
          ...state.heroCustomizations,
          [heroTag]: { ...heroCurrent, [slotId]: { ...(heroCurrent[slotId] || {}), ...update } }
        }
        writeJsonStorage(STORAGE_KEYS.heroCustomizations, updated)
        return { heroCustomizations: updated }
      })
    },

    setAbilityIcon: (heroTag, ability, icon) => {
      set((state) => {
        const heroAbilityIcons = { ...state.heroAbilityIcons }
        const choices = { ...heroAbilityIcons[heroTag] }
        if (icon) choices[ability] = icon
        else delete choices[ability]
        if (Object.keys(choices).length) heroAbilityIcons[heroTag] = choices
        else delete heroAbilityIcons[heroTag]
        writeJsonStorage(STORAGE_KEYS.abilityIcons, heroAbilityIcons)
        return { heroAbilityIcons }
      })
    },

    resetHeroAbilityIcons: (heroTag) => {
      set((state) => {
        if (!state.heroAbilityIcons[heroTag]) return state
        const heroAbilityIcons = { ...state.heroAbilityIcons }
        delete heroAbilityIcons[heroTag]
        writeJsonStorage(STORAGE_KEYS.abilityIcons, heroAbilityIcons)
        return { heroAbilityIcons }
      })
    },

    resetHeroSlot: (heroTag, slotId) => {
      set((state) => {
        if (!state.heroSlots[heroTag]) return state
        const currentStance = state.heroActiveStance[heroTag] || 'default'
        const previousSlots = state.heroSlots[heroTag]
        const currentSlots = { ...previousSlots }
        delete currentSlots[slotId]
        const updatedHeroSlots = { ...state.heroSlots }
        if (Object.keys(currentSlots).length > 0) updatedHeroSlots[heroTag] = currentSlots
        else delete updatedHeroSlots[heroTag]
        const updatedStanceSlots = {
          ...state.heroStanceSlots,
          [heroTag]: { ...(state.heroStanceSlots[heroTag] || {}), [currentStance]: currentSlots }
        }

        const updatedCust = { ...dropStaleStyles(state.heroCustomizations, heroTag, previousSlots, currentSlots) }
        if (updatedCust[heroTag]) {
          const curCust = { ...updatedCust[heroTag] }
          delete curCust[slotId]
          updatedCust[heroTag] = curCust
        }

        writeJsonStorage(STORAGE_KEYS.heroSlots, updatedHeroSlots)
        writeJsonStorage(STORAGE_KEYS.heroStanceSlots, updatedStanceSlots)
        writeJsonStorage(STORAGE_KEYS.heroCustomizations, updatedCust)
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

        // If resetting while in persona stance, keep the persona base model active.
        if (currentStance === 'persona') {
          const personaMod = getDefaultPersonaModName(heroTag)
          if (personaMod) {
            updatedHeroSlots[heroTag] = { persona: personaMod }
            updatedStanceSlots[heroTag] = { ...(updatedStanceSlots[heroTag] || {}), persona: { persona: personaMod } }
          }
        }

        const updatedCust = { ...state.heroCustomizations }
        delete updatedCust[heroTag]
        const heroAbilityIcons = { ...state.heroAbilityIcons }
        delete heroAbilityIcons[heroTag]

        writeJsonStorage(STORAGE_KEYS.heroSlots, updatedHeroSlots)
        writeJsonStorage(STORAGE_KEYS.heroStanceSlots, updatedStanceSlots)
        writeJsonStorage(STORAGE_KEYS.heroCustomizations, updatedCust)
        writeJsonStorage(STORAGE_KEYS.abilityIcons, heroAbilityIcons)
        return { heroSlots: updatedHeroSlots, heroStanceSlots: updatedStanceSlots, heroCustomizations: updatedCust, heroAbilityIcons }
      })
      get().addLog(`Reset active slots for ${formatCatalogName(heroTag)} to default.`, 'info')
    },

    clearAllEquippedSlots: async () => {
      const state = get()
      const totalEquipped = countEquippedSlots(state.heroSlots)
      const totalIcons = countAbilityIconOverrides(state.heroAbilityIcons)
      if (totalEquipped + totalIcons === 0) {
        state.addLog('No cosmetics or ability icon overrides are selected.', 'info')
        return
      }

      const confirmed = await state.openConfirm({
        title: 'Clear Loadout',
        message: 'Clear all equipped cosmetics and ability icon overrides from your loadout?',
        confirmText: 'Clear All',
        danger: true
      })
      if (!confirmed) {
        return
      }

      set({ heroSlots: {}, heroStanceSlots: {}, heroActiveStance: {}, heroCustomizations: {}, heroAbilityIcons: {} })
      removeStorageKeys(
        STORAGE_KEYS.heroSlots,
        STORAGE_KEYS.heroStanceSlots,
        STORAGE_KEYS.heroActiveStance,
        STORAGE_KEYS.heroCustomizations,
        STORAGE_KEYS.abilityIcons
      )
      get().addLog(`Cleared ${totalEquipped} equipped cosmetic slot(s) and ${totalIcons} ability icon override(s).`, 'info')
    },

    setHeroActiveStance: (heroTag, stance) => {
      const state = get()
      const currentStance = state.heroActiveStance[heroTag] || 'default'
      if (currentStance === stance) return

      const sanitizedCurrent = filterSlotsForStance(state.heroSlots[heroTag] || {}, currentStance)
      const updatedStanceSlots = {
        ...state.heroStanceSlots,
        [heroTag]: { ...(state.heroStanceSlots[heroTag] || {}), [currentStance]: sanitizedCurrent }
      }

      const targetSlots = filterSlotsForStance(updatedStanceSlots[heroTag]?.[stance] || {}, stance)
      if (stance === 'persona' && !targetSlots['persona']) {
        const personaMod = getDefaultPersonaModName(heroTag)
        if (personaMod) targetSlots['persona'] = personaMod
      }

      const updatedActiveStance: Record<string, HeroStance> = { ...state.heroActiveStance, [heroTag]: stance }
      updatedStanceSlots[heroTag] = { ...(updatedStanceSlots[heroTag] || {}), [stance]: targetSlots }
      const updatedHeroSlots = { ...state.heroSlots }
      if (Object.keys(targetSlots).length > 0) updatedHeroSlots[heroTag] = targetSlots
      else delete updatedHeroSlots[heroTag]

      writeJsonStorage(STORAGE_KEYS.heroActiveStance, updatedActiveStance)
      writeJsonStorage(STORAGE_KEYS.heroStanceSlots, updatedStanceSlots)
      writeJsonStorage(STORAGE_KEYS.heroSlots, updatedHeroSlots)

      set({ heroActiveStance: updatedActiveStance, heroStanceSlots: updatedStanceSlots, heroSlots: updatedHeroSlots })
      get().addLog(`Switched ${formatCatalogName(heroTag)} to ${stance === 'persona' ? 'Persona' : 'Default'} stance.`, 'info')
    },

    equipSet: (heroTag, setObj) => {
      const state = get()
      const targetStance: HeroStance = setObj.isPersona ? 'persona' : 'default'
      const targetSlots = Object.fromEntries(setObj.items.map(({ slot, name }) => [slot, name]))

      if (setObj.isPersona && !targetSlots['persona']) {
        const personaMod = getDefaultPersonaModName(heroTag)
        if (personaMod) targetSlots['persona'] = personaMod
      }

      const currentStyles = state.heroCustomizations[heroTag]
      let updatedCust = state.heroCustomizations
      if (currentStyles) {
        const inactiveStyles = Object.entries(currentStyles).filter(([slot]) => isPersonaSlotId(slot) !== Boolean(setObj.isPersona))
        if (inactiveStyles.length !== Object.keys(currentStyles).length) {
          updatedCust = { ...state.heroCustomizations, [heroTag]: Object.fromEntries(inactiveStyles) }
          writeJsonStorage(STORAGE_KEYS.heroCustomizations, updatedCust)
        }
      }

      const updatedStanceSlots = {
        ...state.heroStanceSlots,
        [heroTag]: { ...(state.heroStanceSlots[heroTag] || {}), [targetStance]: targetSlots }
      }
      const updatedActiveStance: Record<string, HeroStance> = { ...state.heroActiveStance, [heroTag]: targetStance }
      const updatedHeroSlots = { ...state.heroSlots, [heroTag]: targetSlots }

      writeJsonStorage(STORAGE_KEYS.heroActiveStance, updatedActiveStance)
      writeJsonStorage(STORAGE_KEYS.heroStanceSlots, updatedStanceSlots)
      writeJsonStorage(STORAGE_KEYS.heroSlots, updatedHeroSlots)

      set({
        heroActiveStance: updatedActiveStance,
        heroStanceSlots: updatedStanceSlots,
        heroSlots: updatedHeroSlots,
        heroCustomizations: updatedCust
      })
      get().addLog(`Equipped entire set "${setObj.name}" for ${formatCatalogName(heroTag)} (${setObj.items.length} pieces).`, 'success')
    }
  }
}
