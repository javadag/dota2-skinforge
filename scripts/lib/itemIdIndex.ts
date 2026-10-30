/**
 * Resolves catalog display names to Valve `items_game.txt` item ids.
 *
 * The catalog uses display names ("Announcer: Axe"), while the schema keeps an internal
 * name per numeric item id. Matching is progressively looser: exact, normalised, token-set,
 * style suffix, category-word stripped and finally a qualifier-only subset.
 */

import fs from 'fs'

export interface ItemIndex {
  byName: Map<string, number>
  byKey: Map<string, number>
  keyWords: Map<string, string[]>
}

const STOP_WORDS = new Set(['the', 'and', 'of', 'ft', 'feat', 'by', 'for', 'a'])
const NOISE_WORDS = new Set(['hud', 'announcer', 'music', 'pack', 'ward', 'cursor', 'screen', 'loading', 'style', 'level', 'bundle'])
/** Extra words the catalog omits but the schema keeps. */
const QUALIFIERS = new Set([
  'ft',
  'feat',
  'wayne',
  'june',
  '10th',
  'anniversary',
  'sand',
  'sands',
  'baby',
  'seasonal',
  'terrain',
  'interdimensional'
])

export interface SchemaItem {
  name: string
  /** Valve `item_slot` (head, weapon, back, ...), empty when the item has none. */
  slot: string
  /** Hero folder from `image_inventory` (`econ/items/<hero>/...`), empty for non-hero items. */
  hero: string
}

/** Like `readItemsGame`, but keeps the fields needed to match heroes and slots. */
export function readItemsGameEntries(filePath: string): Map<number, SchemaItem> {
  const text = fs.readFileSync(filePath, 'utf8')
  let p = 0

  const isSpace = (c: number) => c === 32 || c === 9 || c === 10 || c === 13 || c === 11 || c === 12 || c === 0xfeff
  const skipWs = (): void => {
    while (p < text.length) {
      const c = text.charCodeAt(p)
      if (isSpace(c)) {
        p++
        continue
      }
      if (c === 47 && text.charCodeAt(p + 1) === 47) {
        while (p < text.length && text[p] !== '\n') p++
        continue
      }
      if (c === 47 && text.charCodeAt(p + 1) === 42) {
        const end = text.indexOf('*/', p + 2)
        p = end < 0 ? text.length : end + 2
        continue
      }
      break
    }
  }
  const readString = (): string => {
    skipWs()
    if (text[p] !== '"') throw new Error(`items_game: expected string at offset ${p}`)
    p++
    let out = ''
    while (p < text.length) {
      const ch = text[p]
      if (ch === '\\' && (text[p + 1] === '"' || text[p + 1] === '\\')) {
        out += text[p + 1]
        p += 2
        continue
      }
      if (ch === '"') {
        p++
        return out
      }
      out += ch
      p++
    }
    throw new Error('items_game: unterminated string')
  }
  const skipBlock = (): void => {
    skipWs()
    if (text[p] !== '{') throw new Error(`items_game: expected block at offset ${p}`)
    let depth = 0
    while (p < text.length) {
      const ch = text[p]
      if (ch === '"') {
        readString()
        continue
      }
      if (ch === '{') depth++
      else if (ch === '}' && --depth === 0) {
        p++
        return
      }
      p++
    }
    throw new Error('items_game: unterminated block')
  }
  const enter = (key: string): void => {
    if (readString() !== key) throw new Error(`items_game: expected "${key}"`)
    skipWs()
    if (text[p] !== '{') throw new Error(`items_game: expected block after "${key}"`)
    p++
  }

  enter('items_game')

  while (true) {
    const key = readString()
    skipWs()
    if (text[p] !== '{') {
      readString()
      continue
    }
    if (key === 'items') {
      p++
      break
    }
    skipBlock()
  }

  const items = new Map<number, SchemaItem>()
  while (true) {
    skipWs()
    if (text[p] === '}') break
    const id = Number(readString())
    skipWs()
    if (text[p] !== '{') throw new Error(`items_game: expected item block at offset ${p}`)
    p++
    let name = ''
    let slot = ''
    let inventory = ''
    let model = ''
    while (true) {
      skipWs()
      if (text[p] === '}') {
        p++
        break
      }
      const key = readString()
      skipWs()
      if (text[p] === '{') skipBlock()
      else {
        const value = readString()
        if (key === 'name') name = value
        else if (key === 'item_slot') slot = value
        else if (key === 'image_inventory') inventory = value
        else if (key === 'model_player') model = value
      }
    }
    if (!name) continue
    const hero = /^econ\/items\/([^/]+)\//.exec(inventory)?.[1] ?? /^models\/items\/([^/]+)\//.exec(model)?.[1] ?? ''
    items.set(id, { name, slot, hero })
  }

  return items
}

