/**
 * Pure armory domain types and tag normalization shared across main, renderer, and CLI tools
 * without importing large JSON catalogs.
 */

export type HeroAttribute = 'str' | 'agi' | 'int' | 'uni'

export function isHeroAttribute(value?: string): value is HeroAttribute {
  return value === 'str' || value === 'agi' || value === 'int' || value === 'uni'
}

export interface ArmoryItem {
  /** Valve schema item id from `items_game.txt`. */
  id?: number
  name: string
  rarity?: string
  img?: string
}

export interface ArmorySlot {
  slot: string
  title: string
  empty_img?: string
  mods: ArmoryItem[]
}

export interface ArmorySetDef {
  id: string
  name: string
  rarity?: string
  img?: string
  isPersona?: boolean
  items: Array<{ slot: string; id: number }>
}

export interface ArmoryEntry {
  tag?: string
  attribute?: string
  slots: ArmorySlot[]
  sets?: ArmorySetDef[]
}

export interface CatalogEntry {
  tag: string
  name?: string
  attribute?: HeroAttribute
  group?: 'world' | 'interface'
  alias?: string[]
  img?: string
}

/** Tags compare without case or punctuation: `anti-mage`, `Ancient Apparition`, `antimage`. */
export function normalizeEntityTag(tag: string): string {
  return tag.toLowerCase().replace(/[^a-z0-9]/g, '')
}

/** True for persona selector or persona variant slot IDs (`persona`, `persona_selector`, `persona_*`, `*_persona_*`). */
export function isPersonaSlotId(slotId: string): boolean {
  return slotId === 'persona' || slotId === 'persona_selector' || slotId.startsWith('persona_') || slotId.includes('_persona_')
}

/** Total number of equipped cosmetic slots across all heroes and categories. */
export function countEquippedSlots(heroSlots?: Record<string, Record<string, string>> | null): number {
  return Object.values(heroSlots || {}).reduce((acc, slots) => acc + Object.keys(slots || {}).length, 0)
}
