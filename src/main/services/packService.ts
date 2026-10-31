/**
 * Pack bundle ingestion & items_game merge.
 *
 * A bundle is a folder of game-relative assets plus per-group `items_patch.txt` files:
 *
 *   <bundle>/<group>/models/heroes/...        assets, paths relative to `game/`
 *   <bundle>/<group>/items_patch.txt          items_game blocks for that group
 *   <bundle>/_global/scripts/items/items_game.txt   optional full schema
 *
 * Staging copies the assets and merges every patch into one `items_game.txt`, leaving
 * the folder ready for the VPK packer.
 */

import fs from 'fs'
import path from 'path'
import { find, isNode, parseVdf } from './modifier/vdf'

const GROUP_META = new Set(['manifest.json', 'items_patch.txt', 'items_patch_all.txt'])
const BRANDING_DIR = '_branding'

/**
 * Injected by tooling (VAC warning text, credits, hero preview videos). The extractor
 * keeps these out of hero groups, but they land in `_global` when a pack ships them.
 */
const EXCLUDED_PREFIXES = ['resource/localization/', 'panorama/']

function isExcluded(rel: string): boolean {
  return EXCLUDED_PREFIXES.some((prefix) => rel.startsWith(prefix))
}

/** Skip everything except the `items` section, and every item block inside it. */
const ITEMS_ONLY = (key: string, depth: number): boolean => !(key.toLowerCase() === 'items' && depth === 1)

export interface ItemBlockSpan {
  id: string
  start: number
  end: number
}

export interface ItemsSection {
  blocks: Map<string, ItemBlockSpan>
  /** Offset of the `items` closing brace, where new blocks are inserted. */
  insertAt: number
}

export function readItemsSection(text: string): ItemsSection {
  const doc = parseVdf(text, { opaque: ITEMS_ONLY })
  const items = find(doc.root, 'items')
  if (!items || !isNode(items.value)) {
    throw new Error('items_game.txt: missing items_game.items')
  }
  const blocks = new Map<string, ItemBlockSpan>()
  for (const entry of items.value.entries) {
    if (!isNode(entry.value)) continue
    blocks.set(entry.key, { id: entry.key, start: entry.valueStart, end: entry.valueEnd })
  }
  return { blocks, insertAt: items.value.end - 1 }
}

export function readPatchBlocks(patchText: string): Map<string, ItemBlockSpan> {
  return readItemsSection(patchText).blocks
}

