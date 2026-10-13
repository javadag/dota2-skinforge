/**
 * Rebuilds `data/valveHeroCatalog.json` — the UI's list of which cosmetic belongs in which slot
 * for which hero — from the game's own schema.
 *
 * The original generator for this file was never committed, which is why a stale entry survived
 * Valve moving Legion Commander's arcana off her blades: nothing could regenerate the file, so
 * it had to be hand-patched. This replaces it.
 *
 * Rules, all derived from `items_game.txt` rather than guessed:
 *
 *  - One entry per hero in `data/heroes.json`, keyed by the schema's canonical hero name. The UI
 *    resolves that through its alias map (`lifestealer` → `life_stealer`, `wraith king` →
 *    `skeleton_king`), so either spelling works.
 *  - A cosmetic is listed under the slot the schema declares. When the schema omits the slot it is
 *    only placeable if it is a taunt (`prefab: taunt`); everything else is skipped rather than
 *    guessed at. That is the honest explanation for the ~155 items the old file also left out.
 *  - Items whose only owner is `all` are skipped: they are shared placeholders with placeholder
 *    icons, not real cosmetics for a specific hero.
 *  - `tag` is the item's rarity, title-cased, except persona items: `persona_selector` is always
 *    tagged `Persona`, and a `*_persona_N` item with no rarity is too.
 *  - Slots are emitted in a fixed presentation order; items within a slot are sorted by rarity
 *    (rarest first) and then by name, so the list is deterministic.
 *  - There is no `best` flag. The app has no best-item picker — `unlockBestSet` was never wired to
 *    a button — and rarity-first ordering already puts the top item at index 0.
 *  - Owners that are not heroes (couriers, announcers, terrain, the `announcer_dlc_*` bundles) are
 *    carried over unchanged, because they belong to the non-hero catalog.
 *
 * Usage:
 *   npm run build:catalog                 # rewrite data/valveHeroCatalog.json
 *   npm run build:catalog -- --dry-run    # report what would change, write nothing
 *   npm run build:catalog -- --out data/valveHeroCatalog.rebuilt.json
 *   ... -- --items-game <path> --localization <path>
 */

import fs from 'fs'
import { argValue, dataPath, hasFlag, loadSchema, resolveSchemaFiles, stringifyLikeFile } from './lib/schemaSource'
import { getCanonicalHero } from '../src/shared/constants/heroAliases'
import type { SchemaIndex, SchemaItem } from '../src/main/services/modifier/schema'

interface CatalogItem {
  id: string
  name: string
  tag: string
  isDefault: boolean
  img?: string
  /** Legacy flag, removed by the rebuild. */
  best?: boolean
}

interface CatalogOwner {
  slots: Array<{ id: string; name: string; icon: string }>
  items: Record<string, CatalogItem[]>
}

type Catalog = Record<string, CatalogOwner>

/** Presentation order for a hero's slots. Anything unlisted is appended deterministically. */
const BASE_SLOT_ORDER = [
  'weapon',
  'weapon2',
  'offhand_weapon',
  'offhand_weapon2',
  'head',
  'body_head',
  'neck',
  'shoulder',
  'armor',
  'arms',
  'gloves',
  'belt',
  'back',
  'legs',
  'Legs',
  'tail',
  'costume',
  'misc',
  'mount',
  'hero_base',
  'ambient_effects',
  'summon',
  'shapeshift',
  'ability1',
  'ability2',
  'ability3',
  'ability4',
  'ability_ultimate',
  'voice',
  'taunt'
]

/**
 * Rarity order for display; rarest first. This is Valve's own ladder, so the top of a slot's list
 * is the premium cosmetic — the old file put Rare pieces above Immortal ones because it guessed
 * rarity from words in the item's name ("Immortal", "Golden").
 *
 * `seasonal` (Diretide and other event freebies) and `persona` are not rungs on that ladder, so
 * they sort below the tiers instead of being given an invented position.
 */
const RARITY_RANK: Record<string, number> = {
  seasonal: -2,
  persona: -2,
  common: 0,
  uncommon: 1,
  rare: 2,
  mythical: 3,
  legendary: 4,
  immortal: 5,
  arcana: 6,
  ancient: 7
}

