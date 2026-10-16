/**
 * Dota 2 SkinForge — schema compiler.
 *
 * Parses items_game.txt into a span-preserving tree, builds the schema index, resolves a
 * plan, then rewrites only the item blocks that change. Each touched item is cloned,
 * mutated and re-serialized over its own span, so untouched bytes are copied verbatim
 * and overlapping edits are impossible.
 *
 * The output is re-parsed before it is handed back: a structural failure fails the
 * install instead of shipping a corrupt schema to the game.
 */

import {
  applySplices,
  cloneNode,
  detectEol,
  getNode,
  getString,
  isNode,
  materializeDeep,
  parseVdf,
  spliceNode,
  type VdfDocument,
  type VdfNode
} from './vdf'
import { buildSchema, defaultFor, defaultSlots, isOpaqueBlock, isPersonaSlot, type SchemaItem } from './schema'
import { buildPlan, type CustomizationsMap, type PatchReason as PlanPatchReason, type SkippedSelection } from './plan'
import { applyHide, applyVisuals, assetModifiers, flattenVisuals, mergeAssetModifiers } from './visuals'
import { baseModelForHero } from './heroBaseModels'

export type PatchReason = PlanPatchReason | 'hero-model-anchor'

export interface AppliedPatch {
  hero: string
  slot: string
  itemName: string
  targetId: string
  reason: PatchReason
  style: number
  /** Slots whose item had no declared `item_slot`, so the weapon convention was used. */
  assumedSlot?: string
}

export interface EntityModelOverride {
  hero: string
  baseModel: string
  overrideModel: string
}

export interface CompileReport {
  patchedCount: number
  /** Distinct items_game.txt item blocks rewritten. */
  itemsTouched: number
  applied: AppliedPatch[]
  warnings: string[]
  skipped: SkippedSelection[]
  validation: ValidationResult
  entityModelOverrides: EntityModelOverride[]
}

export interface ValidationResult {
  ok: boolean
  itemCountBefore: number
  itemCountAfter: number
  errors: string[]
}

export interface CompileResult {
  content: string
  report: CompileReport
}

export interface CompileOptions {
  /** Contents of dota_english.txt, so style names resolve to readable labels. */
  localizationText?: string
}

function countItemBlocks(doc: VdfDocument): number {
  const items = getNode(doc.root, 'items')
  return items && !items.opaque ? items.entries.length : 0
}

/**
 * Apply every requested cosmetic to the schema text.
 *
 * @param source raw `items_game.txt`
 */