/** Remove the pack tool's account watermark and any self-advert description. */
export function sanitizeBlock(raw: string): {
  text: string
  removedWatermark: boolean
  removedAdvert: boolean
} {
  let text = raw
  let removedWatermark = false
  let removedAdvert = false

  const watermark = /\s*"test_name"\s*"(?:[^"\\]|\\.)*"/g
  if (watermark.test(text)) {
    removedWatermark = true
    text = text.replace(watermark, '')
  }

  // Third-party packs replace item descriptions with their own advert. Any description
  // carrying a link is one of those, so it is emptied instead of shipped.
  const advert = /"item_description"\s*"(?:[^"\\]|\\.)*(?:https?:\/\/|www\.)(?:[^"\\]|\\.)*"/gi
  if (advert.test(text)) {
    removedAdvert = true
    text = text.replace(advert, '"item_description"\t""')
  }

  return { text, removedWatermark, removedAdvert }
}

export interface MergeStats {
  applied: string[]
  added: string[]
  removedWatermark: number
  removedAdvert: number
}

export interface MergeOptions {
  sanitize?: boolean
  /** Item ids whose base block must win over the patch. */
  skipIds?: Iterable<string>
  /** When set, only these item ids may be taken from the patch. */
  onlyIds?: Iterable<string>
}

/**
 * Overwrite (or append) raw item blocks inside `baseText`.
 * Every other byte of the base document is preserved.
 */
export function applyItemBlocks(
  baseText: string,
  blocks: Iterable<[string, string]>,
  options: MergeOptions = {}
): { text: string; stats: MergeStats } {
  const base = readItemsSection(baseText)
  const stats: MergeStats = { applied: [], added: [], removedWatermark: 0, removedAdvert: 0 }
  const edits: Array<{ start: number; end: number; text: string }> = []

  const skip = new Set([...(options.skipIds ?? [])].map(String))
  const only = options.onlyIds ? new Set([...options.onlyIds].map(String)) : null

  for (const [id, raw] of blocks) {
    if (skip.has(String(id))) continue
    if (only && !only.has(String(id))) continue
    let body = raw
    if (options.sanitize !== false) {
      const clean = sanitizeBlock(body)
      body = clean.text
      if (clean.removedWatermark) stats.removedWatermark++
      if (clean.removedAdvert) stats.removedAdvert++
    }
    const target = base.blocks.get(id)
    if (target) {
      edits.push({ start: target.start, end: target.end, text: body })
      stats.applied.push(id)
    } else {
      edits.push({ start: base.insertAt, end: base.insertAt, text: `\n\t\t${body}` })
      stats.added.push(id)
    }
  }

  edits.sort((a, b) => b.start - a.start)
  let out = baseText
  for (const edit of edits) out = out.slice(0, edit.start) + edit.text + out.slice(edit.end)

  return { text: out, stats }
}

/**
 * Overwrite (or append) the item blocks from each patch inside `baseText`.
 * Every other byte of the base document is preserved.
 */
export function mergeItemsGame(baseText: string, patches: string[], options: MergeOptions = {}): { text: string; stats: MergeStats } {
  const blocks: Array<[string, string]> = []
  for (const patchText of patches) {
    for (const [id, span] of readPatchBlocks(patchText)) {
      blocks.push([id, patchText.slice(span.start, span.end)])
    }
  }
  return applyItemBlocks(baseText, blocks, options)
}

// ---------------------------------------------------------------------------
// Bundles
// ---------------------------------------------------------------------------

export interface BundleGroup {
  name: string
  dir: string
  files: string[]
  bytes: number
  patchPath: string | null
  itemIds: string[]
  /** Files dropped because they are tooling branding. */
  excluded: number
}

export interface Bundle {
  root: string
  groups: BundleGroup[]
  branding: BundleGroup | null
  baseItemsGame: string | null
}

function walk(dir: string, prefix = ''): string[] {
  const out: string[] = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name
    if (entry.isDirectory()) out.push(...walk(path.join(dir, entry.name), rel))
    else out.push(rel)
  }
  return out
}

function readGroup(name: string, dir: string): BundleGroup {
  const all = walk(dir)
  const kept = all.filter((rel) => {
    const base = path.posix.basename(rel)
    return !GROUP_META.has(base) && !base.endsWith('_all.txt')
  })
  const files = kept.filter((rel) => !isExcluded(rel))
  let bytes = 0
  for (const rel of files) bytes += fs.statSync(path.join(dir, rel)).size

  const patchCandidate = path.join(dir, 'items_patch.txt')
  const patchPath = fs.existsSync(patchCandidate) ? patchCandidate : null
  let itemIds: string[] = []
  if (patchPath) {
    try {
      itemIds = [...readPatchBlocks(fs.readFileSync(patchPath, 'utf-8')).keys()]
    } catch {
      itemIds = []
    }
  }
  return { name, dir, files, bytes, patchPath, itemIds, excluded: kept.length - files.length }
}

export function readBundle(root: string): Bundle {
  if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) {
    throw new Error(`Bundle folder not found: ${root}`)
  }

  const groups: BundleGroup[] = []
  let branding: BundleGroup | null = null
  let baseItemsGame: string | null = null

  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    const dir = path.join(root, entry.name)
    if (entry.name === BRANDING_DIR) {
      branding = readGroup(entry.name, dir)
      continue
    }
    const group = readGroup(entry.name, dir)
    if (!group.files.length && !group.patchPath) continue
    groups.push(group)

    const candidate = path.join(dir, 'scripts', 'items', 'items_game.txt')
    if (fs.existsSync(candidate)) baseItemsGame = candidate
  }

  groups.sort((a, b) => {
    if (a.name === '_global') return -1
    if (b.name === '_global') return 1
    return a.name.localeCompare(b.name)
  })

  return { root, groups, branding, baseItemsGame }
}

export interface StageProgress {
  step: number
  total: number
  message: string
}

export type StageProgressCallback = (progress: StageProgress) => void

export interface StageOptions {
  /** Overrides the bundle's own items_game.txt (e.g. a freshly extracted Valve copy). */
  baseItemsGame?: string
  /** Strip the pack tool's watermark and advert text. Defaults to true. */
  sanitize?: boolean
}

