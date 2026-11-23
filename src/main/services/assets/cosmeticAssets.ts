/**
 * Asset overlay & companion refit engine for cosmetics that items_game alone cannot express.
 *
 * Arcanas, Personas, and select custom-compiled sets live in `data/cosmetic-assets.json`
 * and are sourced from cached/local cosmetic asset packages.
 */

import fs from 'fs'
import path from 'path'
import type { ReconnectRule } from '../../../shared/utils/reconnectRules'
import { getAppRoot, getAssetCacheDir, getDataPath } from '../app/appPaths'
import { getOrLoadVpkIndex, readEntry, readVpkEntry, type VpkIndex } from '../dota/vpkService'
import { LOADOUT_PORTRAITS_PATH, mergeLoadoutPortraits } from './loadoutPortraits'

export interface PathMapping {
  /** Source path (relative to the group folder for aliases, or inside Valve's VPK for valveCopies). */
  src: string
  /** Destination game-relative path inside the staging directory. */
  dst: string
}

export interface CompanionRefit {
  name: string
  /** Wearable slot supplied by the refit, when it replaces the selected model. */
  slot?: string
  files: string[]
  aliases?: PathMapping[]
  valveCopies?: PathMapping[]
  patchIds?: string[]
  styles?: Record<string, { files?: string[]; aliases?: PathMapping[]; patch?: string; valveCopies?: PathMapping[] }>
}

export interface CosmeticAssetEntry {
  name: string
  hero: string
  /** Folder inside the source pack that holds the files. */
  group: string
  /** Stage supporting resources while keeping normal wearable model and schema handling. */
  resourcesOnly?: boolean
  /** items_game patch shipped with the group; applied on top of the compiled schema. */
  patch?: string
  /** Default item block IDs in `patch` that belong to the base Arcana/Persona/Set. */
  basePatchIds?: string[]
  /** Ability names in the base patch whose icon can come from an explicitly selected wearable. */
  preferWearableAbilityIcons?: string[]
  reason?: string
  files: string[]
  /** Extra destination paths populated by copying a file from `files`. */
  aliases?: PathMapping[]
  /** Destination paths populated by extracting `src` from Valve's `pak01_dir.vpk`. */
  valveCopies?: PathMapping[]
  /** Companion item ID -> refitted assets activated when both the base item and companion item are picked. */
  refits?: Record<string, CompanionRefit>
  styles?: Record<string, { files?: string[]; aliases?: PathMapping[]; patch?: string; valveCopies?: PathMapping[] }>
}

export interface EmptySlotRoute {
  hostSlot: string
  model: string
}

export interface CosmeticAssetsManifest {
  $comment?: string
  reconnectRules?: ReconnectRule[]
  /** Empty-slot wearable routes (`"<hero>/<slot>"` -> host slot + additional_wearable model). */
  emptySlotRoutes?: Record<string, EmptySlotRoute>
  globalFiles?: string[]
  /** Valve copies staged once whenever a cosmetic overlay is active. */
  globalValveCopies?: PathMapping[]
  /** Persona selectors whose loadouts accept only official Persona-slot items. */
  personaSlotsOnlyIds?: number[]
  /** Armory set ID -> pieces omitted when Skinforge hydrates that set in the picker. */
  setExcludedItems?: Record<string, Array<{ slot: string; id: number }>>
  items: Record<string, CosmeticAssetEntry>
}

export interface OverlayPatch {
  text: string
  /** When defined, only these item block IDs from `text` may be merged into items_game.txt. */
  onlyIds?: Set<string>
  /** Manifest item ID that owns this patch, used to scope persona vs regular overlay fallbacks. */
  itemId?: string
}

export interface OverlayResult {
  items: Array<{ id: string; name: string; hero: string }>
  copied: number
  bytes: number
  missing: string[]
  entries: Array<{ vpkPath: string; source: string | Buffer }>
  /** Raw items_game patches shipped with each overlay group, paired with their allowed block IDs. */
  patches: OverlayPatch[]
  /** `${hero}/${slot}` keys fulfilled by a companion refit so vanilla ModelSwaps do not overwrite them. */
  refitSlots: Set<string>
}

export interface ApplyOverlayOptions {
  /** Path to Valve's `pak01_dir.vpk` for resolving `valveCopies`. */
  dotaVpk?: string
  /** Preloaded VpkIndex (used by tests or shared across build steps). */
  vpkIndex?: VpkIndex
  /** Override manifest (used by tests). */
  manifest?: CosmeticAssetsManifest
  styles?: Map<number, number> | Record<string, number>
}

