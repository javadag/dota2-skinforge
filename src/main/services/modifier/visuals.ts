/**
 * Dota 2 SkinForge — structural `visuals` / `portraits` transforms.
 *
 * Everything here works on parsed nodes rather than text. Style flattening is a filter
 * over `asset_modifier` entries plus removal of the `style` key, and portraits merge
 * per sub-key, so nothing depends on braces, indentation or key order.
 */

import { cloneNode, findAll, getNode, getString, isNode, setEntry, type VdfEntry, type VdfNode } from './vdf'
import { localize, type SchemaIndex } from './schema'

export interface StyleOption {
  index: number
  /** Localized display name, when the schema or localization provides one. */
  name: string
  token?: string
  skin?: number
}

/** `asset_modifier`, `asset_modifier0`, `asset_modifier1`, ... */
export function isAssetModifierKey(key: string): boolean {
  return key.toLowerCase().startsWith('asset_modifier')
}

export function assetModifiers(node: VdfNode | undefined): VdfEntry[] {
  if (!node || node.opaque) return []
  return node.entries.filter((entry) => isAssetModifierKey(entry.key) && isNode(entry.value))
}

function styleIndexOf(entry: VdfEntry): number | undefined {
  if (!isNode(entry.value)) return undefined
  const raw = getString(entry.value, 'style')
  if (raw === undefined) return undefined
  const parsed = Number.parseInt(raw, 10)
  return Number.isFinite(parsed) ? parsed : undefined
}

/**
 * Available styles for an item, from `visuals.styles` where present and otherwise from
 * the distinct `style` tags on its `asset_modifier` entries. Names come from the
 * schema's own localization tokens (`#DOTA_Style_...`), which resolve through
 * dota_english.txt.
 */
export function styleOptions(schema: SchemaIndex, visuals: VdfNode | undefined): StyleOption[] {
  if (!visuals || visuals.opaque) return []
  const byIndex = new Map<number, StyleOption>()

  const stylesNode = getNode(visuals, 'styles')
  if (stylesNode && !stylesNode.opaque) {
    for (const entry of stylesNode.entries) {
      const index = Number.parseInt(entry.key, 10)
      if (!Number.isFinite(index) || !isNode(entry.value)) continue
      const token = getString(entry.value, 'name')
      const skinRaw = getString(entry.value, 'skin')
      const skin = skinRaw === undefined ? undefined : Number.parseInt(skinRaw, 10)
      byIndex.set(index, {
        index,
        token,
        name: localize(schema, token) ?? `Style ${index + 1}`,
        skin: Number.isFinite(skin) ? skin : undefined
      })
    }
  }

  for (const entry of assetModifiers(visuals)) {
    const index = styleIndexOf(entry)
    if (index === undefined || byIndex.has(index)) continue
    byIndex.set(index, { index, name: `Style ${index + 1}` })
  }

  return [...byIndex.values()].sort((a, b) => a.index - b.index)
}

/**
 * Produce an unconditional copy of a `visuals` block for one style: keep modifiers that
 * are style-less or match the target, drop the `style` key so the client applies them,
 * and drop the `styles` table (it describes item instancing, not a base model).
 */
export function flattenVisuals(schema: SchemaIndex, visuals: VdfNode, targetStyle: number): VdfNode {
  const out = cloneNode(visuals)

  out.entries = out.entries.filter((entry) => !entry.key.toLowerCase().startsWith('styles'))
  out.entries = out.entries.filter((entry) => {
    if (!isAssetModifierKey(entry.key)) return true
    const index = styleIndexOf(entry)
    return index === undefined || index === targetStyle
  })

  // `named_value` entries describe the behaviour of an *equipped* item instance: slot
  // forcing, gestures, high-five level. A default item is never equipped, so they are
  // meaningless there — and `force_default_item_into_slot_index_when_equipped` in
  // particular makes the client believe the default item is claiming a slot, which is the
  // condition behind the armory's "conflicting items were equipped" message.
  out.entries = out.entries.filter((entry) => {
    if (!isAssetModifierKey(entry.key) || !isNode(entry.value)) return true
    return getString(entry.value, 'type') !== 'named_value'
  })

  for (const entry of out.entries) {
    if (!isAssetModifierKey(entry.key) || !isNode(entry.value)) continue
    entry.value.entries = entry.value.entries.filter((child) => child.key.toLowerCase() !== 'style')
  }

  // If the style declares a skin but no model_skin modifier survived, add one.
  const hasModelSkin = assetModifiers(out).some((entry) => isNode(entry.value) && getString(entry.value, 'type') === 'model_skin')
  if (!hasModelSkin) {
    const option = styleOptions(schema, visuals).find((style) => style.index === targetStyle)
    if (option?.skin !== undefined) {
      out.entries.push({
        key: 'asset_modifier',
        value: {
          entries: [
            { key: 'type', value: 'model_skin', keyStart: 0, keyEnd: 0, valueStart: 0, valueEnd: 0 },
            { key: 'skin', value: String(option.skin), keyStart: 0, keyEnd: 0, valueStart: 0, valueEnd: 0 }
          ],
          start: 0,
          end: 0
        },
        keyStart: 0,
        keyEnd: 0,
        valueStart: 0,
        valueEnd: 0
      })
    }
  }

  return out
}

