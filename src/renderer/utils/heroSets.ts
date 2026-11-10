/**
 * Dota 2 SkinForge — cosmetic sets for a hero.
 *
 * Sets live inside `data/heroes_armory.json`: a set lists its pieces as `{slot, id}` and
 * this resolves each piece to the armory row it equips, so a piece's name, rarity and
 * icon are stored once (on the row) instead of being copied into every set that uses it.
 *
 * The exported shape is what the picker and the loadout store work against, so consumers
 * only ever see fully resolved `HeroSet`s.
 */
import armoryData from '../../../data/heroes_armory.json'
import { normalizeTag } from '../components/slotGenerator'
import { rarityRank } from './itemImages'

export interface HeroSetItem {
  slot: string
  name: string
  rarity?: string
  img?: string
}

export interface HeroSet {
  id: string
  name: string
  rarity?: string
  img?: string
  isPersona?: boolean
  items: HeroSetItem[]
}

interface ArmorySet {
  id: string
  name: string
  rarity?: string
  img?: string
  isPersona?: boolean
  items: Array<{ slot: string; id: number }>
}

interface ArmoryMod {
  id?: number
  name: string
  rarity?: string
  img?: string
}

interface ArmoryEntry {
  tag?: string
  slots: Array<{ slot: string; mods: ArmoryMod[] }>
  sets?: ArmorySet[]
}

const armory = armoryData as unknown as Record<string, ArmoryEntry>

/**
 * Resolve a hero's sets against its slots. The first row carrying an id is the base item
 * — style variants share the id — and that is the row a set piece names.
 */
function hydrate(entry: ArmoryEntry | undefined, sets: ArmorySet[] | undefined): HeroSet[] {
  if (!entry || !sets?.length) return []
  const bySlotAndId = new Map<string, ArmoryMod>()
  for (const slot of entry.slots) {
    for (const mod of slot.mods) {
      if (mod.id == null) continue
      const key = `${slot.slot}:${mod.id}`
      if (!bySlotAndId.has(key)) bySlotAndId.set(key, mod)
    }
  }

  const out: HeroSet[] = []
  for (const set of sets) {
    const items: HeroSetItem[] = []
    for (const piece of set.items) {
      const mod = bySlotAndId.get(`${piece.slot}:${piece.id}`)
      if (mod) items.push({ slot: piece.slot, name: mod.name, rarity: mod.rarity, img: mod.img })
    }
    // A set with no resolvable piece cannot be equipped; dropping it beats showing a lie.
    if (items.length) {
      out.push({ id: set.id, name: set.name, rarity: set.rarity, img: set.img, isPersona: set.isPersona, items })
    }
  }
  return out
}

const normalizedSets = new Map<string, HeroSet[]>()
for (const [key, entry] of Object.entries(armory)) {
  const sets = hydrate(entry, entry.sets)
  if (!sets.length) continue
  normalizedSets.set(normalizeTag(key), sets)
  if (entry.tag) normalizedSets.set(normalizeTag(entry.tag), sets)
}

/** Determine the highest/effective rarity of a set (accounting for Arcana/Immortal pieces). */
export function getSetEffectiveRarity(set: HeroSet): string {
  if (set.isPersona) return 'persona'
  let bestRarity = (set.rarity || '').toLowerCase().trim() || 'common'
  let bestScore = rarityRank(bestRarity)

  for (const it of set.items || []) {
    const itRarity = (it.rarity || '').toLowerCase().trim()
    const itScore = rarityRank(itRarity)
    if (itScore > bestScore) {
      bestScore = itScore
      bestRarity = itRarity
    }
  }

  return bestRarity
}

/** Sort hero sets by rarity (rarest first), then alphabetically by name. */
export function sortSetsByRarity(sets: HeroSet[]): HeroSet[] {
  return [...sets].sort((a, b) => {
    const diff = rarityRank(getSetEffectiveRarity(b)) - rarityRank(getSetEffectiveRarity(a))
    if (diff !== 0) return diff
    return a.name.localeCompare(b.name, 'en')
  })
}

/** Retrieve all cosmetic sets for a hero, ordered by rarity (rarest first). */
export function getHeroSets(heroTag: string): HeroSet[] {
  const sets = normalizedSets.get(normalizeTag(heroTag)) || []
  return sortSetsByRarity(sets)
}

/** Check if an item belongs to a known set for the hero. */
export function findSetForItem(heroTag: string, itemName: string): HeroSet | undefined {
  const sets = getHeroSets(heroTag)
  const cleanItem = itemName.split(' - ')[0].trim().toLowerCase()
  return sets.find((s) => s.items.some((it) => it.name.toLowerCase() === cleanItem || it.name.toLowerCase() === itemName.toLowerCase()))
}

/** Check if all items in a set are currently equipped in the hero's slots. */
export function isSetEquipped(set: HeroSet, currentSlots: Record<string, string>): boolean {
  if (!set.items.length) return false
  return set.items.every((it) => {
    const equipped = currentSlots[it.slot]
    if (!equipped) return false
    return equipped.toLowerCase() === it.name.toLowerCase() || equipped.toLowerCase().startsWith(it.name.toLowerCase() + ' - ')
  })
}
