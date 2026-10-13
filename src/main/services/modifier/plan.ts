/**
 * Dota 2 SkinForge — cosmetic resolution.
 *
 * Turns the user's slot selections into a concrete, explainable list of edits: which
 * default item each cosmetic lands on, why, and what was skipped. Nothing here is
 * hero-specific — arcana companions come from `item_sets`, persona pieces from
 * `*_persona_N` default items, and every decision is recorded as a `PatchReason` so the
 * UI can show what the mod will actually do.
 */

import {
  baseSlotOfPersona,
  defaultFor,
  defaultSlots,
  isPersonaSlot,
  itemByName,
  personaVariantSlots,
  primarySetFor,
  type SchemaIndex,
  type SchemaItem
} from './schema'
import { getCanonicalHero } from '../../../shared/constants/heroAliases'

export type PatchReason =
  /** The user picked this item for this slot. */
  | 'requested'
  /** Auto-paired from the picked item's set, e.g. the rest of an arcana. */
  | 'set-companion'
  /** The persona selector itself, which swaps the hero's body. */
  | 'persona-activation'
  /** A persona's own piece, applied to the slot it re-skins. */
  | 'persona-piece'
  /** A base slot the active persona does not cover, hidden with the null model. */
  | 'persona-hide'

export interface PlannedPatch {
  hero: string
  slot: string
  defaultItem: SchemaItem
  /** The cosmetic to apply, or null to hide the slot. */
  cosmetic: SchemaItem | null
  style: number
  reason: PatchReason
}

export interface SkippedSelection {
  hero: string
  slot: string
  itemName: string
  reason: string
}

export interface ModificationPlan {
  patches: PlannedPatch[]
  skipped: SkippedSelection[]
  warnings: string[]
}

export type CustomizationsMap = Record<string, Record<string, { style?: number }>>

const DEFAULT_STYLE = 0

function styleOf(customizations: CustomizationsMap, hero: string, slot: string): number {
  const style = customizations?.[hero]?.[slot]?.style
  return typeof style === 'number' && Number.isFinite(style) && style >= 0 ? style : DEFAULT_STYLE
}

/** The persona a hero's `persona_selector` slot can activate, if the hero has one. */
export function personaItemFor(schema: SchemaIndex, hero: string): SchemaItem | undefined {
  return schema.personaSelectors.get(hero)?.[0]
}

/**
 * Map a UI hero tag to the name the schema uses. The catalog and `items_game.txt` use
 * internal names (`windrunner`, `zuus`, `skeleton_king`) while the UI exposes display
 * names (`windranger`, `zeus`, `wraith king`), so aliases are resolved here rather than
 * being duplicated per hero elsewhere.
 */
export function ownerFor(schema: SchemaIndex, heroTag: string): string | undefined {
  const lower = heroTag.toLowerCase()
  const candidates = [
    getCanonicalHero(heroTag),
    lower,
    lower.replace(/\s+/g, '_'),
    lower.replace(/-/g, '_'),
    lower.replace(/[^a-z0-9]/g, '')
  ]
  for (const candidate of candidates) {
    if (candidate && schema.defaults.has(candidate)) return candidate
  }
  return undefined
}

interface Claim {
  item: SchemaItem
  style: number
  reason: PatchReason
}

/**
 * Build the edits for every hero the user has customised.
 *
 * Order matters: explicit selections are claimed first and never overwritten, then set
 * companions fill the gaps, then persona pieces and hides. Anything that cannot be
 * resolved exactly is reported in `skipped`/`warnings` rather than guessed at.
 */
