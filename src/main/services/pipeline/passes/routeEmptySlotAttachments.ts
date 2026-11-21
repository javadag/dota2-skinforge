/**
 * Reconnect-safe routing for cosmetics equipped in model-less default slots.
 *
 * When a hero's default slot has no `model_player`, assigning a new model directly to that
 * slot renders on first spawn but disappears on match reconnect. For supported routes in
 * `data/cosmetic-assets.json` (`emptySlotRoutes`), this pass stages the selected wearable at
 * another slot's existing `additional_wearable` attachment path (or swaps primary/attachment
 * when `particle_create` must bind to the host's primary entity).
 */

import { loadManifest, type CosmeticAssetsManifest } from '../../assets/cosmeticAssets'
import { readEntry, type VpkIndex, type VpkPackEntry } from '../../dota/vpkService'
import type { AppliedPatch } from '../../modifier/compile'
import { defaultFor, type SchemaIndex } from '../../modifier/schema'
import {
  detectEol,
  getNode,
  getString,
  isNode,
  parseVdf,
  removeEntries,
  removeKey,
  serializeValue,
  setEntry,
  type VdfNode
} from '../../modifier/vdf'
import { assetModifiers, mergeAssetModifiers } from '../../modifier/visuals'
import { applyItemBlocks, readItemsSection } from '../itemsGamePatcher'

function findAdditionalWearable(visuals: VdfNode | undefined, model: string): VdfNode | undefined {
  return assetModifiers(visuals)
    .map((entry) => entry.value)
    .find(
      (value): value is VdfNode =>
        isNode(value) && getString(value, 'type') === 'additional_wearable' && getString(value, 'asset') === model
    )
}

export function routeEmptySlotWearables(
  content: string,
  baseText: string,
  schema: SchemaIndex,
  applied: AppliedPatch[],
  personaHeroes: ReadonlySet<string>,
  entries: Map<string, VpkPackEntry>,
  stock: VpkIndex,
  manifest: CosmeticAssetsManifest = loadManifest()
): { content: string; targets: string[]; models: number } {
  const candidates = applied.filter(
    (pick) => pick.reason === 'requested' && !personaHeroes.has(pick.hero) && !defaultFor(schema, pick.hero, pick.slot)?.model
  )
  if (!candidates.length) return { content, targets: [], models: 0 }

  const routes = manifest.emptySlotRoutes ?? {}
  const blocks = readItemsSection(content).blocks
  const eol = detectEol(content)
  const changes = new Map<string, string>()
  let models = 0
  function readBlock(id: string) {
    const span = blocks.get(id)
    const text = changes.get(id) ?? (span && content.slice(span.start, span.end))
    return text ? parseVdf(text).root : undefined
  }

  for (const pick of candidates) {
    const item = readBlock(pick.targetId)
    const model = getString(item, 'model_player')
    if (!item || !model || !/\.vmdl$/i.test(model)) continue

    const key = `${pick.hero}/${pick.slot}`
    const route = Object.prototype.hasOwnProperty.call(routes, key) ? routes[key] : undefined
    const hostDefault = route && defaultFor(schema, pick.hero, route.hostSlot)
    const host = hostDefault && readBlock(hostDefault.id)
    const target = route && `${route.model.toLowerCase()}_c`
    const source = `${model.toLowerCase()}_c`
    if (
      !route ||
      !hostDefault?.model ||
      !host ||
      getString(host, 'model_player') !== hostDefault.model ||
      !target ||
      entries.has(target) ||
      !stock.entries.has(target)
    ) {
      continue
    }

    const donor = entries.get(source)?.source ?? readEntry(stock, source)
    const stockHost = parseVdf(baseText.slice(hostDefault.entry.valueStart, hostDefault.entry.valueEnd)).root
    const stockAnchor = findAdditionalWearable(getNode(stockHost, 'visuals'), route.model)
    if (!donor || !stockAnchor) {
      continue
    }

    // A selected belt can replace its visuals block. Restore the stock attachment
    // without taking over the belt's model or dropping its own modifiers.
    let anchor = findAdditionalWearable(getNode(host, 'visuals'), route.model)
    if (!anchor) {
      mergeAssetModifiers(host, [stockAnchor])
      anchor = findAdditionalWearable(getNode(host, 'visuals'), route.model)
    }
    const hostVisuals = getNode(host, 'visuals')
    if (!hostVisuals || !anchor) {
      continue
    }

    const visuals = getNode(item, 'visuals')
    const hasParticleCreate = assetModifiers(visuals).some(
      (entry) => isNode(entry.value) && getString(entry.value, 'type') === 'particle_create'
    )
    const hostTarget = `${hostDefault.model.toLowerCase()}_c`
    const hostModelSource = hasParticleCreate ? (entries.get(hostTarget)?.source ?? readEntry(stock, hostTarget)) : undefined
    const swapToPrimary = Boolean(hasParticleCreate && hostModelSource)

    if (swapToPrimary) {
      // `particle_create` attaches `self` to the host's primary `model_player`
      // entity, not its `additional_wearable`. Snapshot-skinned particles like
      // Mantle of the Cinder Baron must sit on the primary model to follow its
      // cloth bones, so put the misc model on `hostTarget` and the belt on `target`.
      const hostSkin = getString(hostVisuals, 'skin')
      if (hostSkin !== undefined) {
        setEntry(anchor, 'skin', hostSkin)
        removeKey(hostVisuals, 'skin')
      }
      for (const entry of assetModifiers(hostVisuals)) {
        if (!isNode(entry.value) || getString(entry.value, 'type') !== 'model_skin') continue
        const skin = getString(entry.value, 'skin')
        if (skin !== undefined && hostSkin === undefined) setEntry(anchor, 'skin', skin)
        removeEntries(hostVisuals, (candidate) => candidate === entry)
      }
    }

    const itemSkin = visuals ? getString(visuals, 'skin') : undefined
    if (itemSkin !== undefined && visuals) {
      setEntry(swapToPrimary ? hostVisuals : anchor, 'skin', itemSkin)
      removeKey(visuals, 'skin')
    }

    for (const entry of assetModifiers(visuals)) {
      if (!isNode(entry.value)) continue
      switch (getString(entry.value, 'type')) {
        case 'model_skin': {
          const skin = getString(entry.value, 'skin')
          if (swapToPrimary) {
            if (skin !== undefined) setEntry(hostVisuals, 'skin', skin)
            mergeAssetModifiers(host, [entry.value])
          } else if (skin !== undefined) {
            setEntry(anchor, 'skin', skin)
          }
          break
        }
        case 'particle_create':
          mergeAssetModifiers(host, [entry.value])
          break
        default:
          continue
      }
      if (visuals) removeEntries(visuals, (candidate) => candidate === entry)
    }
    if (visuals) removeKey(visuals, 'skip_model_combine')
    setEntry(hostVisuals, 'skip_model_combine', '1')
    removeKey(item, 'model_player')
    changes.set(pick.targetId, serializeValue(item, 2, eol))
    changes.set(hostDefault.id, serializeValue(host, 2, eol))
    if (swapToPrimary && hostModelSource) {
      entries.set(hostTarget, { vpkPath: hostTarget, source: donor })
      entries.set(target, { vpkPath: target, source: hostModelSource })
    } else {
      entries.set(target, { vpkPath: target, source: donor })
    }
    models++
  }

  const text = changes.size ? applyItemBlocks(content, changes, { sanitize: false }).text : content
  return { content: text, targets: [...changes.keys()], models }
}
