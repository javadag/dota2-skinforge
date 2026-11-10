/**
 * Watch the game's own item file for changes between builds.
 *
 * A Dota patch can add cosmetics (which our armory will not know about until it is
 * rebuilt) or rewrite items we patch. Without a stored copy of what the file looked like
 * last time, the first sign of either is a bug report. This keeps a compact fingerprint of
 * every item entry — id plus a hash of its content — and reports what moved.
 */

import crypto from 'crypto'
import fs from 'fs'

import { getStatePath } from './appPathService'
import { readItemsSection } from './packService'

export interface Baseline {
  takenAt: string
  /** item id -> hash of its content, whitespace-insensitive. */
  blocks: Record<string, string>
}

export interface Drift {
  added: string[]
  removed: string[]
  changed: string[]
}

const FILE = 'itemsgame_baseline.json'

/** Collapse whitespace so a reformatted-but-identical entry does not count as a change. */
function fingerprint(block: string): string {
  return crypto.createHash('sha1').update(block.replace(/\s+/g, ' ').trim()).digest('hex').slice(0, 16)
}

export function buildBaseline(text: string): Baseline {
  const blocks: Record<string, string> = {}
  for (const [id, span] of readItemsSection(text).blocks) blocks[id] = fingerprint(text.slice(span.start, span.end))
  return { takenAt: new Date().toISOString(), blocks }
}

export function readBaseline(): Baseline | null {
  try {
    const raw = fs.readFileSync(getStatePath(FILE), 'utf-8')
    const parsed = JSON.parse(raw) as Baseline
    return parsed && typeof parsed.blocks === 'object' ? parsed : null
  } catch {
    return null
  }
}

export function writeBaseline(baseline: Baseline): void {
  try {
    fs.writeFileSync(getStatePath(FILE), JSON.stringify(baseline), 'utf-8')
  } catch {
    // Losing the baseline only costs us the next comparison.
  }
}

export function diffBaselines(before: Record<string, string>, after: Baseline): Drift {
  const added: string[] = []
  const removed: string[] = []
  const changed: string[] = []
  for (const [id, hash] of Object.entries(after.blocks)) {
    const old = before[id]
    if (old === undefined) added.push(id)
    else if (old !== hash) changed.push(id)
  }
  for (const id of Object.keys(before)) if (after.blocks[id] === undefined) removed.push(id)
  return { added, removed, changed }
}

/**
 * Compare the freshly extracted item file with the stored one.
 *
 * Returns a sentence for the build log, or null when nothing moved (or when there is no
 * baseline yet — the first run just records one).
 */
export function checkDrift(text: string): { note: string | null; current: Baseline } {
  const current = buildBaseline(text)
  const previous = readBaseline()
  if (!previous) return { note: null, current }

  const drift = diffBaselines(previous.blocks, current)
  if (!drift.added.length && !drift.removed.length && !drift.changed.length) return { note: null, current }

  const parts: string[] = []
  if (drift.added.length) parts.push(`${drift.added.length} new`)
  if (drift.changed.length) parts.push(`${drift.changed.length} changed`)
  if (drift.removed.length) parts.push(`${drift.removed.length} removed`)

  return {
    note:
      `Dota's item file changed since the last build (${parts.join(', ')} entries). ` +
      (drift.added.length ? 'New cosmetics will not appear in the app until the armory is rebuilt. ' : '') +
      'If something you applied looks wrong, rebuild after the update.',
    current
  }
}
