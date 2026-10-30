/**
 * Cosmetic catalog access for the main process.
 *
 * `data/heroes_catalog.json` carries the schema item id for every mod, so a UI
 * selection (`hero tag + slot + display name`) resolves to an exact `items_game`
 * id without fuzzy name matching.
 */

import fs from 'fs'
import { getDataPath } from './appPathService'

export interface CatalogMod {
  id?: number
  name: string
  rarity?: string
  img?: string
}

export interface CatalogSlot {
  slot: string
  title: string
  mods: CatalogMod[]
}

export interface CatalogEntry {
  tag: string
  variant_default?: string
  slots: CatalogSlot[]
}

export interface Catalog {
  heroes: Record<string, CatalogEntry>
  other: Record<string, CatalogEntry>
}

let cache: Catalog | null = null

const keyOf = (tag: string): string => tag.toLowerCase().replace(/[^a-z0-9]/g, '')

function readJson<T>(name: string): T {
  const file = getDataPath(name)
  return JSON.parse(fs.readFileSync(file, 'utf-8')) as T
}

export function loadCatalog(): Catalog {
  if (cache) return cache
  cache = {
    heroes: readJson<Record<string, CatalogEntry>>('heroes_catalog.json'),
    other: readJson<Record<string, CatalogEntry>>('other_catalog.json')
  }
  return cache
}

function indexOf(entries: Record<string, CatalogEntry>): Map<string, CatalogEntry> {
  const index = new Map<string, CatalogEntry>()
  for (const [key, entry] of Object.entries(entries)) {
    index.set(keyOf(key), entry)
    if (entry?.tag) index.set(keyOf(entry.tag), entry)
  }
  return index
}

let heroIndex: Map<string, CatalogEntry> | null = null
let otherIndex: Map<string, CatalogEntry> | null = null

export function findEntry(tag: string): CatalogEntry | undefined {
  const catalog = loadCatalog()
  heroIndex ??= indexOf(catalog.heroes)
  otherIndex ??= indexOf(catalog.other)
  const key = keyOf(tag)
  return heroIndex.get(key) ?? otherIndex.get(key)
}

/** Item id for a catalog display name inside one hero/slot. */
export function resolveModId(tag: string, slot: string, itemName: string): number | null {
  const entry = findEntry(tag)
  if (!entry) return null
  const slotEntry = entry.slots?.find((s) => s.slot === slot)
  if (!slotEntry) return null
  const exact = slotEntry.mods?.find((m) => m.name === itemName)
  if (exact?.id) return exact.id
  // Tolerate whitespace/case drift between saved selections and the catalog.
  const loose = slotEntry.mods?.find((m) => keyOf(m.name) === keyOf(itemName))
  return loose?.id ?? null
}

export function slotTitle(tag: string, slot: string): string {
  return findEntry(tag)?.slots?.find((s) => s.slot === slot)?.title ?? slot
}
