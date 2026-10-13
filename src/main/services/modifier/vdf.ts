/**
 * Dota 2 SkinForge — VDF / KeyValues parser, span-preserving editor and serializer.
 *
 * Parsing is index-based over the raw string so every node and entry keeps its exact
 * source span, and KeyValues allows repeated keys (`visuals` holds many
 * `asset_modifier` blocks), so entries are stored as an ordered list rather than a map.
 *
 * items_game.txt is ~50 MB and most of it is portrait/camera data we never read.
 * `opaque` lets the parser record a nested block's span without materializing it, so
 * the index stays small; `materialize` fills a block in on demand when we actually
 * need to read or rewrite it.
 *
 * Edits are emitted as splices against the original text: each touched item block is
 * cloned, mutated and re-serialized over its own span. Untouched bytes are copied
 * verbatim, so the parts of the schema we do not change stay byte-identical and the
 * whole class of brace-matching / regex-escaping bugs disappears.
 */

export type VdfValue = string | VdfNode

export interface VdfEntry {
  key: string
  value: VdfValue
  /** Span of the quoted key token. */
  keyStart: number
  keyEnd: number
  /** Span of the value: the quoted string token, or the `{ ... }` block. */
  valueStart: number
  valueEnd: number
}

export interface VdfNode {
  entries: VdfEntry[]
  /** Offset of the opening brace. */
  start: number
  /** Offset just past the closing brace. */
  end: number
  /** True when the block's contents were skipped and must be materialized first. */
  opaque?: boolean
}

/** Called for every nested block; return true to keep it as an unparsed span. */
export type OpaquePredicate = (key: string, depth: number) => boolean

export interface ParseOptions {
  opaque?: OpaquePredicate
}

export interface VdfDocument {
  /** Top-level key, e.g. `items_game`. */
  key: string
  /** Contents of the top-level block. */
  root: VdfNode
}

export class VdfParseError extends Error {
  constructor(
    message: string,
    readonly offset: number
  ) {
    super(`${message} (at offset ${offset})`)
    this.name = 'VdfParseError'
  }
}

interface Cursor {
  pos: number
}

function isWhitespace(code: number): boolean {
  // 0xfeff is a UTF-8 BOM, which Valve's localization files begin with.
  return code === 32 || code === 9 || code === 10 || code === 13 || code === 11 || code === 12 || code === 0xfeff
}

function skipTrivia(text: string, c: Cursor): void {
  while (c.pos < text.length) {
    const code = text.charCodeAt(c.pos)
    if (isWhitespace(code)) {
      c.pos++
      continue
    }
    if (code === 47 /* / */) {
      const next = text.charCodeAt(c.pos + 1)
      if (next === 47) {
        while (c.pos < text.length && text[c.pos] !== '\n') c.pos++
        continue
      }
      if (next === 42 /* * */) {
        const close = text.indexOf('*/', c.pos + 2)
        c.pos = close === -1 ? text.length : close + 2
        continue
      }
    }
    return
  }
}

interface Token {
  value: string
  start: number
  end: number
}

function readToken(text: string, c: Cursor): Token {
  const start = c.pos
  if (text[c.pos] === '"') {
    c.pos++
    let value = ''
    let simple = true
    while (c.pos < text.length) {
      const ch = text[c.pos]
      if (ch === '\\' && c.pos + 1 < text.length) {
        const next = text[c.pos + 1]
        if (next === '"' || next === '\\') {
          value += next
          simple = false
          c.pos += 2
          continue
        }
        value += ch
        simple = false
        c.pos++
        continue
      }
      if (ch === '"') {
        c.pos++
        // Fast path: no escapes, so the raw slice is the value.
        return simple ? { value: text.slice(start + 1, c.pos - 1), start, end: c.pos } : { value, start, end: c.pos }
      }
      value += ch
      c.pos++
    }
    return { value, start, end: c.pos }
  }

  while (c.pos < text.length) {
    const ch = text[c.pos]
    if (ch === ' ' || ch === '\t' || ch === '\r' || ch === '\n' || ch === '{' || ch === '}' || ch === '"') break
    c.pos++
  }
  return { value: text.slice(start, c.pos), start, end: c.pos }
}

