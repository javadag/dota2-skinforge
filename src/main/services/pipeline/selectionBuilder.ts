/**
 * Dota 2 SkinForge — Cosmetic Selection Pack Builder
 * Compiles user loadout selections into items_game.txt and packages root models/overlays into VPK.
 */

import fs from 'fs'
import path from 'path'
import { getStyleOptionsByName } from '../../../shared/constants/itemStyles'
import { getStagingPackPath } from '../appPathService'
import { ensurePackagesForItems } from '../assetDeliveryService'
import { receiptFor } from '../assetReceipt'
import * as armoryService from '../armoryService'
import * as cosmeticAssets from '../cosmeticAssets'
import { checkDrift, writeBaseline } from '../itemsGameBaseline'
import * as modifier from '../modifier'
import * as packService from '../packService'
import { readEntry } from '../vpkIndex'
import * as vpk from '../vpkService'
import type { VpkPackEntry } from '../vpkService'
import type { BuildPackResult } from './bundleBuilder'
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

export interface BuildSelectionResult extends BuildPackResult {
  report: SelectionReport
}

/**
 * Compile the user's slot selections into an items_game-only pack.
 *
 * Armory ids are converted to schema names and handed to the planner, which
 * knows about sets, persona pieces and `force_default_item_into_slot_index_when_equipped`.
 * Assets stay in Valve's VPK; only arcana/persona root models and overlays are copied in.
 */