export function compileItemsGame(
  source: string,
  equipped: Record<string, Record<string, string>> = {},
  customizations: CustomizationsMap = {},
  options: CompileOptions = {}
): CompileResult {
  const doc = parseVdf(source, { opaque: isOpaqueBlock })
  const schema = buildSchema(source, { document: doc, localizationText: options.localizationText })
  const plan = buildPlan(schema, equipped, customizations)

  // Group by target item: a shared default item (e.g. the all-heroes pet) may be
  // targeted by more than one hero, and a single item must produce a single splice.
  const byTarget = new Map<string, typeof plan.patches>()
  for (const patch of plan.patches) {
    const list = byTarget.get(patch.defaultItem.id)
    if (list) list.push(patch)
    else byTarget.set(patch.defaultItem.id, [patch])
  }

  const warnings = [...plan.warnings]
  const applied: AppliedPatch[] = []
  const splices = []
  const expectedModel = new Map<string, string | null>()

  // Hero-model anchors.
  //
  // An arcana whose item_slot is `hero_base` declares its body *only* through an
  // `entity_model` modifier: no `hero_base` item in the schema has a `model_player`
  // (verified across every hero), so there is no model to swap in by the usual route.
  // And `hero_base` is not a loadout slot the client resolves, so the modifier has to be
  // mirrored onto wearable default items.
  //
  // Mirroring onto a single preferred slot (head, then back, then weapon) is not enough:
  // it silently does nothing when the player already has that slot occupied — which is
  // exactly the case for someone who owns the arcana, because its own set includes a head
  // piece that sits in the head slot. So the swap is mirrored onto *every* wearable
  // default item that renders a model. The modifier is idempotent and duplicates are
  // deduplicated, so whichever slot the player leaves empty carries the body swap, and
  // slots they have occupied simply ignore it.
  const anchorModifiers = new Map<string, { target: SchemaItem; modifiers: VdfNode[]; hero: string }>()
  const swapModifiers = new Map<string, Array<{ node: VdfNode; reason: PatchReason }>>()
  for (const patch of plan.patches) {
    if (!patch.cosmetic) continue
    const cosmeticNode = patch.cosmetic.entry.value
    if (typeof cosmeticNode === 'string') continue
    materializeDeep(source, cosmeticNode)
    const visuals = getNode(cosmeticNode, 'visuals')
    if (!visuals) continue
    // Flatten to the selected style first: an arcana declares one body swap per style,
    // and only the chosen one may be mirrored onto the anchors.
    const flattened = visuals.opaque ? undefined : flattenVisuals(schema, visuals, patch.style)
    if (!flattened) continue
    const target = `npc_dota_hero_${patch.hero}`
    const swaps = assetModifiers(flattened)
      .map((entry) => entry.value)
      .filter(
        (value): value is VdfNode => isNode(value) && getString(value, 'type') === 'entity_model' && getString(value, 'asset') === target
      )
    if (swaps.length === 0) continue
    const entries = swaps.map((node) => ({ node, reason: patch.reason }))
    const list = swapModifiers.get(patch.hero)
    if (list) list.push(...entries)
    else swapModifiers.set(patch.hero, entries)
  }

  for (const [hero, entries] of swapModifiers) {
    let anchored = 0
    const modifiers = entries.map((e) => e.node)
    for (const slot of defaultSlots(schema, hero)) {
      // `hero_base` is the item that already carries the swap and is never resolved;
      // persona slots belong to the persona machinery.
      if (slot === 'hero_base' || isPersonaSlot(slot)) continue
      const item = defaultFor(schema, hero, slot)
      if (!item?.model) continue
      const existing = anchorModifiers.get(item.id)
      if (existing) existing.modifiers.push(...modifiers)
      else anchorModifiers.set(item.id, { target: item, modifiers: [...modifiers], hero })
      anchored++
    }
    if (anchored === 0) {
      warnings.push(`${hero}: the body swap could not be anchored to a wearable slot, so the arcana model may not appear.`)
    }
  }

  // Build entity model overrides for root entity model packaging in VPK.
  // When an Arcana or Persona carries an `entity_model` swap, the client engine loads the
  // hero's root entity model from `models/heroes/<hero>/<hero>.vmdl`. Swapping the actual
  // compiled `.vmdl_c` in the mod VPK ensures the Arcana/Persona body and face are rendered
  // seamlessly without vanilla hero face/body clipping, and prevents missing parts/ERROR models on reconnect.
  const entityModelOverrides: EntityModelOverride[] = []
  for (const [hero, entries] of swapModifiers) {
    const personaEntry = entries.find((e) => e.reason === 'persona-activation')
    const chosen = personaEntry ?? entries[entries.length - 1]
    const overrideModel = chosen ? getString(chosen.node, 'modifier') : undefined
    if (overrideModel) {
      entityModelOverrides.push({
        hero,
        baseModel: baseModelForHero(hero),
        overrideModel
      })
    }
  }

  for (const targetId of anchorModifiers.keys()) {
    if (!byTarget.has(targetId)) byTarget.set(targetId, [])
  }

  for (const [targetId, patches] of byTarget) {
    const target = patches[0]?.defaultItem ?? anchorModifiers.get(targetId)!.target
    const targetNode = target.entry.value
    if (typeof targetNode === 'string') continue
    materializeDeep(source, targetNode)
    const clone = cloneNode(targetNode)

    for (const patch of patches) {
      if (patch.cosmetic === null) {
        applyHide(clone)
        expectedModel.set(targetId, 'models/props_nature/prop_null.vmdl')
      } else {
        const cosmeticNode = patch.cosmetic.entry.value
        if (typeof cosmeticNode === 'string') continue
        materializeDeep(source, cosmeticNode)
        applyVisuals(schema, clone, cosmeticNode, patch.style)
        expectedModel.set(targetId, patch.cosmetic.model || null)
      }
      applied.push({
        hero: patch.hero,
        slot: patch.slot,
        itemName: patch.cosmetic ? patch.cosmetic.name : '(hidden)',
        targetId,
        reason: patch.reason,
        style: patch.style,
        assumedSlot: patch.cosmetic && patch.cosmetic.slotSource === 'fallback' ? patch.cosmetic.name : undefined
      })
    }

    const anchor = anchorModifiers.get(targetId)
    if (anchor) {
      mergeAssetModifiers(clone, anchor.modifiers)
      applied.push({
        hero: anchor.hero,
        slot: target.resolvedSlot,
        itemName: `${anchor.modifiers.length} hero-model modifier(s)`,
        targetId,
        reason: 'hero-model-anchor',
        style: 0
      })
    }

    splices.push(spliceNode(clone, detectEol(source), 2))
  }

  const content = applySplices(source, splices)
  const validation = validate(source, content, doc, expectedModel, warnings)

  return {
    content,
    report: {
      patchedCount: applied.filter((entry) => entry.reason !== 'hero-model-anchor').length,
      itemsTouched: byTarget.size,
      applied,
      warnings,
      skipped: plan.skipped,
      validation,
      entityModelOverrides
    }
  }
}

/**
 * Re-parse the generated schema and confirm it is still structurally sound and that
 * every rewritten item actually carries the expected model. A failure here aborts the
 * install rather than shipping a corrupt `items_game.txt`.
 */
function validate(
  source: string,
  content: string,
  before: VdfDocument,
  expectedModel: Map<string, string | null>,
  warnings: string[]
): ValidationResult {
  const errors: string[] = []
  const itemCountBefore = countItemBlocks(before)

  let after: VdfDocument
  try {
    after = parseVdf(content, { opaque: isOpaqueBlock })
  } catch (error) {
    return {
      ok: false,
      itemCountBefore,
      itemCountAfter: 0,
      errors: [`Generated schema is not valid VDF: ${error instanceof Error ? error.message : String(error)}`]
    }
  }

  const itemCountAfter = countItemBlocks(after)
  if (itemCountAfter !== itemCountBefore) {
    errors.push(`Item block count changed: ${itemCountBefore} -> ${itemCountAfter}`)
  }

  const itemsNode = getNode(after.root, 'items')

  for (const [id, model] of expectedModel) {
    const entry = itemsNode && !itemsNode.opaque ? itemsNode.entries.find((candidate) => candidate.key === id) : undefined
    if (!entry || typeof entry.value === 'string') {
      errors.push(`Item ${id} is missing from the generated schema`)
      continue
    }
    materializeDeep(content, entry.value)
    const actual = getString(entry.value, 'model_player') ?? null
    if (model !== null && actual !== model) {
      errors.push(`Item ${id}: expected model_player "${model}" but found "${actual ?? '(none)'}"`)
    }
  }

  if (errors.length > 0) warnings.push(...errors)
  return { ok: errors.length === 0, itemCountBefore, itemCountAfter, errors }
}

export default compileItemsGame
