import heroSetsData from '../../../data/hero_sets.json'

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

const setsMap = (heroSetsData as unknown as Record<string, HeroSet[]>) || {}

function normalizeTag(tag: string): string {
  return tag.toLowerCase().replace(/[^a-z0-9]/g, '')
}

const normalizedSets = new Map<string, HeroSet[]>()
for (const [tag, sets] of Object.entries(setsMap)) {
  normalizedSets.set(normalizeTag(tag), sets)
}

export const SET_RARITY_RANK: Record<string, number> = {
  arcana: 0,
  persona: 1,
  immortal: 2,
  legendary: 3,
  mythical: 4,
  rare: 5,
  uncommon: 6,
  common: 7,
  seasonal: 8
}

/** Determine the highest/effective rarity of a set (accounting for Arcana/Immortal pieces). */
export function getSetEffectiveRarity(set: HeroSet): string {
  if (set.isPersona) return 'persona'
  const rawSetRarity = (set.rarity || '').toLowerCase().trim()
  let bestRank = SET_RARITY_RANK[rawSetRarity] ?? 99

  for (const it of set.items || []) {
    const itRarity = (it.rarity || '').toLowerCase().trim()
    const itRank = SET_RARITY_RANK[itRarity] ?? 99
    if (itRank < bestRank) bestRank = itRank
  }

  for (const [key, rank] of Object.entries(SET_RARITY_RANK)) {
    if (rank === bestRank) return key
  }
  return rawSetRarity || 'common'
}

/** Sort hero sets by rarity (rarest first), then alphabetically by name. */
export function sortSetsByRarity(sets: HeroSet[]): HeroSet[] {
  return [...sets].sort((a, b) => {
    const rankA = SET_RARITY_RANK[getSetEffectiveRarity(a)] ?? 99
    const rankB = SET_RARITY_RANK[getSetEffectiveRarity(b)] ?? 99
    if (rankA !== rankB) return rankA - rankB
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