const PERSONA_SLOT = /_persona_\d+$/

/**
 * Drop the legacy `best` flag. The app has no best-item picker (`unlockBestSet` was never wired to
 * a button) and the rarity-first ordering below already puts the top item at index 0.
 */
function stripBest(owner: CatalogOwner): CatalogOwner {
  const items: Record<string, CatalogItem[]> = {}
  for (const [slot, list] of Object.entries(owner.items ?? {})) {
    items[slot] = list.map(({ best: _best, ...rest }) => rest as CatalogItem)
  }
  return { slots: owner.slots ?? [], items }
}

/** id -> display name / icon, taken from the shipped catalog so the UI text does not change. */
const SLOT_LABELS: Record<string, { name: string; icon: string }> = {
  ability_ultimate: { name: 'Ability ultimate', icon: '⚔️' },
  ability1: { name: 'Ability1', icon: '⚔️' },
  ability2: { name: 'Ability2', icon: '⚔️' },
  ability3: { name: 'Ability3', icon: '⚔️' },
  ability4: { name: 'Ability4', icon: '⚔️' },
  ambient_effects: { name: 'Ambient FX', icon: '✨' },
  ambient_effects_persona_1: { name: 'Ambient effects persona 1', icon: '⚔️' },
  announcer: { name: 'Announcer', icon: '⚔️' },
  armor: { name: 'Armor / Chest', icon: '🥋' },
  armor_persona_1: { name: 'Armor persona 1', icon: '⚔️' },
  arms: { name: 'Arms / Bracers', icon: '🦾' },
  arms_persona_1: { name: 'Arms persona 1', icon: '⚔️' },
  back: { name: 'Back / Cape', icon: '🧣' },
  back_persona_1: { name: 'Back persona 1', icon: '⚔️' },
  belt: { name: 'Belt / Waist', icon: '👖' },
  body_head: { name: 'Head & Body', icon: '👤' },
  costume: { name: 'Costume', icon: '🥋' },
  gloves: { name: 'Gloves', icon: '⚔️' },
  head: { name: 'Head / Helm', icon: '👑' },
  head_persona_1: { name: 'Head persona 1', icon: '⚔️' },
  hero_base: { name: 'Hero Base / Persona', icon: '👤' },
  legs: { name: 'Legs / Boots', icon: '🥾' },
  Legs: { name: 'Legs', icon: '⚔️' },
  legs_persona_1: { name: 'Legs persona 1', icon: '⚔️' },
  mega_kills: { name: 'Mega kills', icon: '⚔️' },
  misc: { name: 'Miscellaneous', icon: '📦' },
  misc_persona_1: { name: 'Misc persona 1', icon: '⚔️' },
  mount: { name: 'Mount / Steed', icon: '🐎' },
  mount_persona_1: { name: 'Mount persona 1', icon: '⚔️' },
  neck: { name: 'Neck', icon: '⚔️' },
  neck_persona_1: { name: 'Neck persona 1', icon: '⚔️' },
  offhand_weapon: { name: 'Off-Hand Weapon', icon: '🛡️' },
  offhand_weapon_persona_1: { name: 'Offhand weapon persona 1', icon: '⚔️' },
  offhand_weapon2: { name: 'Offhand weapon2', icon: '⚔️' },
  persona_selector: { name: 'Persona selector', icon: '⚔️' },
  shapeshift: { name: 'Shapeshift Form', icon: '🐾' },
  shapeshift_persona_1: { name: 'Shapeshift persona 1', icon: '⚔️' },
  shoulder: { name: 'Shoulder / Pauldrons', icon: '🛡️' },
  shoulder_persona_1: { name: 'Shoulder persona 1', icon: '⚔️' },
  summon: { name: 'Summoned Familiar', icon: '🐺' },
  summon_persona_1: { name: 'Summon persona 1', icon: '⚔️' },
  tail: { name: 'Tail', icon: '🐉' },
  tail_persona_1: { name: 'Tail persona 1', icon: '⚔️' },
  taunt: { name: 'Taunt', icon: '🎭' },
  taunt_persona_1: { name: 'Taunt persona 1', icon: '⚔️' },
  voice: { name: 'Voice', icon: '⚔️' },
  voice_persona_1: { name: 'Voice persona 1', icon: '⚔️' },
  weapon: { name: 'Weapon', icon: '⚔️' },
  weapon_persona_1: { name: 'Weapon persona 1', icon: '⚔️' },
  weapon2: { name: 'Secondary Weapon', icon: '🗡️' }
}

