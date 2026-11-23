/**
 * Dota 2 SkinForge — per-item style options for the UI and compiler.
 *
 * Generated from items_game.txt via `npm run build:styles`. Each style carries its
 * `alternate_icons` art (`img`), so the style picker can show per-style thumbnails.
 */

import itemStylesData from '../../../data/itemStyles.json'
import type { HeroCustomizationsMap } from '../types/customization'

export interface StyleOption {
  index: number
  name: string
  description?: string
  skin?: number
  model?: string
  /** Valve `image_inventory`-style icon path for this style, when the schema ships one. */
  img?: string
}

interface StylesEntry {
  hero: string
  slot: string
  note?: string
  styles: StyleOption[]
}

const items: Record<string, StylesEntry> = (itemStylesData as { items?: Record<string, StylesEntry> })?.items ?? {}

function normalizeItemName(itemName: string): string {
  return itemName
    .replace(/\s*-\s*Style\s*\d+/i, '')
    .replace(/\s+Style\s*\d+/i, '')
    .trim()
}

/** Lowercased, punctuation-free form of a style name, for tolerant suffix matching. */
function styleKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '')
}

/**
 * The suffix of a genuine style-variant row: one of the base's style names compared
 * without case or punctuation (the armory writes "Lefty - Linkens Sphere" where the
 * schema says "Lefty - Linken's Sphere Style Unlock"), or `Style N`. Set pieces share
 * the prefix too ("Dread Retribution - Cape") but their suffix matches no style, so
 * they stay their own items instead of inheriting the base's styles.
 */
function isVariantSuffix(entry: StylesEntry, suffix: string): boolean {
  if (!suffix) return false
  if (/^style\s*\d+$/i.test(suffix)) return true
  const needle = styleKey(suffix)
  return needle.length > 0 && entry.styles.some((style) => styleKey(style.name).includes(needle))
}

/**
 * Resolve an equipped display name to its styles entry: exact name, ` - Style N`
 * normalized form, then the base item — but only when the name really is a variant row
 * (`<base> - <style name>`). Set pieces share the prefix ("Dread Retribution - Cape")
 * and must stay their own items instead of inheriting the base's styles.
 */
function findEntry(itemName: string): StylesEntry | undefined {
  const direct = items[itemName] ?? items[normalizeItemName(itemName)]
  if (direct) return direct
  const dashIndex = itemName.lastIndexOf(' - ')
  if (dashIndex > 0) {
    const base = itemName.slice(0, dashIndex).trim()
    const entry = items[base] ?? items[normalizeItemName(base)]
    if (entry && isVariantSuffix(entry, itemName.slice(dashIndex + 3).trim())) return entry
  }
  return undefined
}

/** Style metadata declared by the generated armory styles, looked up by item display name. */
export function getStyleOptionsByName(itemName?: string): StyleOption[] {
  if (!itemName) return []
  return findEntry(itemName)?.styles ?? []
}

/** Optional short UI note explaining a custom style's in-game behavior or engine limitation. */
export function getStyleNoteByName(itemName?: string): string | undefined {
  if (!itemName) return undefined
  return findEntry(itemName)?.note
}

export function resolveCosmeticStyle(itemName?: string, style?: number): number {
  if (typeof style === 'number' && Number.isFinite(style) && style >= 0) return style
  if (!itemName) return 0
  const match = itemName.match(/style\s*(\d+)/i)
  if (match) return Math.max(0, parseInt(match[1], 10) - 1)
  const normalized = itemName.toLowerCase()
  return getStyleOptionsByName(itemName).find((option) => option.index > 0 && normalized.endsWith(option.name.toLowerCase()))?.index ?? 0
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

/**
 * What the picker should offer for a style list: the schema's options, with an explicit
 * Default prepended when they skip index 0. A list of one means there is no choice.
 */
export function displayStyleOptions(styles: StyleOption[]): StyleOption[] {
  if (styles.length === 0) return []
  return styles[0].index !== 0 ? [{ index: 0, name: 'Default' }, ...styles] : styles
}

/**
 * The base item name when `itemName` is a style-variant row the armory emits
 * (`<base> - <style name>`, or `<base> - Style <n>`), else null.
 */
export function styleVariantBaseName(itemName?: string): string | null {
  if (!itemName) return null
  if (items[itemName]) return null
  const dashIndex = itemName.lastIndexOf(' - ')
  if (dashIndex <= 0) return null
  const base = itemName.slice(0, dashIndex).trim()
  const entry = items[base] ?? items[normalizeItemName(base)]
  if (!entry || entry.styles.length === 0) return null
  return isVariantSuffix(entry, itemName.slice(dashIndex + 3).trim()) ? base : null
}

/**
 * The image for the style currently in effect on an equipped slot: the saved choice
 * wins, an equipped ` - <style name>` variant name implies its own style, and a single
 * style (or the default) has no art of its own.
 */
export function styleThumbFor(customizations: HeroCustomizationsMap, heroTag: string, slotId: string, itemName?: string): string | null {
  const styles = getStyleOptionsByName(itemName)
  const options = displayStyleOptions(styles)
  if (options.length < 2) return null
  const saved = customizations[heroTag]?.[slotId]?.style
  const index = options.some((option) => option.index === saved) ? (saved as number) : inferStyleIndex(itemName, styles)
  return options.find((option) => option.index === index)?.img ?? null
}
