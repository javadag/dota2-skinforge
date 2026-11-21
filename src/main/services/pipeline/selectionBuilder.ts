/**
 * Dota 2 SkinForge — Cosmetic Selection Pack Builder
 *
 * Compiles user loadout selections into `items_game.txt` and packages models, overlays,
 * reconnect merges, and ability-icon overrides into a multi-chunk Source 2 VPK.
 *
 * Pipeline stages:
 *   1. Extract Valve's stock `items_game.txt` and detect patch drift.
 *   2. Resolve armory picks to schema items, styles, and overlay groups.
 *   3. Compile `items_game.txt` via `modifier.compileItemsGame` (reusing the parsed AST).
 *   4. Stage entity-model overrides, reconnect-safe model swaps, and overlay assets.
 *   5. Run ordered post-compile passes (overlay patches -> body cleanup -> reconnect merges ->
 *      empty-slot attachment routes -> particle conflicts -> overlay ability icons -> user ability icons).
 *   6. Sanity-check the final `items_game.txt` structure and pack the VPK.
 */

import fs from 'fs'
import path from 'path'
import { reconnectRequirements } from '../../../shared/armory/heroSets'
import { resolveCosmeticStyle } from '../../../shared/armory/itemStyles'
import { countAbilityIconOverrides, type HeroAbilityIconOverrides } from '../../../shared/types/abilityIcons'
import { getStagingPackPath } from '../app/appPaths'
import * as armoryService from '../assets/armoryService'
import { ensurePackagesForGroups } from '../assets/assetDeliveryService'
import { receiptFor } from '../assets/assetReceipt'
import * as cosmeticAssets from '../assets/cosmeticAssets'
import { HERO_PORTRAITS_PATH, remapHeroPortraits, type HeroPortraitRemap } from '../assets/heroPortraits'
import { checkDrift, writeBaseline } from '../dota/itemsGameBaseline'
import * as vpk from '../dota/vpkService'
import { readEntry, readVpkEntry, type VpkIndex, type VpkPackEntry } from '../dota/vpkService'
import * as modifier from '../modifier'
import { getNode, getString, isNode, materializeDeep } from '../modifier/vdf'
import { assetModifiers, flattenVisuals } from '../modifier/visuals'
import * as itemsGamePatcher from './itemsGamePatcher'
import { applyAbilityIconOverrides } from './passes/applyUserAbilityIcons'
import { applicableWearableMerges, routeWearableModelMerges } from './passes/mergeReconnectWearables'
import { sameSetOverlaySlots, stripReplacedBodyWearableModel } from './passes/overlayCleanup'
import { resolveOverlayAbilityIcons } from './passes/resolveOverlayAbilityIcons'
import { resolveOverlayParticleConflicts } from './passes/resolveOverlayParticles'
import { routeEmptySlotWearables } from './passes/routeEmptySlotAttachments'
import { assertDirVpk, type ProgressCallback } from './pipelineStatus'

export interface SelectionPick {
  hero: string
  slot: string
  item: string
  style?: number
}

export interface BuildSelectionOptions {
  dotaGameDir: string
  picks: SelectionPick[]
  abilityIcons?: HeroAbilityIconOverrides
  outDir?: string
}

export interface SelectionReport {
  /** Item blocks rewritten, plus the engine's warnings/skips. */
  patchedCount: number
  itemsTouched: number
  applied: Array<{ hero: string; slot: string; itemName: string; targetId: string; reason: string }>
  skipped: Array<{ hero: string; slot: string; itemName?: string; reason: string }>
  warnings: string[]
  /** Root models copied into the pack for arcanas/personas. */
  modelOverrides: number
  /** Cosmetic models written over a vanilla slot path (the reconnect-safe delivery). */
  modelSwaps: number
  /** Arcana/persona asset overlays that were copied in. */
  overlays: Array<{ id: string; name: string; hero: string }>
  overlayFiles: number
  overlayBytes: number
  overlayMissing: string[]
  validation?: { ok: boolean; errors: string[] }
}

