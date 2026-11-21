/**
 * Dota 2 SkinForge — cosmetic sets for a hero.
 *
 * Sets live inside `data/heroes_armory.json`: a set lists its pieces as `{slot, id}` and
 * this resolves each piece to the armory row it equips, so a piece's name, rarity and
 * icon are stored once (on the row) instead of being copied into every set that uses it.
 */
import { reconnectRules, setExcludedItems } from '../../../data/cosmetic-assets.json'
import { reconnectPairRules } from '../utils/reconnectRules'
import { getRawHeroArmory, resolveArmoryEntry } from './armoryCatalog'
import { normalizeEntityTag, type ArmoryEntry, type ArmoryItem, type ArmorySetDef } from './armoryTypes'
import { rarityRank } from './rarityConfig'

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

const exclusionsBySet: Partial<Record<string, ArmorySetDef['items']>> = setExcludedItems

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

/**
 * Resolve a hero's sets against its slots. The first row carrying an id is the base item
 * — style variants share the id — and that is the row a set piece names.
 */
function hydrate(entry: ArmoryEntry | undefined, sets: ArmorySetDef[] | undefined): HeroSet[] {
  if (!entry || !sets?.length) return []
  const bySlotAndId = new Map<string, ArmoryItem>()
  for (const slot of entry.slots) {
    for (const mod of slot.mods) {
      if (mod.id == null) continue
      const key = `${slot.slot}:${mod.id}`
      if (!bySlotAndId.has(key)) bySlotAndId.set(key, mod)
    }
  }

  const out: HeroSet[] = []
  for (const set of sets) {
    const exclusions = exclusionsBySet[set.id]
    const items: HeroSetItem[] = []
    for (const piece of set.items) {
      if (exclusions?.some(({ slot, id }) => slot === piece.slot && id === piece.id)) continue
      const mod = bySlotAndId.get(`${piece.slot}:${piece.id}`)
      if (mod) items.push({ slot: piece.slot, name: mod.name, rarity: mod.rarity, img: mod.img })
    }
    if (items.length) {
      out.push({ id: set.id, name: set.name, rarity: set.rarity, img: set.img, isPersona: set.isPersona, items })
    }
  }
  return sortSetsByRarity(out)
}

const normalizedSets = new Map<string, HeroSet[]>()
for (const [key, entry] of Object.entries(getRawHeroArmory())) {
  const sets = hydrate(entry, entry.sets)
  if (!sets.length) continue
  normalizedSets.set(normalizeEntityTag(key), sets)
  if (entry.tag) normalizedSets.set(normalizeEntityTag(entry.tag), sets)
}

/** Retrieve all cosmetic sets for a hero, pre-sorted by rarity (rarest first). */
export function getHeroSets(heroTag: string): HeroSet[] {
  return normalizedSets.get(normalizeEntityTag(heroTag)) ?? []
}

const pairingRules = reconnectPairRules(reconnectRules)

function reconnectPairs(heroTag: string) {
  const hero = normalizeEntityTag(heroTag)
  return pairingRules.flatMap((rule) => {
    if (normalizeEntityTag(rule.hero) !== hero) return []
    const items = getHeroSets(hero).find((set) => set.id === rule.set)?.items
    const dependent = items?.find((item) => item.slot === rule.dependentSlot)
    const required = items?.find((item) => item.slot === rule.requiredSlot)
    return dependent && required ? [{ dependent, required }] : []
  })
}

function matchesSetPiece(hero: string, piece: HeroSetItem, selected?: string) {
  if (!selected) return false
  if (selected === piece.name) return true
  const mods = resolveArmoryEntry(hero)?.slots.find((slot) => slot.slot === piece.slot)?.mods
  const id = mods?.find((item) => item.name === piece.name)?.id
  return id !== undefined && mods?.find((item) => item.name === selected)?.id === id
}

export function reconnectPairForSlot(hero: string, slots: Record<string, string>, slot: string) {
  return reconnectPairs(hero).find(
    ({ dependent, required }) =>
      (slot === dependent.slot || slot === required.slot) &&
      matchesSetPiece(hero, dependent, slots[dependent.slot]) &&
      matchesSetPiece(hero, required, slots[required.slot])
  )
}

export function requiredReconnectPiece(hero: string, slot: string, item: string) {
  return reconnectPairs(hero).find(({ dependent }) => slot === dependent.slot && matchesSetPiece(hero, dependent, item))?.required
}

export function reconnectRequirements(hero: string, slots: Record<string, string>) {
  return reconnectPairs(hero).filter(({ dependent }) => matchesSetPiece(hero, dependent, slots[dependent.slot]))
}

/** Check if an item belongs to a known set for the hero. */
export function findSetForItem(heroTag: string, itemName: string): HeroSet | undefined {
  const sets = getHeroSets(heroTag)
  const cleanItem = itemName.split(' - ')[0].trim().toLowerCase()
  const lowerName = itemName.toLowerCase()
  return sets.find((s) => s.items.some((it) => it.name.toLowerCase() === cleanItem || it.name.toLowerCase() === lowerName))
}

/** Check if all items in a set are currently equipped in the hero's slots. */
export function isSetEquipped(set: HeroSet, currentSlots: Record<string, string>): boolean {
  if (!set.items.length) return false
  return set.items.every((it) => {
    const equipped = currentSlots[it.slot]
    if (!equipped) return false
    const lowerEquipped = equipped.toLowerCase()
    const lowerPiece = it.name.toLowerCase()
    return lowerEquipped === lowerPiece || lowerEquipped.startsWith(lowerPiece + ' - ')
  })
}
