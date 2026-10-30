/**
 * Asset overlay for cosmetics that items_game cannot express.
 *
 * A few arcanas/personas need actual model files swapped (Legion Commander's arcana is
 * a model skin in Valve's data, so an items_game override never activates it). Those
 * entries live in `data/cosmetic-assets.json` and the files are sourced from a pack
 * folder today, from the CDN later.
 */

import fs from 'fs'
import path from 'path'
import { APP_CONFIG } from '../../shared/constants/appConfig'
import { getAppRoot, getDataPath } from './appPathService'

export interface CosmeticAssetEntry {
  name: string
  hero: string
  /** Folder inside the source pack that holds the files. */
  group: string
  /** items_game patch shipped with the group; applied on top of the compiled schema. */
  patch?: string
  reason?: string
  files: string[]
}

interface Manifest {
  sourceDir?: string
  items: Record<string, CosmeticAssetEntry>
}

export interface OverlayResult {
  items: Array<{ id: string; name: string; hero: string }>
  copied: number
  bytes: number
  missing: string[]
  /** Raw items_game patch text shipped with each overlay group. */
  patches: string[]
}

let cache: Manifest | null = null

export function loadManifest(): Manifest {
  if (cache) return cache
  try {
    const file = getDataPath('cosmetic-assets.json')
    cache = JSON.parse(fs.readFileSync(file, 'utf-8')) as Manifest
  } catch {
    cache = { items: {} }
  }
  return cache
}

export function entryFor(itemId: number | string): CosmeticAssetEntry | null {
  return loadManifest().items[String(itemId)] ?? null
}

/** Folders searched, in order, for `<group>/<file>`. */
export function sourceRoots(group: string): string[] {
  const roots: string[] = []
  const env = process.env.SKINFORGE_ASSET_SOURCE
  if (env) roots.push(env)
  const configured = loadManifest().sourceDir
  if (configured) roots.push(configured)
  // Future: files mirrored inside the app or downloaded from the CDN.
  roots.push(path.join(getAppRoot(), 'data', 'cosmetic-assets'))
  roots.push(path.join(APP_CONFIG.cdnUrl, 'cosmetic-assets'))
  return roots.map((root) => path.join(root, group))
}

function resolveFile(group: string, rel: string): string | null {
  for (const root of sourceRoots(group)) {
    if (root.includes('://')) continue
    const candidate = path.join(root, rel.replace(/\//g, path.sep))
    if (fs.existsSync(candidate)) return candidate
  }
  return null
}

/** Copy every overlay asset for the selected item ids into the staging tree. */
export function applyOverlay(itemIds: Iterable<number>, stagingDir: string): OverlayResult {
  const result: OverlayResult = { items: [], copied: 0, bytes: 0, missing: [], patches: [] }
  const seen = new Set<string>()

  for (const id of itemIds) {
    const entry = entryFor(id)
    if (!entry || seen.has(String(id))) continue
    seen.add(String(id))
    result.items.push({ id: String(id), name: entry.name, hero: entry.hero })

    if (entry.patch) {
      const patchPath = resolveFile(entry.group, entry.patch)
      if (patchPath) result.patches.push(fs.readFileSync(patchPath, 'utf-8'))
      else result.missing.push(entry.patch)
    }

    for (const rel of entry.files) {
      const source = resolveFile(entry.group, rel)
      if (!source) {
        result.missing.push(rel)
        continue
      }
      const dest = path.join(stagingDir, rel.replace(/\//g, path.sep))
      fs.mkdirSync(path.dirname(dest), { recursive: true })
      fs.copyFileSync(source, dest)
      result.copied++
      result.bytes += fs.statSync(source).size
    }
  }

  return result
}