/**
 * Copy a cosmetic's visual identity onto a target default item:
 * `model_player`, `particle_folder`, the whole `visuals` block (style-flattened), and
 * `portraits` merged per sub-key so a cosmetic that only supplies `icon` keeps the
 * default item's in-game `game` camera.
 *
 * Both nodes must already be deep-materialized, and `target` must be a clone.
 */
export function applyVisuals(schema: SchemaIndex, target: VdfNode, cosmetic: VdfNode, targetStyle: number): void {
  if (target.opaque || cosmetic.opaque) {
    throw new Error('applyVisuals requires deep-materialized nodes; call materializeDeep first')
  }

  const model = getString(cosmetic, 'model_player')
  if (model !== undefined) setEntry(target, 'model_player', model)

  const particles = getString(cosmetic, 'particle_folder')
  if (particles !== undefined) setEntry(target, 'particle_folder', particles)

  const visuals = getNode(cosmetic, 'visuals')
  if (visuals) {
    if (visuals.opaque) throw new Error('applyVisuals requires a materialized visuals block')
    setEntry(target, 'visuals', flattenVisuals(schema, visuals, targetStyle))
  }

  const portraits = getNode(cosmetic, 'portraits')
  if (portraits) {
    if (portraits.opaque) throw new Error('applyVisuals requires a materialized portraits block')
    mergePortraits(target, portraits)
  }
}

/** Merge `portraits` sub-blocks (`icon`, `game`, ...) into the target. */
function mergePortraits(target: VdfNode, incoming: VdfNode): void {
  let existing = getNode(target, 'portraits')
  if (!existing) {
    existing = { entries: [], start: 0, end: 0 }
    setEntry(target, 'portraits', existing)
  }
  if (existing.opaque) return
  for (const entry of incoming.entries) {
    const current = existing.entries.find((candidate) => candidate.key.toLowerCase() === entry.key.toLowerCase())
    const value = isNode(entry.value) ? cloneNode(entry.value) : entry.value
    if (current) current.value = value
    else existing.entries.push({ ...entry, value })
  }
}

export const NULL_MODEL = 'models/props_nature/prop_null.vmdl'

/** Hide a slot by pointing its model at the null prop. */
export function applyHide(target: VdfNode): void {
  setEntry(target, 'model_player', NULL_MODEL)
}

/** Signature used to recognise an already-present modifier. */
function modifierSignature(modifier: VdfNode): string {
  return ['type', 'asset', 'modifier', 'style', 'skin', 'control_point_number'].map((key) => getString(modifier, key) ?? '').join('|')
}

/**
 * Ensure a target carries the given `asset_modifier` blocks, adding only those that are
 * not already present. Used for the hero-model anchor: the `entity_model` modifier that
 * swaps a hero's whole model is declared on an arcana's `hero_base` item, and `hero_base`
 * is not a loadout slot the client resolves, so the same modifier has to also live on a
 * wearable the hero actually has.
 */
export function mergeAssetModifiers(target: VdfNode, modifiers: VdfNode[]): void {
  if (modifiers.length === 0 || target.opaque) return

  let visuals = getNode(target, 'visuals')
  if (!visuals) {
    visuals = { entries: [], start: 0, end: 0 }
    setEntry(target, 'visuals', visuals)
  }
  if (visuals.opaque) throw new Error('mergeAssetModifiers requires a materialized visuals block')

  const existing = new Set(assetModifiers(visuals).map((entry) => (isNode(entry.value) ? modifierSignature(entry.value) : '')))
  for (const modifier of modifiers) {
    const signature = modifierSignature(modifier)
    if (existing.has(signature)) continue
    existing.add(signature)
    visuals.entries.push({
      key: 'asset_modifier',
      value: cloneNode(modifier),
      keyStart: 0,
      keyEnd: 0,
      valueStart: 0,
      valueEnd: 0
    })
  }
}

/** Entries that reference a `type` value anywhere in a visuals block. */
export function modifierTypes(visuals: VdfNode | undefined): string[] {
  return assetModifiers(visuals)
    .map((entry) => (isNode(entry.value) ? getString(entry.value, 'type') : undefined))
    .filter((value): value is string => Boolean(value))
}

export function hasModifierType(visuals: VdfNode | undefined, type: string): boolean {
  return modifierTypes(visuals).includes(type)
}

export function findStringEntry(node: VdfNode | undefined, key: string): VdfEntry | undefined {
  return findAll(node, key)[0]
}
