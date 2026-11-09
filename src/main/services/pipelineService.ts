/**
 * High-level mod pipeline orchestrator.
 *
 * stage (assets + merged items_game) -> pack (VPK) -> mount (gameinfo) -> sign
 * Everything that touches the game happens only after the pack was built successfully.
 */

import { execSync } from 'child_process'
import crypto from 'crypto'
import fs from 'fs'
import path from 'path'

import { APP_CONFIG } from '../../shared/constants/appConfig'
import { getStyleOptionsByName } from '../../shared/constants/itemStyles'
import { getStagingPackPath } from './appPathService'
import * as catalogService from './catalogService'
import * as cosmeticAssets from './cosmeticAssets'
import { ensurePackagesForItems } from './assetDeliveryService'
import { receiptFor } from './assetReceipt'
import { checkDrift, writeBaseline } from './itemsGameBaseline'
import * as gameinfo from './gameinfoService'
import * as modifier from './modifier'
import * as packService from './packService'
import * as signatures from './signatureService'
import * as vpk from './vpkService'
import type { VpkPackEntry } from './vpkService'
import { readEntry } from './vpkIndex'

export const MOD_FOLDER_NAME = APP_CONFIG.modFolder || 'skinforge'

export function isDotaRunning(): boolean {
  try {
    const output = execSync('tasklist /FI "IMAGENAME eq dota2.exe" /NH', { encoding: 'utf-8' })
    return output.toLowerCase().includes('dota2.exe')
  } catch {
    return false
  }
}

export function getBackupDir(dotaGameDir: string, modFolder = MOD_FOLDER_NAME): string {
  return path.join(dotaGameDir, `${modFolder}.backup`)
}

export interface PipelineStatus {
  validDotaDir: boolean
  dotaRunning: boolean
  installed: boolean
  signaturesBypassed: boolean
  gameinfoConfigured: boolean
  vpkFileExists?: boolean
}

export function checkStatus(dotaGameDir?: string | null, modFolder = MOD_FOLDER_NAME): PipelineStatus {
  if (!dotaGameDir || !fs.existsSync(dotaGameDir)) {
    return {
      validDotaDir: false,
      dotaRunning: false,
      installed: false,
      signaturesBypassed: false,
      gameinfoConfigured: false
    }
  }

  const dotaRunning = isDotaRunning()
  const vpkDir = path.join(dotaGameDir, modFolder)
  const vpkFile = path.join(vpkDir, 'pak01_dir.vpk')
  const hasVpk = fs.existsSync(vpkFile)

  const giPath = gameinfo.getGameinfoPath(dotaGameDir)
  let gameinfoConfigured = false
  if (fs.existsSync(giPath)) {
    gameinfoConfigured = fs.readFileSync(giPath, 'utf-8').includes(modFolder)
  }

  const sigPath = signatures.getSignaturesPath(dotaGameDir)
  let signaturesBypassed = false
  if (fs.existsSync(sigPath) && fs.existsSync(giPath)) {
    const sigContent = fs.readFileSync(sigPath, 'utf-8')
    const sha1 = crypto.createHash('sha1').update(fs.readFileSync(giPath)).digest('hex').toUpperCase()
    signaturesBypassed = sigContent.includes(sha1)
  }

  return {
    validDotaDir: true,
    dotaRunning,
    installed: hasVpk && gameinfoConfigured && signaturesBypassed,
    signaturesBypassed,
    gameinfoConfigured,
    vpkFileExists: hasVpk
  }
}

export interface ProgressCallbackData {
  step: number
  total: number
  message: string
}

export type ProgressCallback = (progress: ProgressCallbackData) => void

export interface BuildPackOptions {
  /** Folder of game-relative assets with per-group items_patch.txt files. */
  bundleDir: string
  /** Only stage these groups (hero folders). Omit for everything. */
  includeGroups?: string[]
  /** Where to write pak01_dir.vpk + pak01_000.vpk. Defaults to the app staging folder. */
  outDir?: string
  /** Override the bundle's own items_game.txt. */
  baseItemsGame?: string
  /** Strip the pack tool's watermark / advert text. Defaults to true. */
  sanitize?: boolean
}