export interface PackedVpkResult {
  outDir: string
  dirVpk: string
  chunkVpk: string
  files: number
  bytes: number
  patchBlocks: number
  itemsGameBytes: number
  packBytes: number
}

export interface BuildSelectionResult extends PackedVpkResult {
  report: SelectionReport
}

interface ResolvedPick {
  hero: string
  slot: string
  id: number
}

function resolveUserPicks(
  picks: SelectionPick[],
  schema: modifier.SchemaIndex,
  manifest: cosmeticAssets.CosmeticAssetsManifest,
  personaSlotsOnlyIds: Set<number>
) {
  const equipped: Record<string, Record<string, string>> = {}
  const customizations: Record<string, Record<string, { style?: number }>> = {}
  const unresolved: SelectionReport['skipped'] = []
  const resolvedIds = new Set<number>()
  const itemStylesMap = new Map<number, number>()
  const overlayPicks: ResolvedPick[] = []
  const resolvedPickEntries: ResolvedPick[] = []

  for (const pick of picks) {
    const id = armoryService.resolveModId(pick.hero, pick.slot, pick.item)
    if (!id) {
      unresolved.push({ hero: pick.hero, slot: pick.slot, itemName: pick.item, reason: 'not found in the armory' })
      continue
    }
    const item = schema.items.get(String(id))
    if (!item) {
      unresolved.push({ hero: pick.hero, slot: pick.slot, itemName: pick.item, reason: `item ${id} not in the schema` })
      continue
    }
    resolvedIds.add(id)
    const canonicalHero = modifier.ownerFor(schema, pick.hero) ?? pick.hero
    resolvedPickEntries.push({ hero: canonicalHero, slot: pick.slot, id })
    ;(equipped[pick.hero] ??= {})[pick.slot] = item.name

    const resolvedStyle = resolveCosmeticStyle(pick.item, pick.style)
    ;(customizations[pick.hero] ??= {})[pick.slot] = { style: resolvedStyle }
    itemStylesMap.set(id, resolvedStyle)

    const overlay = cosmeticAssets.entryFor(id, manifest)
    if ((overlay && !overlay.resourcesOnly) || personaSlotsOnlyIds.has(id)) {
      overlayPicks.push({ hero: canonicalHero, slot: pick.slot, id })
    }
  }

  // Picking a Persona wearable can activate its selector without a separate armory pick.
  for (const [heroTag, slots] of Object.entries(equipped)) {
    const hero = modifier.ownerFor(schema, heroTag)
    if (!hero) continue
    const items = Object.values(slots).map((name) => modifier.itemByName(schema, name))
    if (items.some((item) => item?.resolvedSlot === 'persona_selector')) continue
    if (!items.some((item) => item && modifier.isPersonaSlot(item.resolvedSlot))) continue
    const selectorId = Number(modifier.personaItemFor(schema, hero)?.id)
    if (!personaSlotsOnlyIds.has(selectorId)) continue
    resolvedIds.add(selectorId)
    overlayPicks.push({ hero, slot: 'persona_selector', id: selectorId })
  }

  return { equipped, customizations, unresolved, resolvedIds, itemStylesMap, overlayPicks, resolvedPickEntries }
}

