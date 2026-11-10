/**
 * Dota 2 SkinForge — Cosmetic Item Image Resolution Engine
 */

import { getCanonicalHero } from '../constants/heroAliases'
import { generateItemSvg } from './cardSvgGenerator'
import type { HeroImageTarget, ItemDescriptor } from './rarityConfig'
import { getCategorySvg } from './slotSvgIcons'

export function getItemImage(item?: ItemDescriptor | null, slotId = 'weapon', heroTag = '', heroObj?: HeroImageTarget | null): string {
  // Tier 1: Official Valve econ cosmetic asset -> skinforge-icon protocol (including default items with textures)
  if (
    item &&
    item.img &&
    typeof item.img === 'string' &&
    (item.img.startsWith('econ/') ||
      item.img.startsWith('loadingscreens/') ||
      item.img.startsWith('compendium/') ||
      item.img.startsWith('teamfancontent/') ||
      item.img.startsWith('talentcontent/') ||
      item.img.startsWith('events/') ||
      item.img.startsWith('stickers/') ||
      item.img.startsWith('materials/'))
  ) {
    const cleanImg = item.img.replace(/\.(png|vtex_c)$/i, '')
    return `skinforge-icon://${cleanImg}.webp`
  }

  // Tier 2: Direct custom image path / URL / SVG
  if (item && item.img && typeof item.img === 'string' && item.img.length > 0 && !item.img.includes('cloudflare')) {
    return item.img
  }

  // Tier 3: Default item without individual texture fallback to hero portrait or category SVG
  if (!item || item.isDefault || (item.name && item.name.toLowerCase().includes('official base'))) {
    if (heroObj && heroObj.img) {
      return heroObj.img
    }
    if (heroTag) {
      const catSvg = getCategorySvg(heroTag)
      if (catSvg) return catSvg
      return `../assets/heroes/${getCanonicalHero(heroTag)}.png`
    }
    return generateItemSvg({ name: 'Default Base', tag: 'default', isDefault: true }, slotId, heroTag)
  }

  // Tier 4: Procedural SVG Fallback
  return generateItemSvg(item, slotId, heroTag)
}
