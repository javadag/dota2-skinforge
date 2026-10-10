/**
 * Dota 2 SkinForge — Equipment Slots Catalog & Slot Definition Resolver
 */

import valveCatalogData from '../../../data/valveHeroCatalog.json'
import { NON_HERO_SLOTS_CATALOG } from '../../data/nonHeroCatalog'
import type { HeroEntry } from '../env'

let catalogHeroes: HeroEntry[] = []

export function setCatalogHeroes(heroes: HeroEntry[]): void {
  catalogHeroes = heroes
}

export interface SlotItem {
  id?: string | number
  name: string
  tag?: string
  rarity?: string
  img?: string
  best?: boolean
  isDefault?: boolean
}

export interface HeroSlot {
  id: string
  name: string
}

export interface HeroSlotsCatalogEntry {
  slots: HeroSlot[]
  items: Record<string, SlotItem[]>
}

function getAliases(): Record<string, string> {
  return (typeof window !== 'undefined' && window.heroAliases && window.heroAliases.HERO_ALIASES) || {}
}

const valveCatalog: Record<string, HeroSlotsCatalogEntry> = (valveCatalogData as unknown as Record<string, HeroSlotsCatalogEntry>) || {}

export async function initCatalog(): Promise<Record<string, HeroSlotsCatalogEntry>> {
  return valveCatalog
}

const SPECIAL_NAMES: Record<string, string> = {
  loadscreens: 'Loading Screens',
  huds: 'HUD Skins',
  cursor: 'Cursor Packs',
  versus_screen: 'Versus Screens',
  kill_streak: 'Kill Streak Effects',
  music_packs: 'Music Packs',
  announcers: 'Announcers',
  tormentor: 'Tormentor',
  ancient: 'Ancient Structures',
  river: 'River Vials',
  weather: 'Weather Effects',
  roshan: 'Roshan',
  creeps: 'Creeps',
  towers: 'Towers',
  wards: 'Wards',
  courier: 'Couriers',
  emblem: 'Emblems'
}

export function formatHeroName(tag?: string | null): string {
  if (!tag) return ''
  const lower = tag.toLowerCase().trim()
  if (SPECIAL_NAMES[lower]) {
    return SPECIAL_NAMES[lower]
  }
  return tag
    .split(/[_\s-]+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

export function getHeroSlotsDefinition(heroTag?: string | null, heroObj?: HeroEntry | null): HeroSlotsCatalogEntry {
  if (!heroTag) return { slots: [], items: {} }

  const rawKey = heroTag.toLowerCase()
  const normalized = rawKey.replace(/\s+/g, '_').replace(/-/g, '_')
  const aliases = getAliases()
  const aliasKey = aliases[rawKey] || aliases[normalized]

  // 1. Check official Valve Hero Catalog
  if (valveCatalog[normalized]) {
    return valveCatalog[normalized]
  }
  if (valveCatalog[rawKey]) {
    return valveCatalog[rawKey]
  }
  if (aliasKey && valveCatalog[aliasKey]) {
    return valveCatalog[aliasKey]
  }

  // 2. Check Non-Hero Categories Catalog
  if (NON_HERO_SLOTS_CATALOG[normalized]) {
    return NON_HERO_SLOTS_CATALOG[normalized]
  }
  if (NON_HERO_SLOTS_CATALOG[rawKey]) {
    return NON_HERO_SLOTS_CATALOG[rawKey]
  }

  // 3. Fallback for heroes only: base armament
  const obj = heroObj || catalogHeroes.find((h) => h.tag.toLowerCase() === rawKey || h.tag.toLowerCase() === normalized)
  if (!obj || !obj.g || obj.g === 'hero') {
    const name = formatHeroName(heroTag)
    return {
      slots: [{ id: 'weapon', name: 'Weapon / Armament' }],
      items: {
        weapon: [{ name: `Official Base Armament — ${name}`, tag: 'Common', best: true }]
      }
    }
  }

  // 4. Non-hero with no catalog entry: return empty slots (no fake items)
  return { slots: [], items: {} }
}