export interface StageResult {
  stagingDir: string
  files: number
  bytes: number
  groups: number
  patchBlocks: number
  itemsGameBytes: number
  /** Branding-folder files pulled in because the schema references them. */
  referencedBranding: number
  merge: MergeStats
}

/** `x.vmdl_c` -> `x.vmdl`: the path an items_game entry actually points at. */
function referencedPath(rel: string): string {
  return rel.replace(/_c(\.[^./]+)$/, '$1')
}

export async function stageBundle(
  bundle: Bundle,
  stagingDir: string,
  options: StageOptions = {},
  onProgress: StageProgressCallback = () => {}
): Promise<StageResult> {
  fs.rmSync(stagingDir, { recursive: true, force: true })
  fs.mkdirSync(stagingDir, { recursive: true })

  const baseItemsGame = options.baseItemsGame ?? bundle.baseItemsGame
  if (!baseItemsGame || !fs.existsSync(baseItemsGame)) {
    throw new Error(
      'Bundle has no base items_game.txt. Pass one explicitly or include ' + '_global/scripts/items/items_game.txt in the bundle.'
    )
  }

  const totalFiles = bundle.groups.reduce((sum, g) => sum + g.files.length, 0)
  let copied = 0
  let bytes = 0

  for (const group of bundle.groups) {
    for (const rel of group.files) {
      // The schema is regenerated below; never copy a stale one.
      if (rel === 'scripts/items/items_game.txt') continue
      const src = path.join(group.dir, rel)
      const dst = path.join(stagingDir, rel.replace(/\//g, path.sep))
      fs.mkdirSync(path.dirname(dst), { recursive: true })
      fs.copyFileSync(src, dst)
      bytes += fs.statSync(src).size
      copied++
      if (copied % 250 === 0) {
        onProgress({ step: 1, total: 3, message: `Staging assets... ${copied}/${totalFiles}` })
      }
    }
  }

  onProgress({ step: 2, total: 3, message: 'Merging items_game patches...' })

  const mergedPath = path.join(stagingDir, 'scripts', 'items', 'items_game.txt')
  fs.mkdirSync(path.dirname(mergedPath), { recursive: true })

  const baseText = fs.readFileSync(baseItemsGame, 'utf-8')
  const patches = bundle.groups.filter((g) => g.patchPath).map((g) => fs.readFileSync(g.patchPath!, 'utf-8'))

  const merged = mergeItemsGame(baseText, patches, { sanitize: options.sanitize !== false })
  fs.writeFileSync(mergedPath, merged.text, 'utf-8')

  // Branding is normally dropped, but the schema may point at a model that lives
  // under `_branding/`, where some packs keep models the schema still points at.
  let referencedBranding = 0
  if (bundle.branding) {
    for (const rel of bundle.branding.files) {
      if (!merged.text.includes(referencedPath(rel))) continue
      const src = path.join(bundle.branding.dir, rel)
      const dst = path.join(stagingDir, rel.replace(/\//g, path.sep))
      fs.mkdirSync(path.dirname(dst), { recursive: true })
      fs.copyFileSync(src, dst)
      bytes += fs.statSync(src).size
      copied++
      referencedBranding++
    }
  }

  onProgress({ step: 3, total: 3, message: 'Staging complete.' })

  return {
    stagingDir,
    files: copied,
    bytes,
    groups: bundle.groups.length,
    patchBlocks: merged.stats.applied.length + merged.stats.added.length,
    itemsGameBytes: fs.statSync(mergedPath).size,
    referencedBranding,
    merge: merged.stats
  }
}

export function summarizeBundle(bundle: Bundle): string {
  const files = bundle.groups.reduce((s, g) => s + g.files.length, 0)
  const bytes = bundle.groups.reduce((s, g) => s + g.bytes, 0)
  const items = bundle.groups.reduce((s, g) => s + g.itemIds.length, 0)
  const lines = [
    `bundle    ${bundle.root}`,
    `groups    ${bundle.groups.length}`,
    `files     ${files} (${(bytes / 1e6).toFixed(2)} MB)`,
    `items     ${items} blocks`,
    `base      ${bundle.baseItemsGame ?? 'missing'}`
  ]
  if (bundle.branding) lines.push(`branding  ${bundle.branding.files.length} files excluded`)
  return lines.join('\n')
}