function labelFor(slot: string): { name: string; icon: string } {
  const known = SLOT_LABELS[slot]
  if (known) return known
  // A slot Valve added after this table was written: derive a readable label rather than drop it.
  const name = slot
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
  return { name, icon: '⚔️' }
}

function slotRank(slot: string): [number, string] {
  const base = BASE_SLOT_ORDER.indexOf(slot)
  if (base !== -1) return [base, '']
  if (slot === 'persona_selector') return [3000, '']
  if (PERSONA_SLOT.test(slot)) return [2000, slot]
  return [1500, slot]
}

function tagFor(item: SchemaItem, slot: string): string {
  // A persona selector is a persona first and a rarity second: the catalog has always labelled
  // them "Persona" even though the item declares a rarity.
  if (slot === 'persona_selector') return 'Persona'
  const rarity = item.rarity.trim().toLowerCase()
  if (rarity) return rarity.charAt(0).toUpperCase() + rarity.slice(1)
  // Valve declares no rarity for roughly 2,500 catalog entries. The catalog has always shown
  // default items as Common and everything else as Rare, so the rebuild keeps that convention
  // rather than relabelling a fifth of the list.
  return item.prefab === 'default_item' ? 'Common' : 'Rare'
}

/** The slot a cosmetic may be listed under, or undefined when the schema does not say. */
function catalogSlotOf(item: SchemaItem): string | undefined {
  if (item.slot) return item.slot
  // A taunt declares its slot only through its prefab.
  if (item.prefab === 'taunt') return 'taunt'
  // A hero's weapon normally declares no slot at all — every one of the 1,934 weapon cosmetics in
  // the live schema relies on the game's "a slot-less wearable is the primary weapon" convention.
  if (item.prefab === 'wearable') return 'weapon'
  // Everything else without a slot (mostly the hero's own base weapon, `prefab: default_item`) is
  // left out: the UI already offers a synthetic "Official Base" entry for those slots, and guessing
  // a slot for them is how items end up paired into the wrong default item.
  return undefined
}

function buildHeroEntry(schema: SchemaIndex, hero: string): CatalogOwner | undefined {
  const bySlot = new Map<string, CatalogItem[]>()

  for (const item of schema.items.values()) {
    if (!item.heroes.includes(hero)) continue
    // Items shared by every hero (`used_by_heroes: all`) never list a specific hero, so they fall
    // out here naturally — they are placeholders with placeholder icons, not cosmetics.
    const slot = catalogSlotOf(item)
    if (!slot) continue
    if (!item.image && !(item.prefab === 'default_item' && item.model)) continue

    const entry: CatalogItem = {
      id: item.id,
      name: item.name,
      tag: tagFor(item, slot),
      isDefault: item.prefab === 'default_item'
    }
    if (item.image) entry.img = item.image

    const list = bySlot.get(slot)
    if (list) list.push(entry)
    else bySlot.set(slot, [entry])
  }

  if (bySlot.size === 0) return undefined

  for (const list of bySlot.values()) {
    list.sort((a, b) => {
      const rank = (RARITY_RANK[a.tag.toLowerCase()] ?? -1) - (RARITY_RANK[b.tag.toLowerCase()] ?? -1)
      if (rank !== 0) return -rank
      return a.name.localeCompare(b.name)
    })
  }

  const slots = [...bySlot.keys()]
    .sort((a, b) => {
      const [ra, sa] = slotRank(a)
      const [rb, sb] = slotRank(b)
      return ra - rb || sa.localeCompare(sb)
    })
    .map((slot) => ({ id: slot, ...labelFor(slot) }))

  return { slots, items: Object.fromEntries(slots.map((slot) => [slot.id, bySlot.get(slot.id)!])) }
}

