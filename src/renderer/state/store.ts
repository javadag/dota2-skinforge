/**
 * Dota 2 SkinForge — Central Application State Store
 * Manages reactive state updates and persistence with event broadcasting.
 */

import type { CategoryKey } from '../../data/categoryMeta'
import type { HeroAttribute } from '../../shared/constants/attributes'
import type { HeroEntry, PipelineStatus } from '../env'
import { emit } from './events'

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

export interface AppState {
  dotaPath: string
  status: PipelineStatus | null
  heroes: HeroEntry[]
  selectedHero: HeroEntry | null
  activeTab: AppTab
  activeCategoryGroup: CategoryGroup
  attrFilter: AttributeFilter
  searchQuery: string
  isBusy: boolean
  heroSlots: Record<string, Record<string, string>>
  presets: Preset[]
  settings: AppSettings
  activeModalSlot: string | null
}

export const state: AppState = {
  dotaPath: '',
  status: null,
  heroes: [],
  selectedHero: null,
  activeTab: 'heroes',
  activeCategoryGroup: 'hero',
  attrFilter: 'all',
  searchQuery: '',
  isBusy: false,
  heroSlots: {},
  presets: [],
  settings: {
    dotaPath: '',
    modFolder: 'skinforge',
    autoDetect: true,
    launchAfter: false,
    confirmRestore: true
  },
  activeModalSlot: null
}

export function loadPresets(): Preset[] {
  try {
    const data = localStorage.getItem('skinforge_presets')
    state.presets = data ? (JSON.parse(data) as Preset[]) : []
  } catch {
    state.presets = []
  }
  emit('presets:updated', state.presets)
  return state.presets
}

export function savePresets(): void {
  localStorage.setItem('skinforge_presets', JSON.stringify(state.presets))
  emit('presets:updated', state.presets)
}

export function addPreset(name: string): Preset {
  const newPreset: Preset = {
    id: 'preset_' + Date.now(),
    name,
    timestamp: Date.now(),
    heroSlots: JSON.parse(JSON.stringify(state.heroSlots)) as Record<string, Record<string, string>>
  }
  state.presets.unshift(newPreset)
  savePresets()
  return newPreset
}

export function deletePreset(presetId: string): void {
  state.presets = state.presets.filter((p) => p.id !== presetId)
  savePresets()
}

export function loadHeroSlots(): Record<string, Record<string, string>> {
  try {
    const data = localStorage.getItem('skinforge_hero_slots')
    state.heroSlots = data ? (JSON.parse(data) as Record<string, Record<string, string>>) : {}
  } catch {
    state.heroSlots = {}
  }
  return state.heroSlots
}

export function saveHeroSlots(): void {
  localStorage.setItem('skinforge_hero_slots', JSON.stringify(state.heroSlots))
}

export function setHeroSlot(heroTag: string, slotId: string, itemName: string): void {
  if (!state.heroSlots[heroTag]) {
    state.heroSlots[heroTag] = {}
  }
  state.heroSlots[heroTag][slotId] = itemName
  saveHeroSlots()
  emit('slots:updated', { heroTag, slots: state.heroSlots[heroTag] })
}

export function resetHeroSlot(heroTag: string, slotId: string): void {
  if (state.heroSlots[heroTag]) {
    delete state.heroSlots[heroTag][slotId]
    saveHeroSlots()
    emit('slots:updated', { heroTag, slots: state.heroSlots[heroTag] })
  }
}

export function resetAllHeroSlots(heroTag: string): void {
  if (state.heroSlots[heroTag]) {
    delete state.heroSlots[heroTag]
    saveHeroSlots()
    emit('slots:updated', { heroTag, slots: {} })
  }
}

export function setSelectedHero(hero: HeroEntry | null): void {
  state.selectedHero = hero
  emit('hero:selected', hero)
}