export interface BuildPackResult {
  outDir: string
  dirVpk: string
  chunkVpk: string
  files: number
  bytes: number
  groups: number
  patchBlocks: number
  itemsGameBytes: number
  packBytes: number
  referencedBranding: number
  merge: packService.MergeStats
}

/** Stage a bundle and pack it, without touching the game. */
export async function buildPack(options: BuildPackOptions, onProgress: ProgressCallback = () => {}): Promise<BuildPackResult> {
  const bundle = packService.readBundle(options.bundleDir)
  if (options.includeGroups?.length) {
    const want = new Set(options.includeGroups)
    const missing = options.includeGroups.filter((name) => !bundle.groups.some((g) => g.name === name))
    if (missing.length) throw new Error(`Bundle has no group(s): ${missing.join(', ')}`)
    bundle.groups = bundle.groups.filter((g) => want.has(g.name))
  }
  const stagingDir = getStagingPackPath()

  onProgress({ step: 1, total: 3, message: `Staging ${bundle.groups.length} groups from bundle...` })
  const staged = await packService.stageBundle(
    bundle,
    stagingDir,
    { baseItemsGame: options.baseItemsGame, sanitize: options.sanitize },
    (p) => onProgress({ step: 1, total: 3, message: p.message })
  )

  const outDir = options.outDir ?? path.join(stagingDir, '..', `${MOD_FOLDER_NAME}_pack`)
  fs.mkdirSync(outDir, { recursive: true })
  for (const name of fs.readdirSync(outDir)) {
    if (/^pak01_.*\.vpk$/i.test(name)) fs.rmSync(path.join(outDir, name), { force: true })
  }

  onProgress({ step: 2, total: 3, message: 'Packing assets into multi-chunk VPK...' })
  const dirVpk = path.join(outDir, 'pak01_dir.vpk')
  const packed = await vpk.pack(stagingDir, dirVpk)
  if (typeof packed !== 'object' || !('ok' in packed) || !packed.ok) {
    throw new Error(`VPK packing failed: ${JSON.stringify(packed)}`)
  }

  try {
    fs.rmSync(stagingDir, { recursive: true, force: true })
  } catch {
    // Staging cleanup is best effort.
  }

  const chunkVpk = path.join(outDir, 'pak01_000.vpk')

  // The packer writes the tree last; a truncated dir VPK is silent otherwise.
  assertDirVpk(dirVpk)

  const packBytes = (fs.existsSync(dirVpk) ? fs.statSync(dirVpk).size : 0) + (fs.existsSync(chunkVpk) ? fs.statSync(chunkVpk).size : 0)

  onProgress({ step: 3, total: 3, message: `Packed ${staged.files} files.` })

  return {
    outDir,
    dirVpk,
    chunkVpk,
    files: staged.files,
    bytes: staged.bytes,
    groups: staged.groups,
    patchBlocks: staged.patchBlocks,
    itemsGameBytes: staged.itemsGameBytes,
    packBytes,
    referencedBranding: staged.referencedBranding,
    merge: staged.merge
  }
}

export type InstallResult =
  | { success: true; patchedCount: number; pack: BuildPackResult; report?: SelectionReport }
  | { success: false; error: string; patchedCount?: number }

export type UninstallResult = { success: true } | { success: false; error: string }

