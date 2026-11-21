/**
 * Reconnect-safe `.vmdl_c` wearable model merging.
 *
 * Why this exists:
 * When a hero's default item slot has no `model_player` (e.g. Legion Commander legs,
 * Ancient Apparition head/arms), the Dota server never spawns a wearable entity for it.
 * Assigning a model in `items_game.txt` renders on first spawn, then vanishes or turns
 * into an ERROR placeholder on match reconnect.
 *
 * How this solves it:
 * For supported rules in `data/cosmetic-assets.json` (`reconnectRules`), we merge the
 * empty-slot cosmetic's mesh into a model the client already loads (either another
 * equipped wearable or the hero's root body) on the fly at Apply time using the bundled
 * `wearable-merger.exe`. If a merge fails or the tool is unavailable, we leave the item
 * unmerged and record a warning so the user is notified.
 */

import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import { wearableMergeRules, type WearableModelMerge } from '../../../../shared/utils/reconnectRules'
import { getAppRoot } from '../../app/appPaths'
import type { CosmeticAssetsManifest } from '../../assets/cosmeticAssets'
import { readEntry, type VpkIndex, type VpkPackEntry } from '../../dota/vpkService'
import type { AppliedPatch } from '../../modifier/compile'
import { defaultFor, type SchemaIndex } from '../../modifier/schema'
import { detectEol, getNode, getString, isNode, parseVdf, removeKey, serializeValue, setEntry } from '../../modifier/vdf'
import { assetModifiers, flattenVisuals, mergeAssetModifiers } from '../../modifier/visuals'
import { applyItemBlocks, readItemsSection } from '../itemsGamePatcher'

const runExecFile = promisify(execFile)

type Block = { type: string; bytes: Buffer }

const sha256Hex = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex')

/** Locate the native Windows `wearable-merger.exe` helper (packaged or local build cache). */
function getWearableMerger(): string | undefined {
  if (process.platform !== 'win32' || process.arch !== 'x64') return undefined
  if (process.resourcesPath) {
    const bundled = path.join(process.resourcesPath, 'tools', 'wearable-merger.exe')
    if (fs.existsSync(bundled)) return bundled
  }
  const tool = path.join(getAppRoot(), '.cache', 'wearable-merger', 'wearable-merger.exe')
  return fs.existsSync(tool) ? tool : undefined
}

async function mergeWearableOnApply(
  tool: string,
  host: Buffer,
  guest: Buffer,
  checkWeightedBind: boolean | 'near' = false,
  guestMeshGroup?: string
): Promise<Buffer> {
  const dir = await fs.promises.mkdtemp(path.join(tmpdir(), 'skinforge-wearable-'))
  const hostPath = path.join(dir, 'host.vmdl_c')
  const guestPath = path.join(dir, 'guest.vmdl_c')
  const outputPath = path.join(dir, 'merged.vmdl_c')
  try {
    await fs.promises.writeFile(hostPath, host)
    await fs.promises.writeFile(guestPath, guest)
    const args = [hostPath, guestPath, outputPath]
    if (checkWeightedBind) args.push(checkWeightedBind === 'near' ? '--check-near-bind' : '--check-weighted-bind')
    if (guestMeshGroup) args.push('--guest-mesh-group', guestMeshGroup)
    await runExecFile(tool, args, { windowsHide: true, timeout: 20000 })
    return await fs.promises.readFile(outputPath)
  } finally {
    await Promise.allSettled([hostPath, guestPath, outputPath].map((file) => fs.promises.unlink(file)))
    await fs.promises.rmdir(dir).catch(() => {})
  }
}

function mergeErrorReason(err: unknown): string {
  const stderr = err && typeof err === 'object' && 'stderr' in err ? String((err as { stderr?: unknown }).stderr ?? '').trim() : ''
  return stderr || (err instanceof Error ? err.message : String(err))
}

async function runMerge(
  tool: string,
  hostBytes: Buffer,
  guestBytes: Buffer,
  extraBytes: Buffer | null | undefined,
  checkWeightedBind: boolean | 'near',
  guestMeshGroup?: string
): Promise<Buffer> {
  let model = await mergeWearableOnApply(tool, hostBytes, guestBytes, checkWeightedBind, guestMeshGroup)
  if (extraBytes) model = await mergeWearableOnApply(tool, model, extraBytes, checkWeightedBind)
  if (!resourceBlocks(model).length) throw new Error('Empty generated model')
  return model
}

