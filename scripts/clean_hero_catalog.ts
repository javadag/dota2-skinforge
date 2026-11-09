/**
 * Cleans `data/heroes_catalog.json` after it is generated from the external catalog dataset.
 *
 *  - drops `is_hero` (this file only ever contains heroes),
 *  - drops `base_rc` (the dataset's internal resource-collection folder),
 *  - drops `abilities` (spell icon/FX metadata not used by SkinForge),
 *  - keeps `taunt.taunts`, dropping the unused `tp` / `run` / `delay` placeholders and each
 *    taunt's `sec` preview duration,
 *  - restores apostrophes in item, set and taunt names (`Drowned Horseman*s` ->
 *    `Drowned Horseman's`) so names match Valve's `items_game.txt`,
 *  - drops the unused per-item `iw` and `f` flags and the `title` key (always a copy of `name`),
 *  - resolves every item and taunt against `items_game.txt`, writes its numeric item id and
 *    drops entries that are not in the schema (community / catalog-only items).
 *
 * Usage:
 *   npm run clean:catalog            # write
 *   tsx scripts/clean_hero_catalog.ts --dry-run
 */

import fs from 'fs'
import path from 'path'
import { buildItemIndex, findItemId, normalizeWords, readItemsGameEntries, type ItemIndex, type SchemaItem } from './lib/itemIdIndex'

interface CatalogMod {
  id?: number
  name?: string
  title?: string
  iw?: unknown
  f?: unknown
  [key: string]: unknown
}

interface CatalogSlot {
  slot: string
  mods?: CatalogMod[]
  [key: string]: unknown
}

interface CatalogTaunt {
  name?: string
  sec?: unknown
  [key: string]: unknown
}

interface CatalogHero {
  is_hero?: unknown
  base_rc?: unknown
  abilities?: unknown
  taunt?: { taunts?: CatalogTaunt[]; [key: string]: unknown }
  gamesets?: Array<{ name?: string; [key: string]: unknown }>
  slots?: CatalogSlot[]
  [key: string]: unknown
}

type Catalog = Record<string, CatalogHero>

const CATALOG_PATH = path.resolve(__dirname, '../data/heroes_catalog.json')
const ITEMS_GAME_PATH = path.resolve(__dirname, 'items/items_game.txt')
const DRY_RUN = process.argv.includes('--dry-run')

const AND_RE = /\s+And\s+(Head|Helm|Hood|Crown|Shoulder|Shoulders|Back|Arms|Armor|Tail|Weapon|Misc|Scarf|Mask)\b/i
const TRAILING_SEGMENT_RE = /\s+-\s+[^-]+$/i
const QUALITY_RE =
  /\s+(Distinguished|Honored|Exalted|Genuine|Inscribed|Corrupted|Auspicious|Ascendant|Heroic|Unusual|Elder|Legacy|Autographed|Arcana|Base|Immortal|Transmuted|Prem|Premium|alt|new)$/i

function fixApostrophes(value: string): string {
  return value.replace(/\*/g, "'")
}

/**
 * The dataset suffixes variants of the same schema item (" - Distinguished", " alt",
 * " Part", "Shoulder And Head"). All of them resolve to the underlying item id.
 */
function nameVariants(name: string): string[] {
  const out = new Set<string>([name])
  let changed = true
  while (changed) {
    changed = false
    for (const value of [...out]) {
      const next = [
        value.replace(/\s+Part$/i, ''),
        value.replace(AND_RE, ''),
        value.replace(TRAILING_SEGMENT_RE, ''),
        value.replace(QUALITY_RE, '')
      ]
      for (const variant of next) {
        if (variant !== value && variant.trim() && !out.has(variant)) {
          out.add(variant)
          changed = true
        }
      }
    }
  }
  return [...out]
}