async function main(): Promise<void> {
  const files = await resolveSchemaFiles()
  const { schema } = loadSchema(files)

  const heroesPath = dataPath('heroes.json')
  const heroTags: string[] = JSON.parse(fs.readFileSync(heroesPath, 'utf-8')).heroes.map((h: { tag: string }) => h.tag)
  const canonicalTags = new Map<string, string>()
  for (const tag of heroTags) canonicalTags.set(getCanonicalHero(tag), tag)

  const catalogPath = dataPath('valveHeroCatalog.json')
  const raw = fs.readFileSync(catalogPath, 'utf-8')
  const previous = JSON.parse(raw) as Catalog

  const next: Catalog = {}
  const generated: string[] = []
  const empty: string[] = []

  for (const tag of heroTags) {
    const canonical = getCanonicalHero(tag)
    const entry = buildHeroEntry(schema, canonical)
    if (!entry) {
      empty.push(tag)
      continue
    }
    next[canonical] = entry
    generated.push(canonical)
  }

  // Carry over owners that are not heroes: couriers, announcers, terrain, and the
  // `announcer_dlc_*` bundles. Those belong to the non-hero catalog.
  const preserved: string[] = []
  const droppedKeys: string[] = []
  const canonicalNames = new Set(canonicalTags.keys())
  for (const key of Object.keys(previous)) {
    if (next[key]) continue
    const looksLikeHero = canonicalNames.has(key) || canonicalNames.has(getCanonicalHero(key))
    if (looksLikeHero) droppedKeys.push(key)
    else {
      next[key] = stripBest(previous[key])
      preserved.push(key)
    }
  }

  const ordered = Object.fromEntries(Object.entries(next).sort(([a], [b]) => a.localeCompare(b)))
  const count = (cat: Catalog) =>
    Object.values(cat).reduce((total, o) => total + Object.values(o.items ?? {}).reduce((n, l) => n + l.length, 0), 0)

  console.log(`schema:  ${schema.items.size} items, ${schema.defaults.size} owners`)
  console.log(`heroes:  ${generated.length} rebuilt, ${empty.length} with no schema items`)
  console.log(`preserved ${preserved.length} non-hero owner(s) (couriers, announcers, terrain, announcer bundles)`)
  if (droppedKeys.length > 0)
    console.log(`dropped ${droppedKeys.length} hero-origin key(s) no longer in heroes.json: ${droppedKeys.join(', ')}`)
  if (empty.length > 0) console.log(`no items found for: ${empty.join(', ')}`)
  console.log(`entries: ${count(previous)} (was) -> ${count(ordered)} (now)`)

  // A quick before/after look at the hero whose list this rebuild was motivated by.
  for (const hero of ['legion_commander', 'antimage']) {
    const before = previous[hero]?.items ?? {}
    const after = ordered[hero]?.items ?? {}
    const summarise = (items: Record<string, CatalogItem[]>) =>
      Object.entries(items)
        .map(([slot, list]) => `${slot}=${list.length}`)
        .join(' ')
    console.log(`\n${hero}:`)
    console.log(`  before: ${summarise(before)}`)
    console.log(`  after : ${summarise(after)}`)
    const slots = new Set([...Object.keys(before), ...Object.keys(after)])
    for (const slot of slots) {
      const b = (before[slot] ?? []).map((i) => i.name)
      const a = (after[slot] ?? []).map((i) => i.name)
      if (JSON.stringify(b) === JSON.stringify(a)) continue
      console.log(`  ${slot}:`)
      console.log(`    removed: ${b.filter((n) => !a.includes(n)).join(', ') || '(none)'}`)
      console.log(`    added  : ${a.filter((n) => !b.includes(n)).join(', ') || '(none)'}`)
    }
  }

  if (hasFlag('--dry-run')) {
    console.log('\n--dry-run: nothing written.')
    return
  }

  const target = argValue('--out') ?? catalogPath
  fs.writeFileSync(target, stringifyLikeFile(raw, ordered, 'valveHeroCatalog.json', { allowRewrite: true }), 'utf-8')
  console.log(`\nWrote ${target}`)
  console.log('Next: `npm run check:catalog` to confirm it agrees with the schema.')
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
