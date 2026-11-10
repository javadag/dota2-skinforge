/**
 * Cosmetic armory access for the main process.
 *
 * `data/heroes_armory.json` carries the schema item id for every mod, so a UI
 * selection (`hero tag + slot + display name`) resolves to an exact `items_game`
 * id without fuzzy name matching.
 */

import fs from 'fs'
import { getDataPath } from './appPathService'

export interface ArmoryMod {
  id?: number
  name: string
  rarity?: string
  img?: string
}

export interface ArmorySlot {
  slot: string
  title: string
  mods: ArmoryMod[]
}

export interface ArmoryEntry {
  tag: string
  variant_default?: string
  slots: ArmorySlot[]
}

export interface Armory {
  heroes: Record<string, ArmoryEntry>
  other: Record<string, ArmoryEntry>
}

let cache: Armory | null = null

const keyOf = (tag: string): string => tag.toLowerCase().replace(/[^a-z0-9]/g, '')

function readJson<T>(name: string): T {
  const file = getDataPath(name)
  return JSON.parse(fs.readFileSync(file, 'utf-8')) as T
}

export function loadArmory(): Armory {
  if (cache) return cache
  cache = {
    heroes: readJson<Record<string, ArmoryEntry>>('heroes_armory.json'),
    other: readJson<Record<string, ArmoryEntry>>('other_armory.json')
  }
  return cache
}

function indexOf(entries: Record<string, ArmoryEntry>): Map<string, ArmoryEntry> {
  const index = new Map<string, ArmoryEntry>()
  for (const [key, entry] of Object.entries(entries)) {
    index.set(keyOf(key), entry)
  }
  for (const entry of Object.values(entries)) {
    if (entry?.tag) index.set(keyOf(entry.tag), entry)
  }
  return index
}

let heroIndex: Map<string, ArmoryEntry> | null = null
let otherIndex: Map<string, ArmoryEntry> | null = null

export function findEntry(tag: string): ArmoryEntry | undefined {
  const armory = loadArmory()
  heroIndex ??= indexOf(armory.heroes)
  otherIndex ??= indexOf(armory.other)
  const key = keyOf(tag)
  return heroIndex.get(key) ?? otherIndex.get(key)
}

/** Item id for an armory display name inside one hero/slot. */
export function resolveModId(tag: string, slot: string, itemName: string): number | null {
  const entry = findEntry(tag)
  if (!entry) return null
  const slotEntry = entry.slots?.find((s) => s.slot === slot)
  if (!slotEntry) return null
  const exact = slotEntry.mods?.find((m) => m.name === itemName)
  if (exact?.id) return exact.id
  // Tolerate whitespace/case drift between saved selections and the armory.
  const loose = slotEntry.mods?.find((m) => keyOf(m.name) === keyOf(itemName))
  return loose?.id ?? null
}

export function slotTitle(tag: string, slot: string): string {
  return findEntry(tag)?.slots?.find((s) => s.slot === slot)?.title ?? slot
}