/** Hero folders whose name differs from the catalog hero tag. */
const HERO_FOLDERS: Record<string, string[]> = {
  antimage: ['antimage', 'antimage_female'],
  'centaur warrunner': ['centaur'],
  clockwerk: ['rattletrap'],
  'drow ranger': ['drow'],
  invoker: ['invoker', 'invoker_kid'],
  magnus: ['magnataur'],
  mirana: ['mirana', 'mirana_persona'],
  'naga siren': ['siren'],
  'natures prophet': ['furion'],
  necrophos: ['necrolyte'],
  'nyx assassin': ['nerubian_assassin'],
  'outworld devourer': ['obsidian_destroyer'],
  pudge: ['pudge', 'pudge_cute'],
  'queen of pain': ['queenofpain'],
  riki: ['rikimaru'],
  'shadow fiend': ['nevermore', 'shadow_fiend'],
  timbersaw: ['shredder'],
  tiny: ['tiny', 'tiny_01', 'tiny_02', 'tiny_03', 'tiny_04'],
  'treant protector': ['treant'],
  tusk: ['tuskarr'],
  'vengeful spirit': ['vengeful', 'vengefulspirit'],
  windranger: ['windrunner'],
  'wraith king': ['skeleton_king', 'wraith_king']
}

/** Slot words the dataset adds on top of the schema name. */
const SLOT_WORDS = new Set([
  'head',
  'heads',
  'helm',
  'helmet',
  'hood',
  'crown',
  'shoulder',
  'shoulders',
  'back',
  'arms',
  'arm',
  'armor',
  'tail',
  'weapon',
  'offhand',
  'hand',
  'misc',
  'belt',
  'legs',
  'leg',
  'neck',
  'mount',
  'summon',
  'body',
  'gloves',
  'mask',
  'scarf',
  'mane',
  'crystal',
  'bow',
  'scabbard',
  'mine',
  'tombstone',
  'ward'
])
/** Prefix words that mark a style/variant rather than a different set. */
const STYLE_WORDS = new Set([
  'immortal',
  'arcana',
  'golden',
  'royal',
  'celestial',
  'legacy',
  'lineage',
  'spring',
  'winter',
  'summer',
  'autumn',
  'chaotic',
  'ghostly',
  'infused',
  'exalted',
  'auspicious',
  'genuine',
  'distinguished',
  'honored',
  'base',
  'prem',
  'premium',
  'second',
  'third',
  'first'
])
/** Words that carry no set identity and may sit between two schema words. */
const coreWords = (words: string[]): string[] => words.filter((word) => !SLOT_WORDS.has(word) && word !== 'and')

const baseSlot = (slot: string): string => slot.replace(/_persona(_\d+)?$/, '')
const normKey = (value: string): string => value.toLowerCase().replace(/[^a-z0-9]/g, '')

interface HeroIndex {
  folders: Map<string, string[]>
  byFolder: Map<string, Array<{ id: number; words: string[]; slot: string }>>
}

function buildHeroIndex(entries: Map<number, SchemaItem>): HeroIndex {
  const all = new Set<string>()
  for (const item of entries.values()) if (item.hero) all.add(item.hero)

  const byFolder = new Map<string, Array<{ id: number; words: string[]; slot: string }>>()
  for (const [id, item] of entries) {
    if (!item.hero) continue
    const list = byFolder.get(item.hero) || []
    list.push({ id, words: normalizeWords(item.name), slot: baseSlot(item.slot) })
    byFolder.set(item.hero, list)
  }

  const folders = new Map<string, string[]>()
  for (const folder of all) {
    const base = normKey(folder.replace(/(_female|_kid|_cute|_persona|_\d+)$/, ''))
    const list = folders.get(base) || []
    list.push(folder)
    folders.set(base, list)
  }
  for (const [tag, list] of Object.entries(HERO_FOLDERS)) folders.set(normKey(tag), list)

  return { folders, byFolder }
}

/**
 * The dataset names some items after their set instead of the schema ("Sovereign's Crown"),
 * merges two pieces into one entry ("Helm And Belt of Deep Magma") and appends the equip slot
 * ("Blade of Cleaving Swiftness Offhand"). Resolve those inside the hero's own schema items only.
 */
