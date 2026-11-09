/**
 * Asset overlay & companion refit engine for cosmetics that items_game alone cannot express.
 *
 * Arcanas, Personas, and select custom-compiled sets live in `data/cosmetic-assets.json`
 * and are sourced from the sanitized bundle (`D:\skinforge_assets`).
 */

import fs from 'fs'
import path from 'path'
import { getAppRoot, getDataPath } from './appPathService'
import { getAssetCacheDir } from './assetDeliveryService'
import { loadIndex, readEntry, type VpkIndex } from './vpkIndex'

export interface PathMapping {
  /** Source path (relative to the group folder for aliases, or inside Valve's VPK for valveCopies). */
  src: string
  /** Destination game-relative path inside the staging directory. */
  dst: string
}

export interface CompanionRefit {
  name: string
  slot: string
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
  /** items_game patch shipped with the group; applied on top of the compiled schema. */
  patch?: string
  /** Default item block IDs in `patch` that belong to the base Arcana/Persona/Set. */
  basePatchIds?: string[]
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

export interface CosmeticAssetsManifest {
  $comment?: string
  sourceDir?: string
  globalFiles?: string[]
  items: Record<string, CosmeticAssetEntry>
}

export interface OverlayPatch {
  text: string
  /** When defined, only these item block IDs from `text` may be merged into items_game.txt. */
  onlyIds?: Set<string>
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
  virtual?: boolean
  styles?: Map<number, number> | Record<string, number>
}

let cache: CosmeticAssetsManifest | null = null

export function clearManifestCache(): void {
  cache = null
}

export function loadManifest(): CosmeticAssetsManifest {
  if (cache) return cache
  try {
    const file = getDataPath('cosmetic-assets.json')
    cache = JSON.parse(fs.readFileSync(file, 'utf-8')) as CosmeticAssetsManifest
  } catch {
    cache = { items: {} }
  }
  return cache
}

export function entryFor(itemId: number | string, manifest = loadManifest()): CosmeticAssetEntry | null {
  return manifest.items[String(itemId)] ?? null
}

/** Folders searched, in order, for `<group>/<file>`. */
export function sourceRoots(group: string, manifest = loadManifest()): string[] {
  const baseDirs: string[] = []
  const env = process.env.SKINFORGE_ASSET_SOURCE
  if (env) baseDirs.push(env)
  const configured = manifest.sourceDir
  if (configured) baseDirs.push(configured)

  // Standard local developer directories
  for (const devDir of ['D:\\skinforge_assets', 'D:\\changer_cleaned']) {
    if (fs.existsSync(devDir)) baseDirs.push(devDir)
  }

  // User cache directory (downloaded packages from Cloudflare R2)
  baseDirs.push(getAssetCacheDir())

  // Local data fallback directory
  baseDirs.push(path.join(getAppRoot(), 'data', 'cosmetic-assets'))

  return baseDirs.map((root) => path.join(root, group))
}

function resolveFile(group: string, rel: string, manifest = loadManifest()): string | null {
  for (const root of sourceRoots(group, manifest)) {
    if (root.includes('://')) continue
    const candidate = path.join(root, rel.replace(/\//g, path.sep))
    if (fs.existsSync(candidate)) return candidate
  }
  return null
}

/** Copy every overlay asset (plus matched companion refits and global guards) for the selected item ids into the staging tree. */
export function applyOverlay(itemIds: Iterable<number>, stagingDir: string, options: ApplyOverlayOptions = {}): OverlayResult {
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
        vpkIdx = loadIndex(options.dotaVpk)
      } catch {
        vpkIdx = null
      }
    }
    return vpkIdx
  }

