/**
 * Dota 2 SkinForge — per-item style options for the UI.
 *
 * The generated `data/itemStyles.json` catalog was removed together with the old
 * modifier schema pipeline, so style options are currently unavailable. The API is
 * kept intact so the editor can start offering styles again as soon as the catalog
 * is regenerated from `items_game.txt`.
 */

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

const items: Record<string, StylesEntry> = {}

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

  if (heroTag && entry.hero && entry.hero !== heroTag.toLowerCase()) return null
  if (slotId && entry.slot && entry.slot !== slotId) return null

  return { hasStyles: true, styles: entry.styles }
}

/** Style metadata declared by the generated catalog, without the hero/slot guard. */
export function getStyleOptionsByName(itemName?: string): StyleOption[] {
  if (!itemName) return []
  return items[itemName]?.styles ?? []
}
