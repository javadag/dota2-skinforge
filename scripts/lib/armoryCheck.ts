/**
 * Armory/schema consistency checks, kept separate from the CLI so they stay testable.
 *
 * `data/heroes_armory.json` is a generated snapshot of which cosmetic belongs in which slot for
 * which hero. Valve re-slots items with no announcement — Legion Commander's arcana moved from
 * her blades to a `hero_base` item while the armory kept listing it under `weapon`, so the UI
 * offered "Blades of Voth Domosh" twice in the weapon picker. These checks catch that class of
 * drift between a shipped armory and the `items_game.txt` it was built from.
 *
 * The slot mapping lives here too, so the builder and the checker can never disagree about
 * which schema slot an item belongs to.
 */

import { getCanonicalHero } from '../../src/shared/constants/heroAliases'
import type { SchemaIndex, SchemaItem } from '../../src/main/services/modifier/schema'

export interface ArmoryMod {
  id: number
  name: string
  rarity?: string
  img?: string
}

export interface ArmorySlot {
  slot: string
  title?: string
  empty_img?: string
  mods: ArmoryMod[]
}

export interface ArmorySetPiece {
  /** Armory slot the piece sits in. */
  slot: string
  /** Valve schema item id of the piece. */
  id: number
}

export interface ArmorySet {
  id: string
  name: string
  rarity?: string
  img?: string
  isPersona?: boolean
  items: ArmorySetPiece[]
}

export interface ArmoryOwner {
  tag?: string
  slots?: ArmorySlot[]
  sets?: ArmorySet[]
  [key: string]: unknown
}

export type Armory = Record<string, ArmoryOwner>

export interface Finding {
  level: 'error' | 'info'
  where: string
  message: string
  /** Present when the tool can repair the finding unattended. */
  repair?: () => void
}

/** Schema slot -> armory slot: `head_persona_1` -> `persona_head`, taunts have no armory slot. */
export function armorySlotFor(item: SchemaItem): string | undefined {
  if (item.prefab === 'taunt') return undefined
  const slot = item.resolvedSlot || item.slot
  if (!slot) return undefined
  if (slot === 'persona_selector') return 'persona'
  const persona = /^(.*)_persona_\d+$/.exec(slot)
  if (persona) return `persona_${persona[1]}`
  return slot
}

/** Reverse of `armorySlotFor`: armory slot -> schema slot holding its default item. */
export function schemaSlotForArmorySlot(slot: string): string {
  if (slot === 'persona') return 'persona_selector'
  const persona = /^persona_(.+)$/.exec(slot)
  if (persona) return `${persona[1]}_persona_1`
  return slot
}

/**
 * Compare a shipped armory with the schema.
 *
 * Error-level findings are drift the armory must not contain and that we can repair.
 * Info-level findings are reported but never touched, because they may be deliberate.
 */
