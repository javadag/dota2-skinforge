/**
 * VDF `items_game.txt` item-block reader, sanitizer, and patch merger.
 *
 * Parses only the `items` section spans so untouched bytes of the ~50 MB schema
 * stay verbatim, and strips third-party watermarks or ad links from overlay patches.
 */

import { applySplices, detectEol, escapeToken, find, isNode, parseVdf, type Splice } from '../modifier/vdf'

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
  const eol = detectEol(baseText)
  const stats: MergeStats = { applied: [], added: [], removedWatermark: 0, removedAdvert: 0 }
  const edits: Splice[] = []
  const addedChunks: string[] = []

  const skip = new Set([...(options.skipIds ?? [])].map(String))
  const only = options.onlyIds ? new Set([...options.onlyIds].map(String)) : null

  // Deduplicate by item ID (last write wins) so duplicate inputs never produce overlapping splices.
  const deduped = new Map<string, string>()
  for (const [rawId, raw] of blocks) {
    const id = String(rawId)
    if (skip.has(id)) continue
    if (only && !only.has(id)) continue
    deduped.set(id, raw)
  }

  for (const [id, raw] of deduped) {
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
      addedChunks.push(`${eol}\t\t${escapeToken(id)}${eol}\t\t${body}`)
      stats.added.push(id)
    }
  }

  if (addedChunks.length) {
    edits.push({ start: base.insertAt, end: base.insertAt, text: addedChunks.join('') })
  }

  return { text: applySplices(baseText, edits), stats }
}

export interface PatchSpec {
  text: string
  onlyIds?: Set<string>
}

/**
 * Batch-merge multiple overlay patches into baseText in a single parse-and-splice pass.
 */
export function mergePatchList(
  baseText: string,
  patches: PatchSpec[],
  options: { sanitize?: boolean; skipIds?: Iterable<string> } = {}
): { text: string; stats: MergeStats } {
  if (!patches.length) {
    return {
      text: baseText,
      stats: { applied: [], added: [], removedWatermark: 0, removedAdvert: 0 }
    }
  }

  const skip = new Set([...(options.skipIds ?? [])].map(String))
  const blocksById = new Map<string, string>()

  for (const patch of patches) {
    for (const [id, span] of readPatchBlocks(patch.text)) {
      if (skip.has(id)) continue
      if (patch.onlyIds && !patch.onlyIds.has(id)) continue
      blocksById.set(id, patch.text.slice(span.start, span.end))
    }
  }

  return applyItemBlocks(baseText, blocksById.entries(), {
    sanitize: options.sanitize,
    skipIds: skip
  })
}
