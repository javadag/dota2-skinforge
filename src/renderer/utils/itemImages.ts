/**
 * Dota 2 SkinForge — Cosmetic & Catalog Image Resolution Engine
 */

import { getIconKey } from '../../shared/armory/iconKeys'
import type { ItemDescriptor } from '../../shared/armory/rarityConfig'
import { getCanonicalHero } from '../../shared/constants/heroAliases'
import { generateItemSvg } from './cardSvgGenerator'
import { getCategorySvg } from './slotSvgIcons'

export interface HeroImageTarget {
  tag?: string
  img?: string
}

export const FALLBACK_THUMBNAIL_SVG =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><rect width="40" height="40" rx="6" fill="#141a29"/><text x="20" y="25" fill="#64748b" font-size="16" text-anchor="middle">?</text></svg>'
  )

export function resolveCatalogThumbnail(entry: { tag: string; img?: string; group?: string }): string {
  if (entry.img) return entry.img
  if (!entry.group) return `../assets/heroes/${getCanonicalHero(entry.tag)}.png`
  return getCategorySvg(entry.tag) ?? '../assets/categories/default.svg'
}

export function getItemImage(item?: ItemDescriptor | null, slotId = 'weapon', heroTag = '', heroObj?: HeroImageTarget | null): string {
  const icon = typeof item?.img === 'string' ? getIconKey(item.img) : null
  if (icon) return `skinforge-icon://${icon}.webp`

  // Tier 2: Direct custom image path / URL / SVG
  if (item?.img && typeof item.img === 'string' && item.img.length > 0) {
    return item.img
  }

  // Tier 3: Default item without individual texture fallback to hero portrait or category SVG
  if (!item || item.isDefault || (item.name && item.name.toLowerCase().includes('official base'))) {
    if (heroObj?.img) {
      return heroObj.img
    }
    if (heroTag) {
      const catSvg = getCategorySvg(heroTag)
      if (catSvg) return catSvg
      return `../assets/heroes/${getCanonicalHero(heroTag)}.png`
    }
    return generateItemSvg({ name: 'Default Base', rarity: 'default', isDefault: true }, slotId)
  }

  // Tier 4: Procedural SVG Fallback
  return generateItemSvg(item, slotId)
}