export function collectArmoryFindings(armory: Armory, schema: SchemaIndex): Finding[] {
  const findings: Finding[] = []
  const unmatchedOwners: string[] = []

  for (const ownerKey of Object.keys(armory)) {
    const entry = armory[ownerKey]
    const slots = entry?.slots
    if (!Array.isArray(slots)) {
      findings.push({ level: 'error', where: ownerKey, message: 'owner has no slots array' })
      continue
    }
    if (!schema.defaults.has(ownerKey) && !schema.defaults.has(getCanonicalHero(ownerKey))) unmatchedOwners.push(ownerKey)

    const slotById = new Map<string, ArmorySlot>()
    for (const slot of slots) {
      if (!slot?.slot) {
        findings.push({ level: 'error', where: ownerKey, message: 'slot without a name' })
        continue
      }
      if (slotById.has(slot.slot)) {
        findings.push({
          level: 'error',
          where: `${ownerKey}.${slot.slot}`,
          message: 'slot listed twice',
          repair: () => {
            entry.slots = (entry.slots ?? []).filter((s) => s !== slot)
          }
        })
      }
      slotById.set(slot.slot, slot)

      if (!Array.isArray(slot.mods) || slot.mods.length === 0) {
        findings.push({
          level: 'error',
          where: `${ownerKey}.${slot.slot}`,
          message: 'slot has no items',
          repair: () => {
            entry.slots = (entry.slots ?? []).filter((s) => s !== slot)
          }
        })
        continue
      }

      // The same id twice in one slot is only legal when the names differ: those are style
      // variants ("X" and "X - Distinguished"), which share an id by design.
      const seen = new Map<string, ArmoryMod>()
      for (const mod of slot.mods) {
        if (typeof mod?.id !== 'number' || !mod?.name) {
          findings.push({
            level: 'error',
            where: `${ownerKey}.${slot.slot}`,
            message: 'item without an id or name',
            repair: () => {
              slot.mods = slot.mods.filter((m) => m !== mod)
            }
          })
          continue
        }
        const key = `${mod.id}:${mod.name}`
        if (seen.has(key)) {
          findings.push({
            level: 'error',
            where: `${ownerKey}.${slot.slot} #${mod.id} "${mod.name}"`,
            message: 'listed twice in the same slot',
            repair: () => {
              slot.mods = slot.mods.filter((m) => m !== mod)
            }
          })
        } else {
          seen.set(key, mod)
        }
      }
    }

    // Which slots each item id currently appears in, so duplicates and mis-filing are visible.
    const byId = new Map<string, Array<{ slot: ArmorySlot; mod: ArmoryMod }>>()
    for (const slot of slots) {
      for (const mod of slot?.mods ?? []) {
        if (typeof mod?.id !== 'number' || !mod?.name) continue
        const list = byId.get(String(mod.id)) ?? []
        list.push({ slot, mod })
        byId.set(String(mod.id), list)
      }
    }

    for (const [id, entries] of byId) {
      const schemaItem = schema.items.get(id)
      if (!schemaItem) {
        for (const { slot, mod } of entries) {
          findings.push({
            level: 'error',
            where: `${ownerKey}.${slot.slot} #${id} "${mod.name}"`,
            message: 'item no longer exists in items_game.txt',
            repair: () => {
              slot.mods = slot.mods.filter((m) => m !== mod)
            }
          })
        }
        continue
      }

      const declared = armorySlotFor(schemaItem)
      const declaredSlot = declared ? slotById.get(declared) : undefined
      const distinctSlots = new Set(entries.map((e) => e.slot.slot))

      if (distinctSlots.size > 1) {
        const keep = declaredSlot ?? entries[0].slot
        findings.push({
          level: 'error',
          where: `${ownerKey} #${id} "${schemaItem.name}"`,
          message: `listed in ${[...distinctSlots].join(', ')}; keeping "${keep.slot}"`,
          repair: () => {
            for (const { slot, mod } of entries) {
              if (slot === keep) continue
              slot.mods = slot.mods.filter((m) => m !== mod)
            }
          }
        })
        continue
      }

      const current = entries[0]
      if (declared && declaredSlot && current.slot.slot !== declared) {
        findings.push({
          level: 'error',
          where: `${ownerKey}.${current.slot.slot} #${id} "${schemaItem.name}"`,
          message: `the schema declares slot "${declared}"`,
          repair: () => {
            for (const { slot, mod } of entries) {
              if (slot === declaredSlot) continue
              slot.mods = slot.mods.filter((m) => m !== mod)
              declaredSlot.mods.push(mod)
            }
          }
        })
      } else if (declared && !declaredSlot) {
        findings.push({
          level: 'info',
          where: `${ownerKey}.${current.slot.slot} #${id} "${schemaItem.name}"`,
          message: `declared as slot "${declared}", which this owner has no slot for — left alone`
        })
      }
    }

    // Sets live in the armory and reference pieces by {slot, id}: both halves have to
    // exist here or "Equip Entire Set" equips nothing for that piece.
    for (const set of entry.sets ?? []) {
      const where = `${ownerKey} set ${set.id}`
      for (const piece of set.items ?? []) {
        const slot = slotById.get(piece.slot)
        if (!slot) {
          findings.push({
            level: 'error',
            where,
            message: `piece #${piece.id} claims slot "${piece.slot}", which this owner does not have`
          })
          continue
        }
        if (!slot.mods.some((mod) => mod.id === piece.id)) {
          findings.push({
            level: 'error',
            where,
            message: `piece #${piece.id} is not in slot "${piece.slot}"`
          })
        }
      }
    }
  }

  if (unmatchedOwners.length > 0) {
    findings.push({
      level: 'info',
      where: `${unmatchedOwners.length} owner(s)`,
      message: `no matching hero or category in items_game.txt (announcer bundles and the like): ${unmatchedOwners
        .slice(0, 8)
        .join(', ')}${unmatchedOwners.length > 8 ? ', ...' : ''}`
    })
  }

  return findings
}

export function armoryEntryCount(armory: Armory): number {
  return Object.values(armory).reduce((total, owner) => total + (owner.slots ?? []).reduce((n, slot) => n + (slot.mods?.length ?? 0), 0), 0)
}