export function buildPlan(
  schema: SchemaIndex,
  equipped: Record<string, Record<string, string>> = {},
  customizations: CustomizationsMap = {}
): ModificationPlan {
  const patches: PlannedPatch[] = []
  const skipped: SkippedSelection[] = []
  const warnings: string[] = []

  for (const heroTag of Object.keys(equipped)) {
    const selections = equipped[heroTag]
    if (!selections || typeof selections !== 'object') continue

    const hero = ownerFor(schema, heroTag)
    if (!hero) {
      warnings.push(`${heroTag}: no default items found in items_game.txt for this hero.`)
      continue
    }
    const claims = new Map<string, Claim>()

    // 1. Explicit selections.
    for (const [slot, rawName] of Object.entries(selections)) {
      if (typeof rawName !== 'string') continue
      const name = rawName.trim()
      if (!name || /official base/i.test(name) || name.toLowerCase() === 'default') continue

      const item = itemByName(schema, name)
      if (!item) {
        skipped.push({ hero, slot, itemName: name, reason: 'not found in items_game.txt' })
        continue
      }

      // The item's own declared slot wins when the hero has a default for it. The UI catalog
      // and the schema can disagree: after Valve migrated Legion Commander's arcana from her
      // blades to a `hero_base` item, the shipped catalog still listed it under `weapon`, so
      // acting on the requested slot wrote the arcana onto the weapon default instead of the
      // base. Slot-less items (music packs, wards, ...) declare nothing, so the requested slot
      // is used for them.
      const declaredSlot = item.slot && defaultFor(schema, hero, item.slot) ? item.slot : undefined
      let targetSlot = declaredSlot ?? slot
      let target = defaultFor(schema, hero, targetSlot)
      if (!target && !declaredSlot && item.resolvedSlot) {
        target = defaultFor(schema, hero, item.resolvedSlot)
        targetSlot = item.resolvedSlot
      }
      if (!target) {
        skipped.push({ hero, slot, itemName: name, reason: `no ${hero} default item for slot "${targetSlot}"` })
        continue
      }
      if (declaredSlot && declaredSlot !== slot) {
        warnings.push(`${name}: declared as slot "${declaredSlot}" but selected under "${slot}"; applied to "${declaredSlot}".`)
      }
      claims.set(targetSlot, { item, style: styleOf(customizations, heroTag, slot), reason: 'requested' })
    }

    // 2. Arcana / set companions — derived from item_sets, never a hardcoded list.
    for (const claim of [...claims.values()]) {
      const choice = primarySetFor(schema, claim.item)
      if (!choice) continue
      if (choice.ambiguous) {
        warnings.push(`${claim.item.name}: could not tell which set it belongs to, so companion pieces were not paired.`)
        continue
      }
      // An item may declare that a slot must keep its *default* when it is equipped. Legion
      // Commander's arcana relies on this: it rewrites the default weapon into its dual swords
      // via its own `type model` remaps and lists the alternate weapons as exceptions. Pairing
      // the set's weapon piece into that slot replaces the default model with the legacy
      // single-weapon look and leaves the arcana's dual-wield activity without a matching
      // model, which is what produced a one-weapon hero and an ERROR model after a reconnect.
      const keepsDefault = new Set(claim.item.forcesDefaultSlots)
      for (const memberName of choice.set.members) {
        if (memberName === claim.item.name) continue
        const member = itemByName(schema, memberName)
        if (!member?.resolvedSlot) continue
        if (keepsDefault.has(member.resolvedSlot)) {
          skipped.push({
            hero,
            slot: member.resolvedSlot,
            itemName: member.name,
            reason: `${claim.item.name} keeps the default item in this slot, so the set piece was not paired`
          })
          continue
        }
        if (claims.has(member.resolvedSlot)) continue
        if (!defaultFor(schema, hero, member.resolvedSlot)) {
          warnings.push(`${hero}: "${member.name}" has no matching default item for slot "${member.resolvedSlot}".`)
          continue
        }
        claims.set(member.resolvedSlot, { item: member, style: DEFAULT_STYLE, reason: 'set-companion' })
      }
    }

    // 3. Persona handling.
    const personaRequested = [...claims.keys()].some((slot) => isPersonaSlot(slot))
    if (personaRequested) {
      const persona = personaItemFor(schema, hero)
      if (!persona) {
        warnings.push(`${hero}: a persona slot was selected but the schema defines no persona for this hero.`)
      } else {
        // 3a. Activate the persona on its own selector: this carries `type persona`
        //     and the `entity_model` that swaps the hero's body.
        if (!claims.has('persona_selector') && defaultFor(schema, hero, 'persona_selector')) {
          claims.set('persona_selector', { item: persona, style: DEFAULT_STYLE, reason: 'persona-activation' })
        }

        // 3b. Apply each persona piece to the slot it re-skins, so the persona renders
        //     even when the client's own loadout does not switch to `_persona_N` slots.
        //     When a hero has no base default for the slot, the `_persona_N` default item
        //     already carries the piece and there is nothing to substitute.
        const variants = personaVariantSlots(schema, hero)
        for (const [baseSlot, variantItem] of variants) {
          if (claims.has(baseSlot)) continue
          if (!defaultFor(schema, hero, baseSlot)) {
            skipped.push({
              hero,
              slot: baseSlot,
              itemName: variantItem.name,
              reason: 'hero has no base default for this slot; the persona variant default item already provides it'
            })
            continue
          }
          claims.set(baseSlot, { item: variantItem, style: DEFAULT_STYLE, reason: 'persona-piece' })
        }

        // 3c. Hide base slots the persona does not cover, so adult geometry cannot clip
        //     through the persona body. Only slots that actually render a model are
        //     hidden — default items without `model_player` (voice, pet summons, and the
        //     `hero_base` body slots some heroes have) must never be pointed at the null
        //     prop, which would blank the hero.
        for (const slot of defaultSlots(schema, hero)) {
          if (isPersonaSlot(slot) || baseSlotOfPersona(slot)) continue
          if (variants.has(slot) || claims.has(slot)) continue
          if (slot === 'persona_selector') continue
          const target = defaultFor(schema, hero, slot)
          if (!target?.model) continue
          claims.set(slot, { item: target, style: DEFAULT_STYLE, reason: 'persona-hide' })
        }
      }
    }

    for (const [slot, claim] of claims) {
      const target = defaultFor(schema, hero, slot)
      if (!target) continue
      patches.push({
        hero,
        slot,
        defaultItem: target,
        cosmetic: claim.reason === 'persona-hide' ? null : claim.item,
        style: claim.style,
        reason: claim.reason
      })
    }
  }

  return { patches, skipped, warnings }
}