/** Parse Valve Resource v12 block directory (16-byte header + 12-byte entries). */
function resourceBlocks(data: Buffer): Block[] {
  if (data.length < 16) throw new Error('Invalid standalone model resource')
  const directory = data.readUInt32LE(8) + 8
  const count = data.readUInt32LE(12)
  if (directory + count * 12 > data.length || data.readUInt32LE(0) !== data.length) {
    throw new Error('Invalid standalone model resource')
  }
  return Array.from({ length: count }, (_, index) => {
    const position = directory + index * 12
    const start = position + 4 + data.readUInt32LE(position + 4)
    const end = start + data.readUInt32LE(position + 8)
    if (start < directory + count * 12 || end > data.length) throw new Error('Invalid model resource block')
    return { type: data.toString('ascii', position, position + 4), bytes: data.subarray(start, end) }
  })
}

export function applicableWearableMerges(manifest: CosmeticAssetsManifest, applied: AppliedPatch[]) {
  return wearableMergeRules(manifest.reconnectRules ?? []).filter((route) =>
    applied.some(
      (pick) =>
        pick.hero === route.hero &&
        pick.slot === route.slot &&
        pick.reason === 'requested' &&
        (route.guestStyle === undefined || pick.style === route.guestStyle)
    )
  )
}

interface MergeOptions {
  content: string
  baseText: string
  routes: WearableModelMerge[]
  schema: SchemaIndex
  applied: AppliedPatch[]
  personaHeroes: ReadonlySet<string>
  entries: Map<string, VpkPackEntry>
  stock: VpkIndex
  warnings?: string[]
}