function collectOverlayPortraitRemaps(
  baseText: string,
  schema: modifier.SchemaIndex,
  overlayPicks: ResolvedPick[],
  itemStylesMap: Map<number, number>,
  manifest: cosmeticAssets.CosmeticAssetsManifest,
  stagedEntries: ReadonlyMap<string, VpkPackEntry>
): HeroPortraitRemap[] {
  const remaps: HeroPortraitRemap[] = []
  for (const pick of overlayPicks) {
    const entry = cosmeticAssets.entryFor(pick.id, manifest)
    if (!entry) continue
    const baseModel = modifier.baseModelForHero(pick.hero)
    const compiledBaseModel = `${baseModel.replace(/\.vmdl$/i, '')}.vmdl_c`.replace(/\\/g, '/').toLowerCase()
    // Only remap portraits when the overlay actually replaces the hero's root model on disk.
    if (!stagedEntries.has(compiledBaseModel)) continue

    const item = schema.items.get(String(pick.id))
    const itemNode = item?.entry.value
    if (!itemNode || typeof itemNode === 'string') continue
    materializeDeep(baseText, itemNode)
    const visuals = getNode(itemNode, 'visuals')
    if (!visuals || visuals.opaque) continue
    const flattened = flattenVisuals(schema, visuals, itemStylesMap.get(pick.id) ?? 0)
    const targetEntity = `npc_dota_hero_${pick.hero}`
    const swapMod = assetModifiers(flattened)
      .map((e) => e.value)
      .find(
        (val): val is modifier.VdfNode =>
          isNode(val) && getString(val, 'type') === 'entity_model' && getString(val, 'asset') === targetEntity
      )
    const overrideModel = swapMod ? getString(swapMod, 'modifier') : undefined
    if (overrideModel) {
      remaps.push({ baseModel, overrideModel })
    }
  }
  return remaps
}

function warnMissingAssetReceipts(
  dotaGameDir: string,
  dotaVpkIndex: VpkIndex,
  baseText: string,
  schema: modifier.SchemaIndex,
  resolvedIds: Set<number>,
  stagedEntries: ReadonlyMap<string, VpkPackEntry>,
  warnings: string[]
): void {
  try {
    const coreVpk = path.join(dotaGameDir, 'core', 'pak01_dir.vpk')
    const coreIndex = fs.existsSync(coreVpk) ? vpk.getOrLoadVpkIndex(coreVpk) : undefined
    const indexes = coreIndex ? [dotaVpkIndex, coreIndex] : [dotaVpkIndex]
    const cache = new Map<string, Buffer | null>()

    for (const id of resolvedIds) {
      const receipt = receiptFor(baseText, String(id), { indexes, cache }, schema)
      if (!receipt) continue
      const absent = receipt.missing.filter((rel) => !stagedEntries.has(rel.replace(/\\/g, '/').toLowerCase()))
      if (absent.length) {
        warnings.push(
          `${receipt.item.name}: ${absent.length} file(s) it needs are in neither the game nor this pack (` +
            absent.slice(0, 3).join(', ') +
            (absent.length > 3 ? '...' : '') +
            ')'
        )
      }
    }
  } catch {
    // Best-effort diagnostic guard rail.
  }
}

/**
 * Compile the user's slot selections and required resources into a Source 2 VPK.
 *
 * Armory IDs are converted to schema names and handed to the planner, which handles
 * explicit slot selections, persona pieces, and `force_default_item_into_slot_index_when_equipped`.
 */
