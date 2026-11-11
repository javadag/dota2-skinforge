/**
 * Dota 2 SkinForge — per-item style options for the UI.
 *
 * Generated from items_game.txt via `npm run build:styles`. Each style carries its
 * `alternate_icons` art (`img`), so the style picker can show per-style thumbnails.
 */

import itemStylesData from '../../../data/itemStyles.json'

export interface StyleOption {
  index: number
  name: string
  description?: string
  skin?: number
  model?: string
  /** Valve `image_inventory`-style icon path for this style, when the schema ships one. */
  img?: string
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

const items: Record<string, StylesEntry> = (itemStylesData as { items?: Record<string, StylesEntry> })?.items ?? {}

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
 * Resolve an equipped display name to its styles entry: exact name, ` - Style N`
 * normalized form, then the base item before a ` - <variant>` suffix (how style-variant
 * rows are equipped).
 */
function findEntry(itemName: string): StylesEntry | undefined {
  const direct = items[itemName] ?? items[normalizeItemName(itemName)]
  if (direct) return direct
  const dashIndex = itemName.lastIndexOf(' - ')
  if (dashIndex > 0) {
    const base = itemName.slice(0, dashIndex).trim()
    return items[base] ?? items[normalizeItemName(base)]
  }
  return undefined
}

/**
 * Style options for an item, looked up by its display name. `heroTag` and `slotId` are
 * accepted for call-site compatibility and deliberately do not guard the lookup: one
 * schema id can be listed under several heroes (Almond the Frondillo ships on nine), and
 * the armory's persona slot ids don't match the schema's (`persona_weapon` vs
 * `weapon_persona_1`) — an owner/slot guard only hides styles that are correct.
 */
export function getItemStyleOptions(heroTag?: string, slotId?: string, itemName?: string): CosmeticCustomizationInfo | null {
  if (!itemName) return null
  const entry = findEntry(itemName)
  if (!entry || entry.styles.length === 0) return null
  return { hasStyles: true, styles: entry.styles }
}

/** Style metadata declared by the generated armory styles, by name only. */
export function getStyleOptionsByName(itemName?: string): StyleOption[] {
  if (!itemName) return []
  return findEntry(itemName)?.styles ?? []
}

/**
 * The style an equipped name implies, for display before the user has saved one: a
 * ` - <style name>` variant row maps to that option and ` - Style <n>` maps to n-1 (the
 * rule the install pipeline applies); anything else means the default, index 0.
 */
export function inferStyleIndex(itemName: string | undefined, options: StyleOption[]): number {
  if (!itemName || options.length === 0) return 0
  const dashIndex = itemName.lastIndexOf(' - ')
  if (dashIndex > 0) {
    const suffix = itemName
      .slice(dashIndex + 3)
      .trim()
      .toLowerCase()
    const byName = options.find((option) => option.name.toLowerCase() === suffix)
    if (byName) return byName.index
  }
  const styleMatch = itemName.match(/\s-\s*Style\s*(\d+)/i)
  if (styleMatch) {
    const wanted = Math.max(0, Number.parseInt(styleMatch[1], 10) - 1)
    if (options.some((option) => option.index === wanted)) return wanted
  }
  return 0
}
