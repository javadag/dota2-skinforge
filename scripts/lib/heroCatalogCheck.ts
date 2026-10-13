/**
 * Catalog/schema consistency checks, kept separate from the CLI so they can be unit tested and
 * reused by the test suite.
 *
 * The catalog is a generated snapshot of which cosmetic belongs in which slot for which hero.
 * Valve re-slots items with no announcement — Legion Commander's arcana moved from her blades to
 * a `hero_base` item while the catalog kept listing it under `weapon`, so the UI offered
 * "Blades of Voth Domosh" twice in the weapon picker. These checks catch that class of drift.
 */

import { getCanonicalHero } from '../../src/shared/constants/heroAliases'
import type { SchemaIndex } from '../../src/main/services/modifier/schema'

export interface CatalogItem {
  id: string | number
  name: string
  tag: string
  isDefault: boolean
  img?: string
  best?: boolean
}

export interface CatalogOwner {
  slots: Array<{ id: string; name: string; icon: string }>
  items: Record<string, CatalogItem[]>
}

export type Catalog = Record<string, CatalogOwner>

export interface Finding {
  level: 'error' | 'info'
  where: string
  message: string
  /** Present when the tool can repair the finding unattended. */
  repair?: () => void
}

/**
 * Compare every catalog entry with the schema.
 *
 * Error-level findings are drift the catalog must not contain and that we can repair. Info-level
 * findings are reported but never touched, because they may be deliberate.
 */
export function collectCatalogFindings(cat: Catalog, schema: SchemaIndex): Finding[] {
  const findings: Finding[] = []
  const unmatchedOwners: string[] = []

  for (const owner of Object.keys(cat)) {
    const entry = cat[owner]
    if (!entry?.items) continue
    if (!schema.defaults.has(owner) && !schema.defaults.has(getCanonicalHero(owner))) unmatchedOwners.push(owner)

    // Which groups each item id currently appears in, so duplicates and mis-filing are visible.
    const groupsById = new Map<string, string[]>()
    for (const group of Object.keys(entry.items)) {
      for (const item of entry.items[group]) {
        const id = String(item.id)
        const groups = groupsById.get(id)
        if (groups) groups.push(group)
        else groupsById.set(id, [group])
      }
    }

    for (const [id, groups] of groupsById) {
      const schemaItem = schema.items.get(id)

      if (!schemaItem) {
        findings.push({
          level: 'error',
          where: `${owner}.${groups.join('/')} #${id}`,
          message: 'item no longer exists in items_game.txt',
          repair: () => {
            for (const group of groups) entry.items[group] = entry.items[group].filter((i) => String(i.id) !== id)
          }
        })
        continue
      }

      // The item's declared slot is authoritative; the catalog's grouping is advisory.
      const declared = schemaItem.slot
      const hasDeclaredSlot = Boolean(declared) && entry.slots.some((slot) => slot.id === declared)

      if (hasDeclaredSlot && !groups.includes(declared)) {
        const moved = groups.map((group) => entry.items[group].find((i) => String(i.id) === id)).find(Boolean)
        findings.push({
          level: 'error',
          where: `${owner}.${groups.join('/')} #${id} "${schemaItem.name}"`,
          message: `catalog groups it under "${groups.join(', ')}" but the schema declares slot "${declared}"`,
          repair: () => {
            if (!moved) return
            for (const group of groups) entry.items[group] = entry.items[group].filter((i) => String(i.id) !== id)
            if (!entry.items[declared]) entry.items[declared] = []
            entry.items[declared].push(moved)
          }
        })
        continue
      }

      if (groups.length > 1) {
        const keep = hasDeclaredSlot ? declared : groups[0]
        findings.push({
          level: 'error',
          where: `${owner}.${groups.join('/')} #${id} "${schemaItem.name}"`,
          message: `listed in more than one slot group (keeping "${keep}")`,
          repair: () => {
            for (const group of groups) {
              if (group === keep) continue
              entry.items[group] = entry.items[group].filter((i) => String(i.id) !== id)
            }
          }
        })
        continue
      }

      if (declared && !groups.includes(declared)) {
        findings.push({
          level: 'info',
          where: `${owner}.${groups[0]} #${id} "${schemaItem.name}"`,
          message: `declared as slot "${declared}", which this owner has no catalog slot for — left alone`
        })
      }
    }
  }

  if (unmatchedOwners.length > 0) {
    findings.push({
      level: 'info',
      where: `${unmatchedOwners.length} catalog owner(s)`,
      message: `no matching hero or category in items_game.txt (announcer bundles and the like): ${unmatchedOwners
        .slice(0, 8)
        .join(', ')}${unmatchedOwners.length > 8 ? ', ...' : ''}`
    })
  }

  return findings
}

export function catalogEntryCount(cat: Catalog): number {
  return Object.values(cat).reduce((total, owner) => total + Object.values(owner.items ?? {}).reduce((n, list) => n + list.length, 0), 0)
}
