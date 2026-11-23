/**
 * Overlay cleanup helpers run around overlay patch merging:
 * 1. Identify picked companion slots that belong to the same set as an active overlay.
 * 2. Strip `model_player` from default items whose overlay replaces the hero's root body
 *    directly without shipping an `items_patch.txt` (preventing duplicate geometry on reconnect).
 */

import { getRawHeroEntry } from '../../../../shared/armory/armoryCatalog'
import type { CosmeticAssetsManifest } from '../../assets/cosmeticAssets'
import type { VpkPackEntry } from '../../dota/vpkService'
import type { AppliedPatch } from '../../modifier/compile'
import { baseModelForHero } from '../../modifier/heroBaseModels'
import { detectEol, getString, parseVdf, removeKey, serializeValue } from '../../modifier/vdf'
import { applyItemBlocks, readItemsSection } from '../itemsGamePatcher'

/**
 * Find `${hero}/${slot}` keys for picked items that belong to the same armory set as an
 * active overlay pick (e.g. an Arcana bundle's companion back/belt/shoulder/weapon).
 * Treating them as part of the overlay lets the overlay's `items_patch.txt` (including
 * alternate-style skins) apply to them instead of being skipped as conflicting picks.
 */
export function sameSetOverlaySlots(
  overlayPicks: ReadonlyArray<{ hero: string; slot: string; id: number }>,
  resolvedPicks: ReadonlyArray<{ hero: string; slot: string; id: number }>,
  manifest: CosmeticAssetsManifest
): Set<string> {
  const result = new Set<string>()
  for (const overlayPick of overlayPicks) {
    const entry = manifest.items[String(overlayPick.id)]
    if (!entry?.patch) continue
    const sets = (getRawHeroEntry(overlayPick.hero)?.sets ?? []).filter((s) => s.items.some((it) => it.id === overlayPick.id))
    if (!sets.length) continue
    // When an Arcana/Persona base item is reused in later sets (e.g. Wraith King's Crown of the One True King
    // in King Kringle, or Drow's Dread Retribution in Sepulchral Stalker), only treat the overlay's own
    // matching bundle as same-set so the other set's wearables still get their model swaps.
    const entryName = entry.name.toLowerCase()
    const ownSets =
      sets.length > 1
        ? sets.filter((s) => {
            const setBase = s.name
              .toLowerCase()
              .replace(/\s*-\s*bundle$|\s+bundle$/, '')
              .trim()
            return entryName.includes(setBase) || setBase.includes(entryName)
          })
        : sets
    const activeSets = ownSets.length ? ownSets : sets
    const companionIds = new Set<number>(activeSets.flatMap((s) => s.items.map((it) => it.id)))
    for (const pick of resolvedPicks) {
      if (pick.hero === overlayPick.hero && pick.id !== overlayPick.id && companionIds.has(pick.id)) {
        result.add(`${pick.hero}/${pick.slot}`)
      }
    }
  }
  return result
}

/**
 * Remove `model_player` from default items whose overlay replaces the hero's root body model
 * directly without shipping an `items_patch.txt` (e.g. Io Altar Ball), preventing duplicate
 * geometry and reconnect precache mismatches.
 */
export function stripReplacedBodyWearableModel(
  content: string,
  applied: readonly AppliedPatch[],
  overlayPicks: ReadonlyArray<{ hero: string; slot: string; id: number }>,
  manifest: CosmeticAssetsManifest,
  stagedEntries: ReadonlyMap<string, VpkPackEntry>
): { content: string; targets: string[] } {
  const targetIds = new Set<string>()
  for (const pick of overlayPicks) {
    const entry = manifest.items[String(pick.id)]
    if (!entry || entry.patch) continue
    const bodyPath = `${baseModelForHero(pick.hero)}_c`.toLowerCase()
    if (!stagedEntries.has(bodyPath)) continue
    for (const patch of applied) {
      if (patch.hero === pick.hero && patch.slot === pick.slot && patch.reason === 'requested') {
        targetIds.add(patch.targetId)
      }
    }
  }
  if (!targetIds.size) return { content, targets: [] }

  const blocks = readItemsSection(content).blocks
  const eol = detectEol(content)
  const changes = new Map<string, string>()
  for (const id of targetIds) {
    const span = blocks.get(id)
    if (!span) continue
    const root = parseVdf(content.slice(span.start, span.end)).root
    if (!getString(root, 'model_player')) continue
    removeKey(root, 'model_player')
    changes.set(id, serializeValue(root, 2, eol))
  }
  if (!changes.size) return { content, targets: [] }
  return {
    content: applyItemBlocks(content, changes, { sanitize: false }).text,
    targets: [...changes.keys()]
  }
}