function matchWithinHero(
  name: string,
  slot: string,
  heroTag: string,
  heroIndex: HeroIndex,
  entries: Map<number, SchemaItem>
): number | null {
  const folders = heroIndex.folders.get(normKey(heroTag))
  if (!folders) return null
  const candidates = folders.flatMap((folder) => heroIndex.byFolder.get(folder) || [])
  if (candidates.length === 0) return null

  // "Slardar Immortal Head ..." / "Juggernaut Arcana ..." prefix the hero's own name.
  const heroWords = new Set(normalizeWords(heroTag))
  const rawWords = normalizeWords(name)
  // Some names only mention the hero later on ("Edict of Shadows Valeera to Riki").
  const noHero = rawWords.filter((word) => !heroWords.has(word))
  // Drop every hero word when the name opens with one ("Bounty Hunter Booty Hunter"), else keep
  // the name as is ("Legacy of the Fallen Legion Chaotic").
  const words = heroWords.has(rawWords[0]) ? noHero : rawWords
  const content = coreWords(words)
  const noHeroContent = coreWords(noHero)
  const merged = /\band\b/i.test(name)
  const wanted = baseSlot(slot)

  const find = (query: string[]): number | null => {
    if (query.length < 2) return null
    const matches: Array<{ id: number; extra: number }> = []
    for (const candidate of candidates) {
      if (query.every((word) => candidate.words.includes(word))) {
        const extra = candidate.words.filter((word) => !query.includes(word))
        if (extra.length <= 2) matches.push({ id: candidate.id, extra: extra.length })
      } else if (candidate.words.every((word) => query.includes(word))) {
        // Catalog name carries style words ("Champion", "Prem", "Illustrious") or the second
        // piece of a merged entry ("Helm And Belt of X"). The schema name must still appear as
        // one unbroken run inside the catalog name, or a different set name ("Bounty Hunter
        // Booty Hunter - Armor") collapses onto a short schema name ("Armor of the Hunter").
        const extra = query.filter((word) => !candidate.words.includes(word))
        if (extra.length > 2) continue
        const lastSchemaWord = query.map((word) => candidate.words.includes(word)).lastIndexOf(true)
        const before = query.slice(0, lastSchemaWord)
        const leading = before.filter((word) => !candidate.words.includes(word) && word !== 'and')
        const styleOnly = leading.every((word) => STYLE_WORDS.has(word))
        if (leading.length <= 1 || styleOnly || (merged && leading.length <= 2)) {
          matches.push({ id: candidate.id, extra: extra.length })
        }
      }
    }
    if (matches.length === 0) return null
    matches.sort((a, b) => a.extra - b.extra)
    const best = matches.filter((match) => match.extra === matches[0].extra)
    if (best.length === 1) return best[0].id

    // "Helm And Belt of X" -> the piece whose schema slot is the catalog slot.
    const bySlot = best.filter((match) => entries.get(match.id)!.slot === wanted)
    if (bySlot.length === 1) return bySlot[0].id
    const pool = bySlot.length > 0 ? bySlot : best
    // "Crown And Bonds of Madness" -> the piece whose slot word is in the catalog name.
    const hinted = pool.filter((match) =>
      normalizeWords(entries.get(match.id)!.name).some((word) => SLOT_WORDS.has(word) && !content.includes(word) && words.includes(word))
    )
    return hinted.length === 1 ? hinted[0].id : null
  }

  // Prefer the full name (keeps "Acolyte of Vengeance Hooded Mask" apart from the other pieces),
  // then fall back to the name without equip-slot words.
  return find(words) ?? find(content) ?? find(noHero) ?? find(noHeroContent)
}

function resolveItemId(
  name: string,
  index: ItemIndex,
  heroTag: string,
  slot: string,
  heroIndex: HeroIndex | null,
  entries: Map<number, SchemaItem> | null,
  taunt = false
): number | null {
  const candidates = nameVariants(name)
  if (taunt) candidates.unshift(`Taunt: ${name}`)
  for (const candidate of candidates) {
    const id = findItemId(candidate, index)
    if (id !== null) return id
  }
  if (taunt || !heroIndex || !entries) return null
  return matchWithinHero(name, slot, heroTag, heroIndex, entries)
}

interface Stats {
  heroes: number
  namesFixed: number
  tauntNamesFixed: number
  setNamesFixed: number
  titlesRemoved: number
  modsBefore: number
  modsKept: number
  modsDropped: number
  recovered: number
  recoveredNames: string[]
  tauntsBefore: number
  tauntsKept: number
  tauntsDropped: number
  slotsRemoved: number
  droppedByHero: Record<string, number>
}

