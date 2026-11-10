import heroSetsData from '../../../data/hero_sets.json'
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

const setsMap = (heroSetsData as unknown as Record<string, HeroSet[]>) || {}

function normalizeTag(tag: string): string {
  return tag.toLowerCase().replace(/[^a-z0-9]/g, '')
}

const normalizedSets = new Map<string, HeroSet[]>()
for (const [tag, sets] of Object.entries(setsMap)) {
  normalizedSets.set(normalizeTag(tag), sets)
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
