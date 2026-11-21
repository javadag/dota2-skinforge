import { getRawHeroArmory } from './armoryCatalog'
import { isHeroAttribute, normalizeEntityTag, type HeroAttribute } from './armoryTypes'

export { isHeroAttribute, type HeroAttribute }

/**
 * A hero's primary attribute lives on its armory entry — `npm run armory` writes it from
 * the game's own `AttributePrimary` — so there is no separate map left to drift out of
 * sync. Unknown tags (categories, a stub hero) fall back to Strength.
 */
const attributes = new Map<string, HeroAttribute>()
for (const [tag, entry] of Object.entries(getRawHeroArmory())) {
  if (isHeroAttribute(entry.attribute)) {
    attributes.set(normalizeEntityTag(tag), entry.attribute)
    if (entry.tag) attributes.set(normalizeEntityTag(entry.tag), entry.attribute)
  }
}

export function getHeroAttribute(tag?: string | null): HeroAttribute {
  if (!tag) return 'str'
  return attributes.get(normalizeEntityTag(tag)) ?? 'str'
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