function cleanHero(
  tag: string,
  hero: CatalogHero,
  index: ItemIndex,
  heroIndex: HeroIndex,
  entries: Map<number, SchemaItem>,
  stats: Stats
): void {
  delete hero.is_hero
  delete hero.base_rc
  delete hero.abilities
  delete hero.taunt

  for (const set of hero.gamesets || []) {
    if (typeof set.name === 'string' && set.name.includes('*')) {
      set.name = fixApostrophes(set.name)
      stats.setNamesFixed++
    }
  }

  const slots = (hero.slots || []).filter((slot) => {
    if (slot.slot === 'taunt') return false
    const kept = (slot.mods || []).filter((mod) => {
      delete mod.iw
      delete mod.f
      if ('title' in mod) stats.titlesRemoved++
      delete mod.title
      if (typeof mod.name === 'string' && mod.name.includes('*')) {
        mod.name = fixApostrophes(mod.name)
        stats.namesFixed++
      }
      if (typeof mod.name !== 'string') return false
      if (/diretide shimmer costume/i.test(mod.name)) return false

      const direct = nameVariants(mod.name).some((variant) => findItemId(variant, index) !== null)
      const id = resolveItemId(mod.name, index, tag, slot.slot, heroIndex, entries)
      if (id === null) {
        stats.modsDropped++
        return false
      }
      if (!direct) {
        stats.recovered++
        stats.recoveredNames.push(`${tag} | ${slot.slot} | ${mod.name} -> ${id}`)
      }
      mod.id = id
      stats.modsKept++
      return true
    })

    slot.mods = kept
    if (kept.length === 0) {
      stats.slotsRemoved++
      return false
    }
    return true
  })

  hero.slots = slots
}

function main(): void {
  if (!fs.existsSync(ITEMS_GAME_PATH)) {
    console.error(`Error: items_game.txt not found at ${ITEMS_GAME_PATH}`)
    process.exit(1)
  }

  const catalog = JSON.parse(fs.readFileSync(CATALOG_PATH, 'utf8')) as Catalog
  const entries = readItemsGameEntries(ITEMS_GAME_PATH)
  const index = buildItemIndex(new Map([...entries].map(([id, item]) => [id, item.name])))
  const heroIndex = buildHeroIndex(entries)

  const stats: Stats = {
    heroes: 0,
    namesFixed: 0,
    tauntNamesFixed: 0,
    setNamesFixed: 0,
    titlesRemoved: 0,
    modsBefore: 0,
    modsKept: 0,
    modsDropped: 0,
    recovered: 0,
    recoveredNames: [],
    tauntsBefore: 0,
    tauntsKept: 0,
    tauntsDropped: 0,
    slotsRemoved: 0,
    droppedByHero: {}
  }

  for (const [tag, hero] of Object.entries(catalog)) {
    stats.heroes++
    for (const slot of hero.slots || []) stats.modsBefore += slot.mods?.length || 0
    stats.tauntsBefore += hero.taunt?.taunts?.length || 0

    const droppedBefore = stats.modsDropped
    cleanHero(tag, hero, index, heroIndex, entries, stats)
    const dropped = stats.modsDropped - droppedBefore
    if (dropped > 0) stats.droppedByHero[tag] = dropped
  }

  if (!DRY_RUN) {
    fs.writeFileSync(CATALOG_PATH, JSON.stringify(catalog, null, 2) + '\n', 'utf8')
  }

  console.log(`${DRY_RUN ? 'Dry run — ' : ''}Cleaned ${stats.heroes} heroes in ${path.relative(process.cwd(), CATALOG_PATH)}`)
  console.log(`  items: ${stats.modsBefore} -> ${stats.modsKept} (dropped ${stats.modsDropped})`)
  console.log(`  taunts: ${stats.tauntsBefore} -> ${stats.tauntsKept} (dropped ${stats.tauntsDropped})`)
  console.log(`  empty slots removed: ${stats.slotsRemoved}, titles removed: ${stats.titlesRemoved}`)
  console.log(
    `  apostrophes restored: ${stats.namesFixed} item names, ${stats.setNamesFixed} set names, ${stats.tauntNamesFixed} taunt names`
  )
  console.log(`  matched through hero/slot fallback: ${stats.recovered}`)
  if (DRY_RUN) for (const line of stats.recoveredNames) console.log(`    ${line}`)

  const top = Object.entries(stats.droppedByHero)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
  if (top.length > 0) {
    console.log(`  most dropped: ${top.map(([tag, count]) => `${tag} ${count}`).join(', ')}`)
  }
}

main()
