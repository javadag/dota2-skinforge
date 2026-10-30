/**
 * Dota 2 SkinForge — Equipment Slots Catalog & Slot Definition Resolver
 *
 * Source of truth for heroes is `data/heroes_catalog.json` (generated from `items_game.txt`).
 * Each hero owns its slots directly, and every slot owns its items:
 *
 *   hero.slots[] -> { slot, title, empty_img, persona?, pbase?, mods[] }
 *   mod          -> { id, name, rarity, img }
 *
 * Non-hero categories come from `data/other_catalog.json`, which uses the same shape.
 */

import heroesCatalogData from '../../../data/heroes_catalog.json'
import otherCatalogData from '../../../data/other_catalog.json'
import type { HeroEntry } from '../env'

export interface SlotMod {
  /** Valve schema item id from `items_game.txt`. */
  id?: number
  name: string
  rarity?: string
  img?: string
}

export interface CatalogSlot {
  slot: string
  title: string
  empty_img?: string
  persona?: boolean
  pbase?: boolean
  mods: SlotMod[]
}

export interface CatalogVariant {
  id: string
  title: string
}

export interface CatalogTaunt {
  key?: string
  /** Valve schema item id from `items_game.txt`. */
  id?: number
  name: string
  img?: string
}

export interface CatalogGameSet {
  id: string
  name: string
  rarity?: string
  img?: string
  total_items?: number
}

export interface HeroCatalogEntry {
  tag: string
  portrait?: string
  variant_default?: string
  variants?: CatalogVariant[]
  variant_slots?: Record<string, string[]>
  pbases?: boolean
  slots: CatalogSlot[]
  taunt?: { taunts: CatalogTaunt[] }
  gamesets?: CatalogGameSet[]
}

/** Backwards-compatible name used by the store and UI components. */
export type HeroSlot = CatalogSlot
export type HeroSlotsCatalogEntry = HeroCatalogEntry

const catalog = (heroesCatalogData as unknown as Record<string, HeroCatalogEntry>) || {}

/** Keys tolerate `anti-mage`, `ancient_apparition`, `Ancient Apparition`, etc. */
function catalogKey(tag: string): string {
  return tag.toLowerCase().replace(/[^a-z0-9]/g, '')
}

const catalogIndex = new Map<string, HeroCatalogEntry>()
for (const [key, entry] of Object.entries(catalog)) {
  catalogIndex.set(catalogKey(key), entry)
  if (entry?.tag) catalogIndex.set(catalogKey(entry.tag), entry)
}

const SPECIAL_NAMES: Record<string, string> = {
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

export async function initCatalog(): Promise<Record<string, HeroCatalogEntry>> {
  return catalog
}

/** Taunts live at hero level in the catalog; surface them as a normal slot. */
function withTauntSlot(entry: HeroCatalogEntry): HeroCatalogEntry {
  const taunts = entry.taunt?.taunts
  if (!taunts || taunts.length === 0) return entry
  if (entry.slots.some((s) => s.slot === 'taunt')) return entry

  return {
    ...entry,
    slots: [
      ...entry.slots,
      {
        slot: 'taunt',
        title: 'Taunt',
        mods: taunts.map((t) => ({
          id: t.id,
          name: t.name,
          rarity: 'taunt',
          img: t.img
        }))
      }
    ]
  }
}

interface OtherCategoryEntry {
  tag: string
  slots: CatalogSlot[]
}

const otherCatalog = (otherCatalogData as unknown as Record<string, OtherCategoryEntry>) || {}
const otherCatalogIndex = new Map<string, OtherCategoryEntry>()
for (const [key, entry] of Object.entries(otherCatalog)) {
  otherCatalogIndex.set(catalogKey(key), entry)
  if (entry?.tag) otherCatalogIndex.set(catalogKey(entry.tag), entry)
}

/**
 * Resolve a hero (or non-hero category) to its slot catalog.
 * Returns `null` when nothing is known about the tag.
 */
export function getHeroSlotsDefinition(heroTag?: string | null, heroObj?: HeroEntry | null): HeroCatalogEntry | null {
  if (!heroTag) return null

  const key = catalogKey(heroTag)
  const entry = catalogIndex.get(key) || (heroObj?.tag ? catalogIndex.get(catalogKey(heroObj.tag)) : undefined)
  if (entry) return withTauntSlot(entry)

  return otherCatalogIndex.get(key) ?? null
}