/** Advance past a balanced `{ ... }` block, respecting quoted strings. */
function skipBlock(text: string, c: Cursor): number {
  const start = c.pos
  c.pos++ // consume '{'
  let depth = 1
  while (c.pos < text.length) {
    const ch = text[c.pos]
    if (ch === '"') {
      c.pos++
      while (c.pos < text.length) {
        if (text[c.pos] === '\\') {
          c.pos += 2
          continue
        }
        if (text[c.pos] === '"') {
          c.pos++
          break
        }
        c.pos++
      }
      continue
    }
    if (ch === '{') depth++
    else if (ch === '}') {
      depth--
      if (depth === 0) {
        c.pos++
        return c.pos
      }
    }
    c.pos++
  }
  throw new VdfParseError('Unterminated block', start)
}

function parseNode(text: string, c: Cursor, depth: number, options: ParseOptions): VdfNode {
  const start = c.pos
  c.pos++ // consume '{'
  const entries: VdfEntry[] = []

  for (;;) {
    skipTrivia(text, c)
    if (c.pos >= text.length) {
      // A truncated items_game.txt must fail loudly rather than yield a partial tree.
      throw new VdfParseError('Unterminated block', start)
    }
    if (text[c.pos] === '}') {
      c.pos++
      break
    }
    if (text[c.pos] !== '"') {
      throw new VdfParseError(`Expected a quoted key but found ${JSON.stringify(text[c.pos])}`, c.pos)
    }

    const key = readToken(text, c)
    skipTrivia(text, c)

    let value: VdfValue
    let valueStart: number
    let valueEnd: number
    if (text[c.pos] === '{') {
      const childDepth = depth + 1
      if (options.opaque && options.opaque(key.value, childDepth)) {
        valueStart = c.pos
        valueEnd = skipBlock(text, c)
        value = { entries: [], start: valueStart, end: valueEnd, opaque: true }
      } else {
        const child = parseNode(text, c, childDepth, options)
        value = child
        valueStart = child.start
        valueEnd = child.end
      }
    } else {
      const scalar = readToken(text, c)
      value = scalar.value
      valueStart = scalar.start
      valueEnd = scalar.end
    }

    entries.push({ key: key.value, value, keyStart: key.start, keyEnd: key.end, valueStart, valueEnd })
  }

  return { entries, start, end: c.pos }
}

/** Parse a full VDF document such as `items_game.txt`. */
export function parseVdf(text: string, options: ParseOptions = {}): VdfDocument {
  const c: Cursor = { pos: 0 }
  skipTrivia(text, c)
  if (c.pos >= text.length) throw new VdfParseError('Empty document', 0)

  const key = readToken(text, c)
  skipTrivia(text, c)
  if (text[c.pos] !== '{') {
    throw new VdfParseError(`Expected "{" after top-level key "${key.value}"`, c.pos)
  }
  const root = parseNode(text, c, 0, options)

  skipTrivia(text, c)
  if (c.pos !== text.length) {
    throw new VdfParseError('Trailing content after top-level block', c.pos)
  }
  return { key: key.value, root }
}

/** Fill in a block that was left opaque by the initial parse. */
export function materialize(text: string, node: VdfNode): VdfNode {
  if (!node.opaque) return node
  if (text[node.start] !== '{') {
    throw new VdfParseError('Opaque node span does not start with "{"', node.start)
  }
  const c: Cursor = { pos: node.start }
  const parsed = parseNode(text, c, 0, {})
  if (parsed.end !== node.end) {
    throw new VdfParseError('Materialized block span does not match the recorded span', node.start)
  }
  node.entries = parsed.entries
  node.opaque = undefined
  return node
}

/**
 * Materialize a block and every opaque descendant. Required before cloning or
 * serializing a node, otherwise nested opaque blocks would serialize as `{}`.
 */
export function materializeDeep(text: string, node: VdfNode): VdfNode {
  materialize(text, node)
  for (const entry of node.entries) {
    if (isNode(entry.value)) materializeDeep(text, entry.value)
  }
  return node
}

// ---------------------------------------------------------------------------
// Lookups (KeyValues keys are matched case-insensitively)
// ---------------------------------------------------------------------------

export function isNode(value: VdfValue): value is VdfNode {
  return typeof value === 'object' && value !== null
}

export function find(node: VdfNode | undefined, key: string): VdfEntry | undefined {
  if (!node || node.opaque) return undefined
  const needle = key.toLowerCase()
  for (const entry of node.entries) if (entry.key.toLowerCase() === needle) return entry
  return undefined
}

export function findAll(node: VdfNode | undefined, key: string): VdfEntry[] {
  if (!node || node.opaque) return []
  const needle = key.toLowerCase()
  return node.entries.filter((entry) => entry.key.toLowerCase() === needle)
}