export async function buildSelectionPack(
  options: BuildSelectionOptions,
  onProgress: ProgressCallback = () => {}
): Promise<BuildSelectionResult> {
  const { dotaGameDir, picks } = options
  if (!picks.length) throw new Error('No cosmetics selected.')

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
  const schema = modifier.buildSchema(baseText)
  // Compare against the baseline copy to detect Dota patches
  const drift = checkDrift(baseText)

  // The planner keys off schema names, the armory keys off ids. Bridge them here.
  const equipped: Record<string, Record<string, string>> = {}
  const customizations: Record<string, Record<string, { style?: number }>> = {}
  const unresolved: SelectionReport['skipped'] = []
  const resolvedIds = new Set<number>()
  /** Picks that bring an asset overlay, with the schema hero and slot they landed on. */
  const overlayPicks: Array<{ hero: string; slot: string; id: number }> = []

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
    ;(equipped[pick.hero] ??= {})[pick.slot] = item.name

    let styleIndex: number | undefined = typeof pick.style === 'number' ? pick.style : undefined
    if (styleIndex === undefined) {
      const match = pick.item.match(/style\s*(\d+)/i)
      if (match) {
        styleIndex = Math.max(0, parseInt(match[1], 10) - 1)
      } else {
        const optionsList = getStyleOptionsByName(pick.item)
        for (const opt of optionsList) {
          if (opt.index > 0 && pick.item.toLowerCase().endsWith(opt.name.toLowerCase())) {
            styleIndex = opt.index
            break
          }
        }
      }
    }
    if (typeof styleIndex === 'number') {
      ;(customizations[pick.hero] ??= {})[pick.slot] = { style: styleIndex }
    }
    if (cosmeticAssets.entryFor(id)) {
      overlayPicks.push({ hero: modifier.ownerFor(schema, pick.hero) ?? pick.hero, slot: pick.slot, id })
    }
  }

  if (!Object.keys(equipped).length) {
    throw new Error(
      'None of the selections could be resolved:\n' + unresolved.map((s) => `  - ${s.hero}/${s.slot}: ${s.reason}`).join('\n')
    )
  }

  onProgress({ step: 3, total: 5, message: 'Compiling selections into the schema...' })
  const compiled = modifier.compileItemsGame(baseText, equipped, customizations, {
    // Arcanas with an asset overlay carry their body as a file; only the schema-only ones
    // need the body swap mirrored onto wearable slots.
    overlayIds: [...resolvedIds].filter((id) => cosmeticAssets.entryFor(id))
  })
  if (!compiled.report.validation.ok) {
    throw new Error(`Generated items_game.txt failed validation:\n${compiled.report.validation.errors.join('\n')}`)
  }
  if (drift.note) compiled.report.warnings.unshift(drift.note)

  // Arcanas/personas swap the root entity model; the client needs that model at the
  // vanilla hero path as well or it renders the old body and clips on reconnect.
  onProgress({ step: 4, total: 5, message: 'Packaging arcana/persona assets...' })

  // Ensure any necessary cosmetic asset packages are present locally or downloaded from Cloudflare R2
  const manifest = cosmeticAssets.loadManifest()
  await ensurePackagesForItems(resolvedIds, manifest.items, (msg) => {
    onProgress({ step: 4, total: 5, message: msg })
  })

  const stagedEntries = new Map<string, VpkPackEntry>()
  const stageEntry = (rel: string, source: string | Buffer, force = false): boolean => {
    const key = rel.replace(/\\/g, '/').toLowerCase()
    if (!force && stagedEntries.has(key)) return false
    stagedEntries.set(key, { vpkPath: rel.replace(/\\/g, '/'), source })
    return true
  }

  let modelOverrides = 0
  if (compiled.report.entityModelOverrides.length) {
    for (const override of compiled.report.entityModelOverrides) {
      const src = override.overrideModel.replace(/\.vmdl$/i, '') + '.vmdl_c'
      const rel = override.baseModel.replace(/\.vmdl$/i, '') + '.vmdl_c'
      const cleanSrc = src.replace(/\\/g, '/')
      const bytes = readEntry(dotaVpkIndex, cleanSrc) ?? (cleanSrc.endsWith('_c') ? null : readEntry(dotaVpkIndex, `${cleanSrc}_c`))
      if (bytes) {
        stageEntry(rel, bytes, true)
        modelOverrides++
      }
    }
  }

  // Cosmetic models are delivered by replacing the file the client already loads at the
  // hero's vanilla slot path, not by remapping `model_player` (see `ModelSwap` in the
  // compiler). Only the compiled `.vmdl_c` is needed: it references its materials by
  // absolute path, and Valve ships those.
  const copyModelSwap = (swap: (typeof compiled.report.modelSwaps)[number], force = false): boolean => {
    const src = swap.sourceModel.replace(/\.vmdl$/i, '') + '.vmdl_c'
    const rel = swap.destModel.replace(/\.vmdl$/i, '') + '.vmdl_c'
    const key = rel.replace(/\\/g, '/').toLowerCase()
    if (!force && stagedEntries.has(key)) {
      // Custom compiled model or overlay asset already staged for this path.
      // Do not overwrite it with the vanilla asset unless forced by explicit pick.
      return true
    }
    const cleanSrc = src.replace(/\\/g, '/')
    const bytes = readEntry(dotaVpkIndex, cleanSrc) ?? (cleanSrc.endsWith('_c') ? null : readEntry(dotaVpkIndex, `${cleanSrc}_c`))
    if (bytes) {
      stageEntry(rel, bytes, force)
      return true
    }
    return false
  }

  let modelSwaps = 0
  for (const swap of compiled.report.modelSwaps) {
    if (copyModelSwap(swap)) modelSwaps++
    else compiled.report.warnings.push(`${swap.hero}/${swap.slot}: "${swap.itemName}" model is not in Valve's VPK (${swap.sourceModel})`)
  }

  // Ensure all equipped cosmetic models (including additional_wearable / anchored models) exist in the pack VPK
  for (const pick of picks) {
    const id = armoryService.resolveModId(pick.hero, pick.slot, pick.item)
    if (!id) continue
    const item = schema.items.get(String(id))
    if (!item?.model) continue
    const modelRel = item.model.replace(/\.vmdl$/i, '') + '.vmdl_c'
    const key = modelRel.replace(/\\/g, '/').toLowerCase()
    if (!stagedEntries.has(key)) {
      const cleanSrc = modelRel.replace(/\\/g, '/')
      const bytes = readEntry(dotaVpkIndex, cleanSrc) ?? (cleanSrc.endsWith('_c') ? null : readEntry(dotaVpkIndex, `${cleanSrc}_c`))
      if (bytes) stageEntry(modelRel, bytes)
    }
  }

  // Cosmetics that items_game alone cannot produce carry a file overlay plus the pack's
  // own schema patch. The patch replaces our synthesized block so the result matches the
  // setup that is known to survive reconnects (e.g. Lina keeps the vanilla head path and
  // the file itself becomes the arcana hair).
  const itemStylesMap = new Map<number, number>()
  for (const pick of picks) {
    const id = armoryService.resolveModId(pick.hero, pick.slot, pick.item)
    if (!id) continue
    const st = customizations[pick.hero]?.[pick.slot]?.style
    if (typeof st === 'number') itemStylesMap.set(id, st)
  }
  const overlay = cosmeticAssets.applyOverlay(resolvedIds, '', {
    dotaVpk,
    vpkIndex: dotaVpkIndex,
    styles: itemStylesMap,
    virtual: true
  })
  for (const entry of overlay.entries) {
    stageEntry(entry.vpkPath, entry.source, true)
  }
  if (overlay.missing.length) {
    compiled.report.warnings.push(
      `Missing arcana/persona files for ${overlay.items.map((i) => i.name).join(', ')}: ` +
        overlay.missing.slice(0, 3).join(', ') +
        (overlay.missing.length > 3 ? '...' : '')
    )
  }

  // A bundle ships one model for every slot it was built for, so it can out-vote an
  // explicit pick on that same slot. The pick wins: its model is copied again over the
  // bundle's. Slots the player left alone keep the bundle's file.
  const personaOverlay = overlayPicks.some((pick) => schema.items.get(String(pick.id))?.resolvedSlot === 'persona_selector')
  const pickedSlots = new Set<string>()
  for (const pick of overlayPicks) {
    pickedSlots.add(`${pick.hero}/${pick.slot}`)
    const item = schema.items.get(String(pick.id))
    if (item?.resolvedSlot) pickedSlots.add(`${pick.hero}/${item.resolvedSlot}`)
  }
  for (const swap of compiled.report.modelSwaps) {
    const slotKey = `${swap.hero}/${swap.slot}`
    if (!pickedSlots.has(slotKey) && !overlay.refitSlots.has(slotKey)) copyModelSwap(swap, true)
  }

  // Guard rail: every file the picked items need has to exist in the game or in this pack.
  try {
    const coreVpk = path.join(dotaGameDir, 'core', 'pak01_dir.vpk')
    const coreIndex = fs.existsSync(coreVpk) ? vpk.getOrLoadVpkIndex(coreVpk) : undefined
    const indexes = [dotaVpkIndex]
    if (coreIndex) indexes.push(coreIndex)

    const cache = new Map<string, Buffer | null>()
    for (const id of resolvedIds) {
      const receipt = receiptFor(baseText, String(id), { indexes, cache }, schema)
      if (!receipt) continue
      const absent = receipt.missing.filter((rel) => !stagedEntries.has(rel.replace(/\\/g, '/').toLowerCase()))
      if (absent.length) {
        compiled.report.warnings.push(
          `${receipt.item.name}: ${absent.length} file(s) it needs are in neither the game nor this pack (` +
            absent.slice(0, 3).join(', ') +
            (absent.length > 3 ? '...' : '') +
            ')'
        )
      }
    }
  } catch {
    // best effort
  }

  let schemaContent = compiled.content
  const patchedTargetIds = new Set<string>(compiled.report.applied.map((a) => a.targetId))
  if (overlay.patches.length) {
    const fallbackOwn = new Set<string>()
    if (!personaOverlay) {
      for (const pick of overlayPicks) {
        for (const entry of compiled.report.applied) {
          if (entry.hero === pick.hero && entry.slot === pick.slot) fallbackOwn.add(entry.targetId)
        }
      }
    }
    const userPickedTargetIds = new Set<string>(
      compiled.report.applied
        .filter(
          (a) =>
            (a.reason === 'requested' || a.reason === 'model-swap') &&
            !pickedSlots.has(`${a.hero}/${a.slot}`) &&
            !overlay.refitSlots.has(`${a.hero}/${a.slot}`) &&
            a.slot !== 'persona_selector'
        )
        .map((a) => a.targetId)
    )
    const patchSpecs = overlay.patches.map((p) => ({
      text: p.text,
      onlyIds: p.onlyIds ?? (personaOverlay ? undefined : fallbackOwn)
    }))
    const merged = packService.mergePatchList(schemaContent, patchSpecs, {
      sanitize: true,
      skipIds: userPickedTargetIds
    })
    schemaContent = merged.text
    for (const id of merged.stats.applied) patchedTargetIds.add(id)
  }
  const totalPatchedCount = Math.max(compiled.report.patchedCount, patchedTargetIds.size)

  // Stage compiled schema text buffer
  stageEntry('scripts/items/items_game.txt', Buffer.from(schemaContent, 'utf-8'), true)

  const outDir = options.outDir ?? path.join(getStagingPackPath() + '_out')
  fs.mkdirSync(outDir, { recursive: true })
  for (const name of fs.readdirSync(outDir)) {
    if (/^pak01_.*\.vpk$/i.test(name)) fs.rmSync(path.join(outDir, name), { force: true })
  }

  onProgress({ step: 5, total: 5, message: 'Packing assets into multi-chunk VPK...' })
  const dirVpk = path.join(outDir, 'pak01_dir.vpk')
  const packed = await vpk.pack(Array.from(stagedEntries.values()), dirVpk)
  if (typeof packed !== 'object' || !('ok' in packed) || !packed.ok) {
    throw new Error(`VPK packing failed: ${JSON.stringify(packed)}`)
  }

  // Only remember the item file after the pack built cleanly
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
    groups: 0,
    patchBlocks: totalPatchedCount,
    itemsGameBytes: schemaContent.length,
    packBytes,
    referencedBranding: 0,
    merge: { applied: [], added: [], removedWatermark: 0, removedAdvert: 0 },
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
      warnings: compiled.report.warnings,
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
}
