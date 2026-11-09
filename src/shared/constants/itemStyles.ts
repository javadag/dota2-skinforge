/**
 * Dota 2 SkinForge — per-item style options for the UI.
 *
 * Generated from items_game.txt via `npm run build:styles`.
 */

import itemStylesCatalog from '../../../data/itemStyles.json'

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

const items: Record<string, StylesEntry> = (itemStylesCatalog as { items?: Record<string, StylesEntry> })?.items ?? {}

/** Every item the schema gives styles to (used by tests and diagnostics). */
export function styledItemNames(): string[] {
  return Object.keys(items)
}

function normalizeItemName(itemName: string): string {
  return itemName
    .replace(/\s*-\s*Style\s*\d+/i, '')
    .replace(/\s+Style\s*\d+/i, '')
    .trim()
}

/**
 * Style options for an item, looked up by its exact display name. `heroTag` and `slotId`
 * are accepted for call-site compatibility and used only to reject a mismatched lookup.
 */
export function getItemStyleOptions(heroTag?: string, slotId?: string, itemName?: string): CosmeticCustomizationInfo | null {
  if (!itemName) return null
  const entry = items[itemName] ?? items[normalizeItemName(itemName)]
  if (!entry || entry.styles.length === 0) return null

  if (heroTag && entry.hero && entry.hero !== heroTag.toLowerCase()) return null
  if (slotId && entry.slot && entry.slot !== slotId) return null

  return { hasStyles: true, styles: entry.styles }
}

/** Style metadata declared by the generated catalog, without the hero/slot guard. */
export function getStyleOptionsByName(itemName?: string): StyleOption[] {
  if (!itemName) return []
  const entry = items[itemName] ?? items[normalizeItemName(itemName)]
  if (entry) return entry.styles
  const dashIndex = itemName.lastIndexOf(' - ')
  if (dashIndex > 0) {
    const base = itemName.slice(0, dashIndex).trim()
    const baseEntry = items[base] ?? items[normalizeItemName(base)]
    return baseEntry?.styles ?? []
  }
  return []
}