export async function buildSelectionPack(
  options: BuildSelectionOptions,
  onProgress: ProgressCallback = () => {}
): Promise<BuildSelectionResult> {
  const { dotaGameDir, picks, abilityIcons = {} } = options
  const loadouts: Record<string, Record<string, string>> = {}
  for (const pick of picks) (loadouts[pick.hero] ??= {})[pick.slot] = pick.item
  const hasAbilityIcons = countAbilityIconOverrides(abilityIcons) > 0
  if (!picks.length && !hasAbilityIcons) throw new Error('No cosmetics or ability icons selected.')

  const dotaVpk = path.join(dotaGameDir, 'dota', 'pak01_dir.vpk')
  if (!fs.existsSync(dotaVpk)) throw new Error(`Valve schema not found at ${dotaVpk}`)

  onProgress({ step: 1, total: 5, message: 'Extracting fresh items schema from Dota 2...' })
  const dotaVpkIndex = vpk.getOrLoadVpkIndex(dotaVpk)
  const schemaBytes = readEntry(dotaVpkIndex, 'scripts/items/items_game.txt')
  if (!schemaBytes) {
    throw new Error(`Failed to extract items_game.txt from ${dotaVpk}`)
  }

  onProgress({ step: 2, total: 5, message: 'Resolving selections against the schema...' })
  const baseText = schemaBytes.toString('utf-8')
  const parsedDoc = modifier.parseVdf(baseText, { opaque: modifier.isOpaqueBlock })
  const schema = modifier.buildSchema(baseText, { document: parsedDoc })
  const manifest = cosmeticAssets.loadManifestFresh()
  const personaSlotsOnlyIds = new Set(manifest.personaSlotsOnlyIds ?? [])
  const drift = checkDrift(baseText)

  const { equipped, customizations, unresolved, resolvedIds, itemStylesMap, overlayPicks, resolvedPickEntries } = resolveUserPicks(
    picks,
    schema,
    manifest,
    personaSlotsOnlyIds
  )

  if (!Object.keys(equipped).length && !hasAbilityIcons) {
    throw new Error(
      'None of the selections could be resolved:\n' + unresolved.map((s) => `  - ${s.hero}/${s.slot}: ${s.reason}`).join('\n')
    )
  }

  const replacementPersonas = overlayPicks.filter((pick) => personaSlotsOnlyIds.has(pick.id))

  onProgress({ step: 3, total: 5, message: 'Compiling selections into the schema...' })
  const compiled = modifier.compileItemsGame(baseText, equipped, customizations, {
    document: parsedDoc,
    schema,
    overlayIds: overlayPicks.map((pick) => pick.id),
    personaSlotsOnlyIds
  })
  if (!compiled.report.validation.ok) {
    throw new Error(`Generated items_game.txt failed validation:\n${compiled.report.validation.errors.join('\n')}`)
  }
  const warnings = [...compiled.report.warnings]
  if (drift.note) warnings.unshift(drift.note)

  onProgress({ step: 4, total: 5, message: 'Packaging arcana/persona assets...' })

  // Prioritize wearable merges whose host slot matches a recommended reconnect carrier.
  const modelMerges = applicableWearableMerges(manifest, compiled.report.applied)
  const requiredCarriers = new Map<string, string>()
  for (const [hero, slots] of Object.entries(loadouts)) {
    const owner = modifier.ownerFor(schema, hero) ?? hero
    for (const { dependent, required } of reconnectRequirements(hero, slots)) {
      requiredCarriers.set(`${owner}/${dependent.slot}`, required.slot)
    }
  }
  modelMerges.sort((a, b) => {
    const preferred = (route: (typeof modelMerges)[number]) => requiredCarriers.get(`${route.hero}/${route.slot}`) === route.hostSlot
    return Number(preferred(b)) - Number(preferred(a))
  })

  const groups = new Set(
    [...resolvedIds].flatMap((id) => {
      const group = cosmeticAssets.entryFor(id, manifest)?.group
      return group ? [group] : []
    })
  )
  if (overlayPicks.length || groups.size) {
    await ensurePackagesForGroups(groups, (msg) => onProgress({ step: 4, total: 5, message: msg }))
  }

  const stagedEntries = new Map<string, VpkPackEntry>()
  const stageEntry = (rel: string, source: string | Buffer, force = false): boolean => {
    const key = rel.replace(/\\/g, '/').toLowerCase()
    if (!force && stagedEntries.has(key)) return false
    stagedEntries.set(key, { vpkPath: rel.replace(/\\/g, '/'), source })
    return true
  }

  let modelOverrides = 0
  for (const override of compiled.report.entityModelOverrides) {
    const src = override.overrideModel.replace(/\.vmdl$/i, '') + '.vmdl_c'
    const rel = override.baseModel.replace(/\.vmdl$/i, '') + '.vmdl_c'
    const bytes = readVpkEntry(dotaVpkIndex, src, { fallbackCompiled: true })
    if (bytes) {
      stageEntry(rel, bytes, true)
      modelOverrides++
    }
  }

  const copyModelSwap = (swap: (typeof compiled.report.modelSwaps)[number], force = false): boolean => {
    const src = swap.sourceModel.replace(/\.vmdl$/i, '') + '.vmdl_c'
    const rel = swap.destModel.replace(/\.vmdl$/i, '') + '.vmdl_c'
    const key = rel.replace(/\\/g, '/').toLowerCase()
    if (!force && stagedEntries.has(key)) return true
    const bytes = readVpkEntry(dotaVpkIndex, src, { fallbackCompiled: true })
    if (bytes) {
      stageEntry(rel, bytes, force)
      return true
    }
    return false
  }

  let modelSwaps = 0
  for (const swap of compiled.report.modelSwaps) {
    if (copyModelSwap(swap)) modelSwaps++
    else warnings.push(`${swap.hero}/${swap.slot}: "${swap.itemName}" model is not in Valve's VPK (${swap.sourceModel})`)
  }

  const overlay = cosmeticAssets.applyOverlay(resolvedIds, {
    dotaVpk,
    vpkIndex: dotaVpkIndex,
    styles: itemStylesMap,
    manifest
  })
  for (const { hero, id } of replacementPersonas) {
    const entry = manifest.items[id]
    if (!entry) throw new Error(`Missing model replacement configuration for Persona ${id}`)
    const model = `${modifier.baseModelForHero(hero)}_c`
    const required = new Set([...entry.files, ...(entry.valveCopies ?? []).map((copy) => copy.dst), entry.patch])
    const missing = overlay.missing.filter((asset) => required.has(asset))
    if (!overlay.entries.some((asset) => asset.vpkPath === model) && !missing.includes(model)) missing.unshift(model)
    if (missing.length) throw new Error(`Missing model replacement assets for ${entry.name}: ${missing.join(', ')}`)
  }
  for (const entry of overlay.entries) stageEntry(entry.vpkPath, entry.source, true)

  const portraitRemaps = [
    ...compiled.report.entityModelOverrides.map((o) => ({ baseModel: o.baseModel, overrideModel: o.overrideModel })),
    ...collectOverlayPortraitRemaps(baseText, schema, overlayPicks, itemStylesMap, manifest, stagedEntries)
  ]
  if (portraitRemaps.length) {
    const stockPortraits = readEntry(dotaVpkIndex, HERO_PORTRAITS_PATH)
    if (stockPortraits) {
      const remappedPortraits = remapHeroPortraits(stockPortraits.toString('utf8'), portraitRemaps)
      if (remappedPortraits) stageEntry(HERO_PORTRAITS_PATH, remappedPortraits, true)
    }
  }
  if (overlay.missing.length) {
    warnings.push(
      `Missing arcana/persona files for ${overlay.items.map((i) => i.name).join(', ')}: ` +
        overlay.missing.slice(0, 3).join(', ') +
        (overlay.missing.length > 3 ? '...' : '')
    )
  }

  // Slots owned by an active overlay (or its same-set companion pieces). Explicit user picks
  // on any *other* slot win over the overlay bundle, so their models are re-copied on top.
  const personaOverlayItemIds = new Set(
    overlayPicks.filter((pick) => schema.items.get(String(pick.id))?.resolvedSlot === 'persona_selector').map((pick) => String(pick.id))
  )
  const overlayOwnedSlots = new Set<string>(sameSetOverlaySlots(overlayPicks, resolvedPickEntries, manifest))
  for (const pick of overlayPicks) {
    overlayOwnedSlots.add(`${pick.hero}/${pick.slot}`)
    const item = schema.items.get(String(pick.id))
    if (item?.resolvedSlot) overlayOwnedSlots.add(`${pick.hero}/${item.resolvedSlot}`)
  }
  for (const swap of compiled.report.modelSwaps) {
    const slotKey = `${swap.hero}/${swap.slot}`
    if (!overlayOwnedSlots.has(slotKey) && !overlay.refitSlots.has(slotKey)) copyModelSwap(swap, true)
  }

  warnMissingAssetReceipts(dotaGameDir, dotaVpkIndex, baseText, schema, resolvedIds, stagedEntries, warnings)

  // Post-compile passes run in a strict order:
  // 1. Overlay schema patches (skipping slots where the user picked a non-overlay wearable)
  // 2. Strip `model_player` when an overlay replaces a hero body without a patch
  // 3. Reconnect wearable model merges (must run before empty-slot attachment routing)
  // 4. Empty-slot `additional_wearable` routing
  // 5. Overlay particle conflict resolution
  // 6. Overlay ability-icon conflict resolution
  // 7. User custom ability-icon overrides (always last so manual choices win)
  let schemaContent = compiled.content
  const overlayTargetIds = new Set(
    compiled.report.applied.filter(({ hero, slot }) => overlayOwnedSlots.has(`${hero}/${slot}`)).map(({ targetId }) => targetId)
  )
  const patchedTargetIds = new Set<string>(compiled.report.applied.map((a) => a.targetId))

  if (overlay.patches.length) {
    const fallbackOwn = new Set<string>()
    const fallbackOwnByItemId = new Map<string, Set<string>>()
    for (const pick of overlayPicks) {
      const idStr = String(pick.id)
      if (personaOverlayItemIds.has(idStr)) continue
      const itemTargets = fallbackOwnByItemId.get(idStr) ?? new Set<string>()
      for (const entry of compiled.report.applied) {
        if (entry.hero === pick.hero && entry.slot === pick.slot) {
          fallbackOwn.add(entry.targetId)
          itemTargets.add(entry.targetId)
        }
      }
      fallbackOwnByItemId.set(idStr, itemTargets)
    }
    const userPickedTargetIds = new Set<string>(
      compiled.report.applied
        .filter(
          (a) =>
            (a.reason === 'requested' || a.reason === 'model-swap') &&
            !overlayOwnedSlots.has(`${a.hero}/${a.slot}`) &&
            !overlay.refitSlots.has(`${a.hero}/${a.slot}`) &&
            a.slot !== 'persona_selector'
        )
        .map((a) => a.targetId)
    )
    const patchSpecs = overlay.patches.map((p) => ({
      text: p.text,
      onlyIds:
        p.onlyIds ??
        (p.itemId && personaOverlayItemIds.has(p.itemId)
          ? undefined
          : p.itemId
            ? (fallbackOwnByItemId.get(p.itemId) ?? fallbackOwn)
            : fallbackOwn)
    }))
    const merged = itemsGamePatcher.mergePatchList(schemaContent, patchSpecs, {
      sanitize: true,
      skipIds: userPickedTargetIds
    })
    schemaContent = merged.text
    for (const id of [...merged.stats.applied, ...merged.stats.added]) {
      overlayTargetIds.add(id)
      patchedTargetIds.add(id)
    }
  }

  const strippedWearables = stripReplacedBodyWearableModel(schemaContent, compiled.report.applied, overlayPicks, manifest, stagedEntries)
  schemaContent = strippedWearables.content
  for (const id of strippedWearables.targets) patchedTargetIds.add(id)

  const personaOverlayHeroes = new Set(
    overlayPicks.filter((pick) => schema.items.get(String(pick.id))?.resolvedSlot === 'persona_selector').map((pick) => pick.hero)
  )
  const mergedWearables = await routeWearableModelMerges({
    content: schemaContent,
    baseText,
    routes: modelMerges,
    schema,
    applied: compiled.report.applied,
    personaHeroes: personaOverlayHeroes,
    entries: stagedEntries,
    stock: dotaVpkIndex,
    warnings
  })
  const routed = routeEmptySlotWearables(
    mergedWearables.content,
    baseText,
    schema,
    compiled.report.applied,
    personaOverlayHeroes,
    stagedEntries,
    dotaVpkIndex,
    manifest
  )
  schemaContent = resolveOverlayParticleConflicts(
    routed.content,
    schema,
    compiled.report.applied,
    overlayTargetIds,
    stagedEntries,
    dotaVpkIndex,
    warnings
  )

  const preferredIcons = new Map<string, Set<string>>()
  for (const { id } of overlay.items) {
    const entry = manifest.items[id]
    if (!entry?.preferWearableAbilityIcons?.length) continue
    for (const targetId of entry.basePatchIds ?? []) {
      if (!overlayTargetIds.has(targetId)) continue
      const abilities = preferredIcons.get(targetId) ?? new Set<string>()
      for (const ability of entry.preferWearableAbilityIcons) abilities.add(ability.toLowerCase())
      preferredIcons.set(targetId, abilities)
    }
  }
  schemaContent = resolveOverlayAbilityIcons(schemaContent, schema, compiled.report.applied, overlayTargetIds, preferredIcons)

  const iconEdits = applyAbilityIconOverrides(schemaContent, schema, dotaVpkIndex, abilityIcons, warnings)
  schemaContent = iconEdits.content
  for (const id of iconEdits.targets) patchedTargetIds.add(id)

  if (!Object.keys(equipped).length && !iconEdits.targets.length) {
    throw new Error(warnings.join('\n') || 'No ability icon overrides could be applied.')
  }

  // Final structural guard: verify post-compile passes kept `items_game.txt` valid VDF.
  itemsGamePatcher.readItemsSection(schemaContent)

  modelSwaps += routed.models + mergedWearables.models
  for (const id of [...routed.targets, ...mergedWearables.targets]) patchedTargetIds.add(id)
  const totalPatchedCount = Math.max(compiled.report.patchedCount, patchedTargetIds.size)

  stageEntry('scripts/items/items_game.txt', Buffer.from(schemaContent, 'utf-8'), true)

  const ownOutDir = !options.outDir
  let outDir: string
  if (options.outDir) {
    outDir = options.outDir
    fs.mkdirSync(outDir, { recursive: true })
    for (const name of fs.readdirSync(outDir)) {
      if (/^pak01_.*\.vpk$/i.test(name)) fs.rmSync(path.join(outDir, name), { force: true })
    }
  } else {
    const stagingParent = path.dirname(getStagingPackPath())
    fs.mkdirSync(stagingParent, { recursive: true })
    outDir = fs.mkdtempSync(path.join(stagingParent, '.staging_pack_out-'))
  }

  try {
    onProgress({ step: 5, total: 5, message: 'Packing assets into multi-chunk VPK...' })
    const dirVpk = path.join(outDir, 'pak01_dir.vpk')
    const packed = vpk.packVpk(Array.from(stagedEntries.values()), dirVpk)
    if (!packed.ok) {
      throw new Error(`VPK packing failed: ${JSON.stringify(packed)}`)
    }

    writeBaseline(drift.current)

    const chunkVpk = path.join(outDir, 'pak01_000.vpk')
    assertDirVpk(dirVpk)
    const packBytes = (fs.existsSync(dirVpk) ? fs.statSync(dirVpk).size : 0) + (fs.existsSync(chunkVpk) ? fs.statSync(chunkVpk).size : 0)

    return {
      outDir,
      dirVpk,
      chunkVpk,
      files: modelOverrides + modelSwaps + overlay.copied,
      bytes: overlay.bytes,
      patchBlocks: totalPatchedCount,
      itemsGameBytes: schemaContent.length,
      packBytes,
      report: {
        patchedCount: totalPatchedCount,
        itemsTouched: totalPatchedCount,
        applied: compiled.report.applied.map((a) => ({
          hero: a.hero,
          slot: a.slot,
          itemName: a.itemName,
          targetId: a.targetId,
          reason: a.reason
        })),
        skipped: [...unresolved, ...compiled.report.skipped],
        warnings,
        modelOverrides,
        modelSwaps,
        overlays: overlay.items,
        overlayFiles: overlay.copied,
        overlayBytes: overlay.bytes,
        overlayMissing: overlay.missing,
        validation: {
          ok: compiled.report.validation.ok,
          errors: compiled.report.validation.errors
        }
      }
    }
  } catch (err) {
    if (ownOutDir) {
      try {
        fs.rmSync(outDir, { recursive: true, force: true })
      } catch {}
    }
    throw err
  }
}