export async function routeWearableModelMerges(options: MergeOptions): Promise<{ content: string; targets: string[]; models: number }> {
  const { baseText, routes, schema, applied, personaHeroes, entries, stock, warnings } = options
  let { content } = options
  const targets: string[] = []
  const tool = getWearableMerger()
  const generatedBodies = new Map<string, Buffer>()
  const attemptCache = new Map<string, Buffer | string>()
  const mergedPicks = new Set<string>()
  const failedPicks = new Map<string, { hero: string; slot: string; itemName: string; hostLabel: string; reason: string }>()
  let spans: ReturnType<typeof readItemsSection>['blocks'] | undefined
  let models = 0

  const readModel = (file: string) => {
    const source = entries.get(file)?.source
    return typeof source === 'string' ? fs.readFileSync(source) : (source ?? readEntry(stock, file))
  }

  for (const route of routes) {
    if (personaHeroes.has(route.hero)) continue
    const pick = applied.find((p) => p.hero === route.hero && p.slot === route.slot && p.reason === 'requested')
    if (!pick || (route.guestStyle !== undefined && pick.style !== route.guestStyle)) continue
    const hostDefault = route.hostSlot ? defaultFor(schema, route.hero, route.hostSlot) : undefined
    const hostModel = route.hostModel ?? hostDefault?.model
    const guestDefault = defaultFor(schema, route.hero, route.slot)
    if (!hostModel || guestDefault?.model || pick.targetId === hostDefault?.id) continue
    const selected = schema.byName.get(pick.itemName)
    if (!selected) continue
    spans ??= readItemsSection(content).blocks
    const hostSpan = hostDefault && spans.get(hostDefault.id)
    const guestSpan = spans.get(pick.targetId)
    if ((!route.hostModel && !hostSpan) || !guestSpan) continue

    const host = hostSpan ? parseVdf(content.slice(hostSpan.start, hostSpan.end)).root : undefined
    const guest = parseVdf(content.slice(guestSpan.start, guestSpan.end)).root
    const guestModel = getString(guest, 'model_player')
    if ((host && getString(host, 'model_player') !== hostModel) || !guestModel?.endsWith('.vmdl')) continue

    const hostPath = `${hostModel.toLowerCase()}_c`
    const guestPath = `${guestModel.toLowerCase()}_c`
    const guestVisuals = getNode(guest, 'visuals')
    const guestModifiers = assetModifiers(guestVisuals)
    const selectedItem = parseVdf(baseText.slice(selected.entry.valueStart, selected.entry.valueEnd)).root
    const selectedVisuals = getNode(selectedItem, 'visuals')
    const stockVisuals = selectedVisuals && flattenVisuals(schema, selectedVisuals, pick.style)
    const stockModifiers = assetModifiers(stockVisuals)

    // Verify skin compatibility: merged geometry bakes materials, so unexpected skin modifiers must opt out.
    const isSkin = (entry: (typeof stockModifiers)[number]) => isNode(entry.value) && getString(entry.value, 'type') === 'model_skin'
    const stockSkins = stockModifiers.filter(isSkin)
    const guestSkins = new Set(guestModifiers.filter(isSkin))
    const stockSkin = getString(stockVisuals, 'skin')
    const guestSkin = getString(guestVisuals, 'skin')
    if (route.bakedGuestSkin !== undefined) {
      if (stockSkins.length !== guestSkins.size || stockSkins.length > 1) continue
      if (stockSkins.length === 0 && ((stockSkin ?? '0') !== route.bakedGuestSkin || (guestSkin ?? '0') !== route.bakedGuestSkin)) continue
      if (
        [...stockSkins, ...guestSkins].some(
          ({ value }) =>
            !isNode(value) ||
            getString(value, 'skin') !== route.bakedGuestSkin ||
            value.entries.some((entry) => entry.key !== 'type' && entry.key !== 'skin')
        )
      )
        continue
    } else if (stockSkins.length || guestSkins.size) continue

    const additional = route.applyTime?.additionalWearable
    const isAdditional = (entry: (typeof guestModifiers)[number]) =>
      isNode(entry.value) && getString(entry.value, 'type') === 'additional_wearable'
    const matchesAdditional = (entry: (typeof guestModifiers)[number]) =>
      isNode(entry.value) && getString(entry.value, 'asset') === additional?.model && entry.value.entries.length === 2
    const guestAdditions = guestModifiers.filter(isAdditional)
    if (
      additional &&
      [stockModifiers.filter(isAdditional), guestAdditions].some((modifiers) => modifiers.length !== 1 || !matchesAdditional(modifiers[0]))
    )
      continue

    const modelModifiers = new Set<string>()
    if (!host) {
      // bodygroup_visibility is safe for a body route: it is copied back onto
      // the default item below, while the merged body supplies the meshes it hides.
      if (!additional) modelModifiers.add('additional_wearable')
      modelModifiers.add('entity_model')
    }
    if (
      [...stockModifiers, ...guestModifiers].some(
        (entry) => isNode(entry.value) && modelModifiers.has(getString(entry.value, 'type') ?? '')
      )
    )
      continue

    const hostBytes = readModel(hostPath)
    const guestBytes = readModel(guestPath)
    if (!hostBytes || !guestBytes) continue
    const extraBytes = additional && readEntry(stock, `${additional.model}_c`)
    if (additional && (!extraBytes || sha256Hex(extraBytes) !== additional.sha256)) continue

    let merged: Buffer | undefined
    const pickKey = `${pick.hero}/${pick.slot}`
    const hostLabel = route.hostSlot ?? 'hero body'
    const recordFailure = (reason: string) => {
      if (!mergedPicks.has(pickKey)) {
        failedPicks.set(pickKey, { hero: pick.hero, slot: pick.slot, itemName: pick.itemName, hostLabel, reason })
      }
    }

    if (route.hostModel && route.applyTime) {
      if (
        (generatedBodies.get(hostPath) !== hostBytes && sha256Hex(hostBytes) !== route.applyTime.stockBodySha256) ||
        !route.applyTime.wearableSha256s.includes(sha256Hex(guestBytes))
      ) {
        continue
      }
    }

    if (!tool) {
      recordFailure('wearable-merger.exe not found')
      continue
    }

    const explicitBindCheck = route.applyTime?.checkWeightedBind
    const arcanaStyle = applied.find((p) => p.hero === route.hero && p.slot === 'hero_base' && p.reason === 'requested')?.style ?? 0
    const arcanaMeshGroup = `arcana_@${arcanaStyle + 1}`
    const cacheKey = `${sha256Hex(hostBytes)}:${sha256Hex(guestBytes)}:${additional?.sha256 ?? ''}:${String(explicitBindCheck ?? 'auto')}:${arcanaMeshGroup}`
    const cached = attemptCache.get(cacheKey)
    if (typeof cached === 'string') {
      recordFailure(cached)
      continue
    }
    if (cached) {
      merged = cached
    } else {
      try {
        let bindCheck: boolean | 'near' = explicitBindCheck ?? false
        let guestMeshGroup: string | undefined
        let model: Buffer
        for (;;) {
          try {
            model = await runMerge(tool, hostBytes, guestBytes, extraBytes, bindCheck, guestMeshGroup)
            break
          } catch (err) {
            const reason = mergeErrorReason(err)
            // Retry with --check-weighted-bind when no explicit bind mode is configured,
            // so unused skeleton bones (e.g. portrait, totem_1) do not fail the bind check.
            if (explicitBindCheck === undefined && bindCheck === false && reason.includes('Different world bind pose')) {
              bindCheck = true
              continue
            }
            // Retry with the active Arcana mesh group when a guest wearable uses
            // `arcana_@*` style groups (e.g. Earthshaker Planetfall - Head).
            if (!guestMeshGroup && reason.includes('Guest mesh groups are not supported')) {
              guestMeshGroup = arcanaMeshGroup
              continue
            }
            throw err
          }
        }
        merged = model
        attemptCache.set(cacheKey, model)
        if (route.hostModel) generatedBodies.set(hostPath, model)
      } catch (err) {
        const reason = mergeErrorReason(err)
        console.warn(`[WearableMerge] On-the-fly merge failed for ${route.hero}/${route.slot} -> ${hostLabel}:`, reason)
        attemptCache.set(cacheKey, reason)
        recordFailure(reason)
        continue
      }
    }

    mergedPicks.add(pickKey)
    failedPicks.delete(pickKey)

    const bodygroups = stockModifiers.filter((entry) => isNode(entry.value) && getString(entry.value, 'type') === 'bodygroup_visibility')
    const eol = detectEol(content)
    const changes = new Map<string, string>()
    if (host && hostDefault) {
      const particles = new Set(
        route.preserveGuestVisuals
          ? []
          : guestModifiers.filter((entry) => isNode(entry.value) && getString(entry.value, 'type') === 'particle_create')
      )
      mergeAssetModifiers(host, [...bodygroups, ...particles].map((entry) => entry.value).filter(isNode))
      const hostVisuals = getNode(host, 'visuals') ?? { entries: [], start: 0, end: 0 }
      setEntry(host, 'visuals', hostVisuals)
      setEntry(hostVisuals, 'skip_model_combine', '1')
      if (guestVisuals) guestVisuals.entries = guestVisuals.entries.filter((entry) => !particles.has(entry))
      changes.set(hostDefault.id, serializeValue(host, 2, eol))
    } else if (bodygroups.length) {
      // A body merge has no host item to carry the hide, so keep it on the
      // default item. The merged body supplies the replacement meshes.
      mergeAssetModifiers(guest, bodygroups.map((entry) => entry.value).filter(isNode))
    }
    removeKey(guest, 'model_player')
    if (guestVisuals) {
      if (!route.preserveGuestVisuals) removeKey(guestVisuals, 'skip_model_combine')
      if (additional) guestVisuals.entries = guestVisuals.entries.filter((entry) => entry !== guestAdditions[0])
      if (route.bakedGuestSkin !== undefined) {
        guestVisuals.entries = guestVisuals.entries.filter((entry) => !guestSkins.has(entry))
        removeKey(guestVisuals, 'skin')
      }
    }
    changes.set(pick.targetId, serializeValue(guest, 2, eol))
    content = applyItemBlocks(content, changes, { sanitize: false }).text
    spans = undefined
    entries.set(hostPath, { vpkPath: hostPath, source: merged })
    targets.push(...changes.keys())
    models++
  }

  for (const failure of failedPicks.values()) {
    warnings?.push(
      `${failure.hero}/${failure.slot}: "${failure.itemName}" could not be merged into ${failure.hostLabel} for reconnect (${failure.reason}). It may disappear on reconnect.`
    )
  }

  return { content, targets, models }
}