export function readItemsGame(filePath: string): Map<number, string> {
  return new Map([...readItemsGameEntries(filePath)].map(([id, item]) => [id, item.name]))
}

export function normalizeWords(value: string): string[] {
  const expanded = value
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/megakills?/gi, 'mega kill')
    .replace(/killstreaks?/gi, 'kill streak')
    .replace(/versus\s*screen/gi, 'versus screen')
  return expanded
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(' ')
    .filter((word) => word && !STOP_WORDS.has(word))
    .map((word) => (word.length > 3 && word.endsWith('s') ? word.slice(0, -1) : word))
}

const keyOf = (value: string): string => normalizeWords(value).sort().join(' ')

export function buildItemIndex(items: Map<number, string>): ItemIndex {
  const byName = new Map<string, number>()
  const byKey = new Map<string, number>()
  const keyWords = new Map<string, string[]>()

  for (const [id, name] of items) {
    if (!byName.has(name)) byName.set(name, id)
    const key = keyOf(name)
    if (!byKey.has(key)) {
      byKey.set(key, id)
      keyWords.set(key, key.split(' '))
    }
  }

  return { byName, byKey, keyWords }
}

export function findItemId(rawName: string, index: ItemIndex, aliases: Record<string, string> = {}): number | null {
  const name = rawName.replace(/^terrain\s*[-–:]\s*/i, '')
  const alias = aliases[rawName] ?? aliases[name]
  const candidates = alias ? [alias] : [name]

  for (const candidate of candidates) {
    if (index.byName.has(candidate)) return index.byName.get(candidate)!
    if (index.byKey.has(keyOf(candidate))) return index.byKey.get(keyOf(candidate))!
  }

  // "Beaver Knight Style 1" -> "Beaver Knight"
  const styleBase = name.replace(/\s*(?:-\s*)?style\s*\d+$/i, '')
  if (styleBase !== name) {
    if (index.byName.has(styleBase)) return index.byName.get(styleBase)!
    if (index.byKey.has(keyOf(styleBase))) return index.byKey.get(keyOf(styleBase))!
  }

  // "Antiquity HUD" -> "Antiquity"
  const noiseStripped = normalizeWords(name)
    .filter((word) => !NOISE_WORDS.has(word))
    .join(' ')
  if (noiseStripped && index.byKey.has(noiseStripped)) return index.byKey.get(noiseStripped)!

  // Subset matches: the schema name carries qualifiers the catalog drops ("(ft. Wayne June)"),
  // or the catalog carries a category word the schema item omits ("Antiquity HUD").
  const words = normalizeWords(name)
  let best: { id: number; extra: number } | null = null
  for (const [key, schemaWords] of index.keyWords) {
    let extra: string[] | null = null
    if (schemaWords.length > words.length && schemaWords.length - words.length <= 4) {
      if (words.every((word) => schemaWords.includes(word))) extra = schemaWords.filter((word) => !words.includes(word))
    } else if (words.length > schemaWords.length && words.length >= 2) {
      if (schemaWords.every((word) => words.includes(word))) {
        const diff = words.filter((word) => !schemaWords.includes(word))
        if (diff.every((word) => NOISE_WORDS.has(word))) extra = diff
      }
    }
    if (!extra) continue
    const qualifiersOnly = schemaWords.length > words.length ? extra.every((word) => QUALIFIERS.has(word)) : true
    if (!qualifiersOnly) continue
    if (!best || extra.length < best.extra) best = { id: index.byKey.get(key)!, extra: extra.length }
  }

  return best?.id ?? null
}