let cache: CosmeticAssetsManifest | null = null

export function loadManifest(): CosmeticAssetsManifest {
  if (cache) return cache
  try {
    cache = JSON.parse(fs.readFileSync(getDataPath('cosmetic-assets.json'), 'utf-8')) as CosmeticAssetsManifest
  } catch {
    cache = { items: {} }
  }
  return cache
}

/** Re-read the manifest for a build so a dev session never uses an earlier edit. */
export function loadManifestFresh(): CosmeticAssetsManifest {
  cache = null
  return loadManifest()
}

export function entryFor(itemId: number | string, manifest = loadManifest()): CosmeticAssetEntry | null {
  return manifest.items[String(itemId)] ?? null
}

/** Folders searched, in order, for `<group>/<file>`. */
export function sourceRoots(group: string): string[] {
  const baseDirs: string[] = []
  const env = process.env.SKINFORGE_ASSET_SOURCE?.trim()
  if (env) baseDirs.push(env)

  // User cache directory (downloaded packages from Cloudflare R2)
  baseDirs.push(getAssetCacheDir())

  // Local data fallback directory
  baseDirs.push(path.join(getAppRoot(), 'data', 'cosmetic-assets'))

  return baseDirs.map((root) => path.join(root, group))
}

function resolveFile(group: string, rel: string): string | null {
  for (const root of sourceRoots(group)) {
    if (root.includes('://')) continue
    const candidate = path.join(root, rel.replace(/\//g, path.sep))
    if (fs.existsSync(candidate)) return candidate
  }
  return null
}

/** Collect every overlay asset (plus matched companion refits and global guards) for the selected item ids into virtual VPK entries. */
export function applyOverlay(itemIds: Iterable<number>, options: ApplyOverlayOptions = {}): OverlayResult {
  const manifest = options.manifest ?? loadManifest()
  const result: OverlayResult = {
    items: [],
    copied: 0,
    bytes: 0,
    missing: [],
    entries: [],
    patches: [],
    refitSlots: new Set<string>()
  }

  const allPickedIds = new Set<string>([...itemIds].map(String))
  const seen = new Set<string>()
  let vpkIdx: VpkIndex | null = options.vpkIndex ?? null

  const getVpkIndex = (): VpkIndex | null => {
    if (vpkIdx) return vpkIdx
    if (options.dotaVpk && fs.existsSync(options.dotaVpk)) {
      try {
        vpkIdx = getOrLoadVpkIndex(options.dotaVpk)
      } catch {
        vpkIdx = null
      }
    }
    return vpkIdx
  }

  const copyGroupFile = (group: string, rel: string): boolean => {
    const source = resolveFile(group, rel)
    if (!source) {
      result.missing.push(rel)
      return false
    }
    const cleanRel = rel.replace(/\\/g, '/')
    result.entries.push({ vpkPath: cleanRel, source })
    result.copied++
    result.bytes += fs.statSync(source).size
    return true
  }

  const copyAlias = (group: string, mapping: PathMapping): void => {
    const cleanSrc = mapping.src.replace(/\\/g, '/').toLowerCase()
    let existing: { vpkPath: string; source: string | Buffer } | undefined
    for (let i = result.entries.length - 1; i >= 0; i--) {
      if (result.entries[i].vpkPath.toLowerCase() === cleanSrc) {
        existing = result.entries[i]
        break
      }
    }
    const source = existing ? existing.source : resolveFile(group, mapping.src)
    if (!source) {
      result.missing.push(mapping.dst)
      return
    }
    const cleanDst = mapping.dst.replace(/\\/g, '/')
    result.entries.push({ vpkPath: cleanDst, source })
    result.copied++
    result.bytes += Buffer.isBuffer(source) ? source.length : fs.statSync(source).size
  }

  const copyFromValve = (mapping: PathMapping): void => {
    const idx = getVpkIndex()
    if (!idx) {
      result.missing.push(mapping.dst)
      return
    }
    const bytes = readVpkEntry(idx, mapping.src, { fallbackCompiled: true })
    if (!bytes) {
      result.missing.push(mapping.dst)
      return
    }
    const cleanDst = mapping.dst.replace(/\\/g, '/')
    result.entries.push({ vpkPath: cleanDst, source: bytes })
    result.copied++
    result.bytes += bytes.length
  }

  let globalStaged = false
  let bundledPortraits: string | null = null

  for (const id of itemIds) {
    const entry = entryFor(id, manifest)
    if (!entry || seen.has(String(id))) continue
    seen.add(String(id))

    if (!globalStaged) {
      globalStaged = true
      for (const gRel of manifest.globalFiles ?? []) {
        if (gRel.replace(/\\/g, '/').toLowerCase() === LOADOUT_PORTRAITS_PATH) {
          bundledPortraits = resolveFile('_global', gRel)
          continue
        }
        copyGroupFile('_global', gRel)
      }
      for (const mapping of manifest.globalValveCopies ?? []) copyFromValve(mapping)
    }

    result.items.push({ id: String(id), name: entry.name, hero: entry.hero })

    for (const rel of entry.files) copyGroupFile(entry.group, rel)
    for (const alias of entry.aliases ?? []) copyAlias(entry.group, alias)
    for (const vc of entry.valveCopies ?? []) copyFromValve(vc)

    const pickedStyle =
      options.styles instanceof Map ? options.styles.get(Number(id)) : (options.styles as Record<string, number> | undefined)?.[id]
    const styleKey = pickedStyle !== undefined ? String(pickedStyle) : '0'
    const styleOverride = entry.styles?.[styleKey]
    if (styleOverride) {
      for (const rel of styleOverride.files ?? []) copyGroupFile(entry.group, rel)
      for (const alias of styleOverride.aliases ?? []) copyAlias(entry.group, alias)
      for (const vc of styleOverride.valveCopies ?? []) copyFromValve(vc)
    }

    const activePatchIds = entry.basePatchIds ? new Set<string>(entry.basePatchIds.map(String)) : undefined

    if (entry.refits) {
      for (const [companionId, refit] of Object.entries(entry.refits)) {
        if (!allPickedIds.has(String(companionId))) continue
        for (const rel of refit.files) copyGroupFile(entry.group, rel)
        for (const alias of refit.aliases ?? []) copyAlias(entry.group, alias)
        for (const vc of refit.valveCopies ?? []) copyFromValve(vc)

        const refitPickedStyle =
          options.styles instanceof Map
            ? options.styles.get(Number(companionId))
            : (options.styles as Record<string, number> | undefined)?.[companionId]
        const refitStyleKey = refitPickedStyle !== undefined ? String(refitPickedStyle) : styleKey
        const refitStyleOverride = refit.styles?.[refitStyleKey]
        if (refitStyleOverride) {
          for (const rel of refitStyleOverride.files ?? []) copyGroupFile(entry.group, rel)
          for (const alias of refitStyleOverride.aliases ?? []) copyAlias(entry.group, alias)
          for (const vc of refitStyleOverride.valveCopies ?? []) copyFromValve(vc)
          if (refitStyleOverride.patch) {
            const refitPatchPath = resolveFile(entry.group, refitStyleOverride.patch)
            if (refitPatchPath) {
              result.patches.push({
                text: fs.readFileSync(refitPatchPath, 'utf-8'),
                onlyIds: refit.patchIds ? new Set<string>(refit.patchIds.map(String)) : activePatchIds,
                itemId: String(companionId)
              })
            } else {
              result.missing.push(refitStyleOverride.patch)
            }
          }
        }

        if (refit.slot) result.refitSlots.add(`${entry.hero}/${refit.slot}`)
        if (activePatchIds && refit.patchIds) {
          for (const pid of refit.patchIds) activePatchIds.add(String(pid))
        }
      }
    }

    const activePatch = styleOverride?.patch ?? entry.patch
    if (activePatch) {
      const patchPath = resolveFile(entry.group, activePatch)
      if (patchPath) {
        result.patches.push({
          text: fs.readFileSync(patchPath, 'utf-8'),
          onlyIds: activePatchIds,
          itemId: String(id)
        })
      } else {
        result.missing.push(activePatch)
      }
    }
  }

  if (bundledPortraits) {
    let portraits: Buffer | null = null
    try {
      const index = getVpkIndex()
      const stock = index && readEntry(index, LOADOUT_PORTRAITS_PATH)
      if (stock) {
        portraits = mergeLoadoutPortraits(
          stock.toString('utf8'),
          fs.readFileSync(bundledPortraits, 'utf8'),
          result.items.map((item) => item.hero)
        )
      }
    } catch {
      // Leave Valve's preview configuration mounted if either input cannot be read or parsed.
      result.missing.push(LOADOUT_PORTRAITS_PATH)
    }
    if (portraits) {
      result.entries.push({ vpkPath: LOADOUT_PORTRAITS_PATH, source: portraits })
      result.copied++
      result.bytes += portraits.length
    }
  }

  return result
}