export function getString(node: VdfNode | undefined, key: string): string | undefined {
  const entry = find(node, key)
  return entry && !isNode(entry.value) ? entry.value : undefined
}

export function getStrings(node: VdfNode | undefined, key: string): string[] {
  return findAll(node, key)
    .map((entry) => entry.value)
    .filter((value): value is string => !isNode(value))
}

export function getNode(node: VdfNode | undefined, key: string): VdfNode | undefined {
  const entry = find(node, key)
  return entry && isNode(entry.value) ? entry.value : undefined
}

export function getNodes(node: VdfNode | undefined, key: string): VdfNode[] {
  return findAll(node, key)
    .map((entry) => entry.value)
    .filter(isNode)
}

// ---------------------------------------------------------------------------
// Mutation (used on cloned nodes, whose spans are intentionally discarded)
// ---------------------------------------------------------------------------

export function cloneNode(node: VdfNode): VdfNode {
  if (node.opaque) throw new Error('Cannot clone an opaque node — materialize it first')
  return {
    start: node.start,
    end: node.end,
    entries: node.entries.map((entry) => ({
      ...entry,
      value: isNode(entry.value) ? cloneNode(entry.value) : entry.value
    }))
  }
}

/** Replace the first entry with `key`, or append a new one. */
export function setEntry(node: VdfNode, key: string, value: VdfValue): void {
  const existing = find(node, key)
  if (existing) {
    existing.value = value
    return
  }
  node.entries.push({ key, value, keyStart: 0, keyEnd: 0, valueStart: 0, valueEnd: 0 })
}

export function setString(node: VdfNode, key: string, value: string): void {
  setEntry(node, key, value)
}

export function removeEntries(node: VdfNode, predicate: (entry: VdfEntry) => boolean): void {
  node.entries = node.entries.filter((entry) => !predicate(entry))
}

export function removeKey(node: VdfNode, key: string): void {
  const needle = key.toLowerCase()
  removeEntries(node, (entry) => entry.key.toLowerCase() === needle)
}

// ---------------------------------------------------------------------------
// Serialization
// ---------------------------------------------------------------------------

export function escapeToken(value: string): string {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
}

export function serializeValue(value: VdfValue, indent: number, eol: string): string {
  if (!isNode(value)) return escapeToken(value)
  if (value.opaque) throw new Error('Cannot serialize an opaque node — materialize it first')
  const pad = '\t'.repeat(indent)
  if (value.entries.length === 0) return `{}`
  const inner = '\t'.repeat(indent + 1)
  const parts = value.entries.map((entry) => {
    const key = escapeToken(entry.key)
    if (isNode(entry.value)) return `${inner}${key}${eol}${serializeValue(entry.value, indent + 1, eol)}`
    return `${inner}${key}\t\t${escapeToken(entry.value)}`
  })
  return `{${eol}${parts.join(eol)}${eol}${pad}}`
}

// ---------------------------------------------------------------------------
// Splices — the only way this module writes into the source document
// ---------------------------------------------------------------------------

export interface Splice {
  start: number
  end: number
  text: string
}

/**
 * Re-serialize a whole node over its own span. Used for the item blocks we touch:
 * each item is replaced exactly once, so splices can never overlap.
 */
export function spliceNode(node: VdfNode, eol: string, indent: number): Splice {
  return { start: node.start, end: node.end, text: serializeValue(node, indent, eol) }
}

/** Single-pass splice application: O(source length), never O(splices x length). */
export function applySplices(text: string, splices: Splice[]): string {
  if (splices.length === 0) return text
  const ordered = [...splices].sort((a, b) => a.start - b.start)
  const parts: string[] = []
  let cursor = 0
  for (const splice of ordered) {
    if (splice.end < splice.start) throw new Error(`Invalid splice at ${splice.start}-${splice.end}`)
    if (splice.start < cursor) throw new Error(`Overlapping splice at ${splice.start}-${splice.end}`)
    parts.push(text.slice(cursor, splice.start), splice.text)
    cursor = splice.end
  }
  parts.push(text.slice(cursor))
  return parts.join('')
}

/** Detect the dominant line ending so generated text matches the source. */
export function detectEol(text: string): string {
  const lf = text.indexOf('\n')
  if (lf > 0 && text[lf - 1] === '\r') return '\r\n'
  return '\n'
}
