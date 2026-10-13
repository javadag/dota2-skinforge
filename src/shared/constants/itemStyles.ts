/**
 * Dota 2 SkinForge — per-item style options for the UI.
 *
 * Sourced from `data/itemStyles.json`, which `scripts/build_item_styles.ts` generates
 * from the game's own `items_game.txt` and localization. This replaces the previous
 * hand-written `ARCANA_REGISTRY` (15 items, several already out of date) with the 1,188
 * items the live schema actually gives styles to.
 */

import itemStylesData from '../../../data/itemStyles.json'
import { getCanonicalHero } from './heroAliases'

export interface StyleOption {
  index: number
  name: string
  description?: string
  skin?: number
  model?: string
}

export interface CosmeticCustomizationInfo {
  hasStyles: boolean
  styles: StyleOption[]
}

interface StylesEntry {
  hero: string
  slot: string
  styles: StyleOption[]
}

interface ItemStylesFile {
  generatedFrom: string
  itemCount: number
  items: Record<string, StylesEntry>
}

const catalog = itemStylesData as unknown as ItemStylesFile
const items: Record<string, StylesEntry> = catalog?.items ?? {}

/** Every item the schema gives styles to (used by tests and diagnostics). */
export function styledItemNames(): string[] {
  return Object.keys(items)
}

/**
 * Style options for an item, looked up by its exact display name. `heroTag` and `slotId`
 * are accepted for call-site compatibility and used only to reject a mismatched lookup.
 */
export function getItemStyleOptions(heroTag?: string, slotId?: string, itemName?: string): CosmeticCustomizationInfo | null {
  if (!itemName) return null
  const entry = items[itemName]
  if (!entry || entry.styles.length === 0) return null

  if (heroTag) {
    const canonical = getCanonicalHero(heroTag)
    if (entry.hero && entry.hero !== canonical && entry.hero !== heroTag.toLowerCase()) return null
  }
  if (slotId && entry.slot && entry.slot !== slotId) return null

  return { hasStyles: true, styles: entry.styles }
}

/** Style metadata declared by the generated catalog, without the hero/slot guard. */
export function getStyleOptionsByName(itemName?: string): StyleOption[] {
  if (!itemName) return []
  return items[itemName]?.styles ?? []
}
