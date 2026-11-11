import heroesArmoryData from '../../../data/heroes_armory.json'

export type HeroAttribute = 'str' | 'agi' | 'int' | 'uni'

function isHeroAttribute(value?: string): value is HeroAttribute {
  return value === 'str' || value === 'agi' || value === 'int' || value === 'uni'
}

/** Tags match without case or punctuation, the same way the picker looks them up. */
function keyOf(tag: string): string {
  return tag.toLowerCase().replace(/[^a-z0-9]/g, '')
}

/**
 * A hero's primary attribute lives on its armory entry — `npm run armory` writes it from
 * the game's own `AttributePrimary` — so there is no separate map left to drift out of
 * sync. Unknown tags (categories, a stub hero) fall back to Strength, as before.
 */
const attributes = new Map<string, HeroAttribute>()
for (const [tag, entry] of Object.entries(heroesArmoryData as unknown as Record<string, { attribute?: string }>)) {
  if (isHeroAttribute(entry.attribute)) attributes.set(keyOf(tag), entry.attribute)
}

export function getHeroAttribute(tag?: string | null): HeroAttribute {
  if (!tag) return 'str'
  return attributes.get(keyOf(tag)) ?? 'str'
}

export function getAttrLabel(attr?: HeroAttribute | string | null): string {
  switch (attr) {
    case 'str':
      return 'Strength'
    case 'agi':
      return 'Agility'
    case 'int':
      return 'Intelligence'
    case 'uni':
      return 'Universal'
    default:
      return 'Strength'
  }
}