export interface InstallOptions {
  bundleDir?: string
  baseItemsGame?: string
  sanitize?: boolean
  /** Folder name inside `game/`. Defaults to the app config (`skinforge`). */
  modFolder?: string
}

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
 * Catalog ids are converted to schema names and handed to the existing planner, which
 * knows about sets, persona pieces and `force_default_item_into_slot_index_when_equipped`.
 * Assets stay in Valve's VPK; only arcana/persona root models are copied in.
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
  // Compare against the copy we kept last time, so a Dota patch that added or rewrote items
  // is reported instead of discovered later through a broken pack.
  const drift = checkDrift(baseText)

  // The planner keys off schema names, the catalog keys off ids. Bridge them here.
  const equipped: Record<string, Record<string, string>> = {}
  const customizations: Record<string, Record<string, { style?: number }>> = {}
  const unresolved: SelectionReport['skipped'] = []
  const resolvedIds = new Set<number>()
  /** Picks that bring an asset overlay, with the schema hero and slot they landed on. */
  const overlayPicks: Array<{ hero: string; slot: string; id: number }> = []

  for (const pick of picks) {
    const id = catalogService.resolveModId(pick.hero, pick.slot, pick.item)
    if (!id) {
      unresolved.push({ hero: pick.hero, slot: pick.slot, itemName: pick.item, reason: 'not found in the catalog' })
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
        const options = getStyleOptionsByName(pick.item)
        for (const opt of options) {
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
    const id = catalogService.resolveModId(pick.hero, pick.slot, pick.item)
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
    const id = catalogService.resolveModId(pick.hero, pick.slot, pick.item)
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
  // bundle's. Slots the player left alone keep the bundle's file — for an arcana/persona
  // those are its own default set pieces, which the real item brings along too.
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
  // Warnings only — a missing archive or unreadable index must never fail a build.
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

  // Only remember the item file after the pack built cleanly, so a failed build does not
  // swallow the notice about what changed.
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

function assertDirVpk(dirVpk: string): void {
  const header = Buffer.alloc(12)
  const fd = fs.openSync(dirVpk, 'r')
  try {
    fs.readSync(fd, header, 0, 12, 0)
  } finally {
    fs.closeSync(fd)
  }
  if (header.readUInt32LE(0) !== 0x55aa1234 || header.readUInt32LE(4) !== 2) {
    throw new Error(`Packed dir VPK failed its header check: ${dirVpk}`)
  }
}

/**
 * Install a built pack into the game: copy the VPK, mount the mod folder and refresh
 * the integrity signature. Requires Dota 2 to be closed.
 */
export async function installPack(
  dotaGameDir: string,
  pack: BuildPackResult,
  onProgress: ProgressCallback = () => {},
  modFolder = MOD_FOLDER_NAME
): Promise<InstallResult> {
  if (!fs.existsSync(dotaGameDir)) throw new Error('Invalid Dota 2 game directory.')
  if (isDotaRunning()) {
    throw new Error('Dota 2 is currently running. Please close Dota 2 before installing mods.')
  }

  const backupDir = getBackupDir(dotaGameDir, modFolder)
  fs.mkdirSync(backupDir, { recursive: true })

  onProgress({ step: 1, total: 3, message: 'Copying VPK into the game...' })
  const targetModDir = path.join(dotaGameDir, modFolder)
  // A previous pack may have left extra chunks behind; the game reads every pak01_*.
  fs.rmSync(targetModDir, { recursive: true, force: true })
  fs.mkdirSync(targetModDir, { recursive: true })
  const targetDirVpk = path.join(targetModDir, 'pak01_dir.vpk')
  const targetChunkVpk = path.join(targetModDir, 'pak01_000.vpk')
  fs.copyFileSync(pack.dirVpk, targetDirVpk)
  if (fs.existsSync(pack.chunkVpk)) fs.copyFileSync(pack.chunkVpk, targetChunkVpk)

  onProgress({ step: 2, total: 3, message: 'Injecting search paths into gameinfo...' })
  gameinfo.injectSearchPaths(dotaGameDir, modFolder, backupDir)

  onProgress({ step: 3, total: 3, message: 'Updating file integrity signatures (dota.signatures)...' })
  const signed = signatures.updateSignaturesForGameinfo(dotaGameDir, backupDir)
  if (!signed.success) {
    // Never leave the game mounted against an unsigned gameinfo.
    gameinfo.restoreGameinfo(dotaGameDir, backupDir)
    fs.rmSync(targetModDir, { recursive: true, force: true })
    return { success: false, error: signed.reason, patchedCount: pack.patchBlocks }
  }

  return { success: true, patchedCount: pack.patchBlocks, pack }
}

/** Build and install a bundle in one call. */
export async function installFromBundle(
  dotaGameDir: string,
  options: InstallOptions,
  onProgress: ProgressCallback = () => {}
): Promise<InstallResult> {
  if (!options.bundleDir) return { success: false, error: 'No bundle folder was given.' }
  if (isDotaRunning()) {
    return { success: false, error: 'Dota 2 is currently running. Please close Dota 2 before installing mods.' }
  }
  const pack = await buildPack(
    { bundleDir: options.bundleDir, baseItemsGame: options.baseItemsGame, sanitize: options.sanitize },
    onProgress
  )
  return installPack(dotaGameDir, pack, onProgress, options.modFolder)
}

/**
 * Catalog-driven install. The item-override generator is the next piece of the
 * pipeline; until it lands, installs must name a bundle folder.
 */
export async function installMods(
  dotaGameDir?: string | null,
  equipped: Record<string, Record<string, string>> = {},
  customizationsOrProgress: unknown = {},
  onProgress: ProgressCallback = () => {},
  options: InstallOptions = {}
): Promise<InstallResult> {
  if (!dotaGameDir || !fs.existsSync(dotaGameDir)) {
    throw new Error('Invalid Dota 2 game directory.')
  }
  if (options.bundleDir) {
    return installFromBundle(dotaGameDir, options, onProgress)
  }

  const customizations = (customizationsOrProgress ?? {}) as Record<string, Record<string, { style?: number }>>
  const picks: SelectionPick[] = []
  for (const [hero, slots] of Object.entries(equipped)) {
    for (const [slot, item] of Object.entries(slots || {})) {
      if (!item) continue
      picks.push({ hero, slot, item, style: customizations?.[hero]?.[slot]?.style })
    }
  }
  if (!picks.length) return { success: false, error: 'No cosmetics selected.' }

  const pack = await buildSelectionPack({ dotaGameDir, picks }, onProgress)
  const result = await installPack(dotaGameDir, pack, onProgress, options.modFolder)
  return result.success ? { ...result, report: pack.report } : result
}

export async function uninstallMods(
  dotaGameDir?: string | null,
  onProgress: ProgressCallback = () => {},
  modFolder = MOD_FOLDER_NAME
): Promise<UninstallResult> {
  if (!dotaGameDir || !fs.existsSync(dotaGameDir)) {
    throw new Error('Invalid Dota 2 game directory.')
  }
  if (isDotaRunning()) {
    throw new Error('Dota 2 is currently running. Please close Dota 2 before uninstalling mods.')
  }

  const backupDir = getBackupDir(dotaGameDir, modFolder)

  onProgress({ step: 1, total: 3, message: 'Restoring gameinfo search paths...' })
  gameinfo.restoreGameinfo(dotaGameDir, backupDir)

  onProgress({ step: 2, total: 3, message: 'Restoring signature verification...' })
  signatures.restoreSignatures(dotaGameDir, backupDir)

  onProgress({ step: 3, total: 3, message: 'Removing mod VPK folder...' })
  const targetModDir = path.join(dotaGameDir, modFolder)
  if (fs.existsSync(targetModDir)) fs.rmSync(targetModDir, { recursive: true, force: true })

  return { success: true }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    checkStatus,
    installMods,
    installFromBundle,
    buildSelectionPack,
    buildPack,
    installPack,
    getBackupDir,
    uninstallMods,
    isDotaRunning,
    MOD_FOLDER_NAME
  }
}
