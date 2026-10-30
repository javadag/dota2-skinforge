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
import { getStagingPackPath } from './appPathService'
import * as catalogService from './catalogService'
import * as cosmeticAssets from './cosmeticAssets'
import * as gameinfo from './gameinfoService'
import * as modifier from './modifier'
import * as packService from './packService'
import * as signatures from './signatureService'
import * as vpk from './vpkService'

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

  const stagingDir = getStagingPackPath()
  fs.rmSync(stagingDir, { recursive: true, force: true })
  const schemaPath = path.join(stagingDir, 'scripts', 'items', 'items_game.txt')
  fs.mkdirSync(path.dirname(schemaPath), { recursive: true })

  const dotaVpk = path.join(dotaGameDir, 'dota', 'pak01_dir.vpk')
  if (!fs.existsSync(dotaVpk)) throw new Error(`Valve schema not found at ${dotaVpk}`)

  onProgress({ step: 1, total: 5, message: 'Extracting fresh items schema from Dota 2...' })
  const extracted = await vpk.extract(dotaVpk, 'scripts/items/items_game.txt', schemaPath)
  if (typeof extracted === 'object' && 'ok' in extracted && !extracted.ok) {
    throw new Error(`Failed to extract items_game.txt: ${JSON.stringify(extracted)}`)
  }

  onProgress({ step: 2, total: 5, message: 'Resolving selections against the schema...' })
  const baseText = fs.readFileSync(schemaPath, 'utf-8')
  const schema = modifier.buildSchema(baseText)

  // The planner keys off schema names, the catalog keys off ids. Bridge them here.
  const equipped: Record<string, Record<string, string>> = {}
  const customizations: Record<string, Record<string, { style?: number }>> = {}
  const unresolved: SelectionReport['skipped'] = []
  const resolvedIds = new Set<number>()

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
    if (typeof pick.style === 'number') {
      ;(customizations[pick.hero] ??= {})[pick.slot] = { style: pick.style }
    }
  }

  if (!Object.keys(equipped).length) {
    throw new Error(
      'None of the selections could be resolved:\n' + unresolved.map((s) => `  - ${s.hero}/${s.slot}: ${s.reason}`).join('\n')
    )
  }

  onProgress({ step: 3, total: 5, message: 'Compiling selections into the schema...' })
  const compiled = modifier.compileItemsGame(baseText, equipped, customizations)
  if (!compiled.report.validation.ok) {
    throw new Error(`Generated items_game.txt failed validation:\n${compiled.report.validation.errors.join('\n')}`)
  }

  // Arcanas/personas swap the root entity model; the client needs that model at the
  // vanilla hero path as well or it renders the old body and clips on reconnect.
  onProgress({ step: 4, total: 5, message: 'Packaging arcana/persona assets...' })
  let modelOverrides = 0
  if (compiled.report.entityModelOverrides.length) {
    for (const override of compiled.report.entityModelOverrides) {
      const src = override.overrideModel.replace(/\.vmdl$/i, '') + '.vmdl_c'
      const rel = override.baseModel.replace(/\.vmdl$/i, '') + '.vmdl_c'
      const dst = path.join(stagingDir, rel.replace(/\//g, path.sep))
      fs.mkdirSync(path.dirname(dst), { recursive: true })
      try {
        const ok = await vpk.extract(dotaVpk, src, dst)
        if (typeof ok === 'object' && 'ok' in ok && ok.ok) modelOverrides++
      } catch {
        // Missing override models are non-fatal; the schema swap still applies.
      }
    }
  }

  // Cosmetic models are delivered by replacing the file the client already loads at the
  // hero's vanilla slot path, not by remapping `model_player` (see `ModelSwap` in the
  // compiler). Only the compiled `.vmdl_c` is needed: it references its materials by
  // absolute path, and Valve ships those.
  let modelSwaps = 0
  for (const swap of compiled.report.modelSwaps) {
    const src = swap.sourceModel.replace(/\.vmdl$/i, '') + '.vmdl_c'
    const rel = swap.destModel.replace(/\.vmdl$/i, '') + '.vmdl_c'
    const dst = path.join(stagingDir, rel.replace(/\//g, path.sep))
    fs.mkdirSync(path.dirname(dst), { recursive: true })
    let copied: boolean
    try {
      const ok = await vpk.extract(dotaVpk, src, dst)
      copied = typeof ok === 'object' && 'ok' in ok && Boolean(ok.ok)
    } catch {
      copied = false
    }
    if (copied) modelSwaps++
    else compiled.report.warnings.push(`${swap.hero}/${swap.slot}: "${swap.itemName}" model is not in Valve's VPK (${src})`)
  }

  // Cosmetics that items_game alone cannot produce carry a file overlay plus the pack's
  // own schema patch. The patch replaces our synthesized block so the result matches the
  // setup that is known to survive reconnects (e.g. Lina keeps the vanilla head path and
  // the file itself becomes the arcana hair).
  const overlay = cosmeticAssets.applyOverlay(resolvedIds, stagingDir)
  if (overlay.missing.length) {
    compiled.report.warnings.push(
      `Missing arcana/persona files for ${overlay.items.map((i) => i.name).join(', ')}: ` +
        overlay.missing.slice(0, 3).join(', ') +
        (overlay.missing.length > 3 ? '...' : '')
    )
  }

  let schemaContent = compiled.content
  if (overlay.patches.length) {
    schemaContent = packService.mergeItemsGame(schemaContent, overlay.patches, { sanitize: true }).text
  }
  fs.writeFileSync(schemaPath, schemaContent, 'utf-8')

  const outDir = options.outDir ?? path.join(getStagingPackPath() + '_out')
  fs.mkdirSync(outDir, { recursive: true })
  for (const name of fs.readdirSync(outDir)) {
    if (/^pak01_.*\.vpk$/i.test(name)) fs.rmSync(path.join(outDir, name), { force: true })
  }

  onProgress({ step: 5, total: 5, message: 'Packing assets into multi-chunk VPK...' })
  const dirVpk = path.join(outDir, 'pak01_dir.vpk')
  const packed = await vpk.pack(stagingDir, dirVpk)
  if (typeof packed !== 'object' || !('ok' in packed) || !packed.ok) {
    throw new Error(`VPK packing failed: ${JSON.stringify(packed)}`)
  }

  try {
    fs.rmSync(stagingDir, { recursive: true, force: true })
  } catch {
    // best effort
  }

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
    patchBlocks: compiled.report.patchedCount,
    itemsGameBytes: compiled.content.length,
    packBytes,
    referencedBranding: 0,
    merge: { applied: [], added: [], removedWatermark: 0, removedAdvert: 0 },
    report: {
      patchedCount: compiled.report.patchedCount,
      itemsTouched: compiled.report.itemsTouched,
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