  const copyGroupFile = (group: string, rel: string): boolean => {
    const source = resolveFile(group, rel, manifest)
    if (!source) {
      result.missing.push(rel)
      return false
    }
    const cleanRel = rel.replace(/\\/g, '/')
    result.entries.push({ vpkPath: cleanRel, source })
    result.copied++
    result.bytes += fs.statSync(source).size

    if (!options.virtual && stagingDir) {
      const dest = path.join(stagingDir, rel.replace(/\//g, path.sep))
      fs.mkdirSync(path.dirname(dest), { recursive: true })
      fs.copyFileSync(source, dest)
    }
    return true
  }

  const copyAlias = (group: string, mapping: PathMapping): void => {
    const cleanSrc = mapping.src.replace(/\\/g, '/')
    const existing = result.entries.find((e) => e.vpkPath.toLowerCase() === cleanSrc.toLowerCase())
    const source = existing ? existing.source : resolveFile(group, mapping.src, manifest)
    if (!source) {
      result.missing.push(mapping.dst)
      return
    }
    const cleanDst = mapping.dst.replace(/\\/g, '/')
    result.entries.push({ vpkPath: cleanDst, source })
    result.copied++
    result.bytes += Buffer.isBuffer(source) ? source.length : fs.statSync(source).size

    if (!options.virtual && stagingDir) {
      const dest = path.join(stagingDir, mapping.dst.replace(/\//g, path.sep))
      fs.mkdirSync(path.dirname(dest), { recursive: true })
      if (Buffer.isBuffer(source)) {
        fs.writeFileSync(dest, source)
      } else {
        fs.copyFileSync(source, dest)
      }
    }
  }

  const copyFromValve = (mapping: PathMapping): void => {
    const idx = getVpkIndex()
    if (!idx) {
      result.missing.push(mapping.dst)
      return
    }
    const clean = mapping.src.replace(/\\/g, '/')
    const bytes = readEntry(idx, clean) ?? (clean.endsWith('_c') ? null : readEntry(idx, `${clean}_c`))
    if (!bytes) {
      result.missing.push(mapping.dst)
      return
    }
    const cleanDst = mapping.dst.replace(/\\/g, '/')
    result.entries.push({ vpkPath: cleanDst, source: bytes })
    result.copied++
    result.bytes += bytes.length

    if (!options.virtual && stagingDir) {
      const dest = path.join(stagingDir, mapping.dst.replace(/\//g, path.sep))
      fs.mkdirSync(path.dirname(dest), { recursive: true })
      fs.writeFileSync(dest, bytes)
    }
  }

  let globalStaged = false

  for (const id of itemIds) {
    const entry = entryFor(id, manifest)
    if (!entry || seen.has(String(id))) continue
    seen.add(String(id))

    if (!globalStaged && manifest.globalFiles?.length) {
      globalStaged = true
      for (const gRel of manifest.globalFiles) {
        copyGroupFile('_global', gRel)
      }
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

        const pickedStyle =
          options.styles instanceof Map
            ? options.styles.get(Number(companionId))
            : (options.styles as Record<string, number> | undefined)?.[companionId]
        const styleKey = pickedStyle !== undefined ? String(pickedStyle) : '0'
        const refitStyleOverride = refit.styles?.[styleKey]
        if (refitStyleOverride) {
          for (const rel of refitStyleOverride.files ?? []) copyGroupFile(entry.group, rel)
          for (const alias of refitStyleOverride.aliases ?? []) copyAlias(entry.group, alias)
          for (const vc of refitStyleOverride.valveCopies ?? []) copyFromValve(vc)
        }

        if (refit.slot) result.refitSlots.add(`${entry.hero}/${refit.slot}`)
        if (activePatchIds && refit.patchIds) {
          for (const pid of refit.patchIds) activePatchIds.add(String(pid))
        }
      }
    }

    const activePatch = styleOverride?.patch ?? entry.patch
    if (activePatch) {
      const patchPath = resolveFile(entry.group, activePatch, manifest)
      if (patchPath) {
        result.patches.push({
          text: fs.readFileSync(patchPath, 'utf-8'),
          onlyIds: activePatchIds
        })
      } else {
        result.missing.push(activePatch)
      }
    }
  }

  return result
}
