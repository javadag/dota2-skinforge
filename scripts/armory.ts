/**
 * The armory tool: rebuild, validate, and repair `data/heroes_armory.json`.
 *
 * The armory is generated from the game's own `items_game.txt`:
 *
 *   { "<hero>": { tag, variant_default?, slots: [{ slot, title, empty_img?, mods: [
 *       { id, name, rarity?, img? } ] }], ... } }
 *
 * Item icons use the `image_inventory` path (`econ/items/...`), which is exactly the key the
 * R2 icon sync uploads, so the renderer resolves them through `skinforge-icon://`.
 *
 * Style variants of one item are emitted as separate mods with a `- <style>` suffix and sorted
 * next to each other instead of being scattered by rarity.
 *
 * Modes:
 *
 *   npm run armory                 # rebuild from items_game.txt, then verify what it wrote
 *   npm run armory:check           # validate the shipped file against the schema; exit 1 on drift
 *   npm run armory:fix             # apply the safe repairs in place, then re-check
 *   npm run armory -- --dry-run    # same, without writing
 *
 * Every mode accepts `--items-game <path> --localization <path>` to use explicit schema files,
 * and build accepts `--out <path>` to write somewhere else.
 */

import fs from 'fs'

import { argValue, dataPath, hasFlag, loadSchema, resolveSchemaFiles, stringifyLikeFile } from './lib/schemaSource'
import {
  armoryEntryCount,
  armorySlotFor,
  collectArmoryFindings,
  schemaSlotForArmorySlot,
  type Armory,
  type ArmoryMod as Mod,
  type ArmoryOwner as HeroEntry,
  type ArmorySet,
  type ArmorySlot as Slot,
  type Finding
} from './lib/armoryCheck'
import { getCanonicalHero } from '../src/shared/constants/heroAliases'
import { defaultFor, type SchemaIndex, type SchemaItem } from '../src/main/services/modifier/schema'
import { getNode, getString, materializeDeep, type VdfNode } from '../src/main/services/modifier/vdf'
import { styleOptions } from '../src/main/services/modifier/visuals'

/** Presentation order for slots that are not already ordered by the previous armory. */
const SLOT_ORDER = [
  'weapon',
  'offhand_weapon',
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
  'tail',
  'misc',
  'mount',
  'summon',
  'shapeshift',
  'hero_base',
  'persona',
  'persona_head',
  'persona_shoulder',
  'persona_armor',
  'persona_arms',
  'persona_gloves',
  'persona_belt',
  'persona_back',
  'persona_legs',
  'persona_weapon',
  'persona_offhand_weapon',
  'persona_misc',
  'persona_mount',
  'persona_tail',
  'ambient_effects',
  'ability1',
  'ability2',
  'ability3',
  'ability4',
  'ability_ultimate',
  'voice'
]

const SLOT_TITLES: Record<string, string> = {
  head: 'Head',
  body_head: 'Head & Body',
  weapon: 'Weapon',
  offhand_weapon: 'Off-Hand Weapon',
  back: 'Back',
  arms: 'Arms',
  shoulder: 'Shoulder',
  belt: 'Belt',
  armor: 'Armor',
  legs: 'Legs',
  neck: 'Neck',
  gloves: 'Gloves',
  tail: 'Tail',
  misc: 'Misc',
  mount: 'Mount',
  summon: 'Summon',
  shapeshift: 'Shapeshift',
  hero_base: 'Base',
  persona: 'Persona',
  ambient_effects: 'Ambient FX',
  voice: 'Voice'
}

function titleFor(slot: string, previous?: Slot): string {
  if (previous?.title) return previous.title
  if (SLOT_TITLES[slot]) return SLOT_TITLES[slot]
  return slot
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

function rarityOf(item: SchemaItem): string | undefined {
  const rarity = item.rarity.trim().toLowerCase()
  return rarity || undefined
}

function styleMods(schema: SchemaIndex, text: string, item: SchemaItem): Mod[] {
  const node = materializeDeep(text, item.entry.value as VdfNode)
  const visuals = getNode(node, 'visuals')
  const styles = styleOptions(schema, visuals)

  const base: Mod = { id: Number(item.id), name: item.name }
  const rarity = rarityOf(item)
  if (rarity) base.rarity = rarity
  if (item.image) base.img = item.image

  if (styles.length <= 1) return [base]

  const alternateIcons = visuals ? getNode(visuals, 'alternate_icons') : undefined
  const rows: Mod[] = []
  const seen = new Set<string>()
  for (const style of styles) {
    const mod: Mod = { ...base }
    if (style.index > 0) mod.name = `${item.name} - ${style.name}`
    const icon = alternateIcons && !alternateIcons.opaque ? getNode(alternateIcons, String(style.index)) : undefined
    const iconPath = icon ? getString(icon, 'icon_path') : undefined
    if (iconPath) mod.img = iconPath
    // Valve ships some styles that localize to one label and one skin — the three
    // "Vote Only" King of Vipers styles, for instance. The picker cannot tell those
    // apart, so only the first row survives; applying either resolves to the same skin.
    if (seen.has(mod.name)) continue
    seen.add(mod.name)
    rows.push(mod)
  }
  return rows
}

function buildSlots(schema: SchemaIndex, text: string, owner: string, previous?: HeroEntry): Slot[] {
  const bySlot = new Map<string, Array<{ base: string; style: number; mod: Mod }>>()

  for (const item of schema.items.values()) {
    if (!item.heroes.includes(owner)) continue
    // Defaults are represented by the UI's synthetic "Official Base" entry, and bundles are
    // containers rather than cosmetics.
    if (item.prefab !== 'wearable') continue
    if (/diretide shimmer costume/i.test(item.name)) continue
    const slot = armorySlotFor(item)
    if (!slot) continue
    if (!item.image) continue

    const mods = styleMods(schema, text, item)
    for (let i = 0; i < mods.length; i++) {
      const list = bySlot.get(slot) ?? []
      list.push({ base: item.name, style: i, mod: mods[i] })
      bySlot.set(slot, list)
    }
  }

  if (!bySlot.size) return []

  // Styles stay adjacent: sort by the base item name first, then by style index.
  for (const list of bySlot.values()) {
    list.sort((a, b) => a.base.localeCompare(b.base, 'en') || a.style - b.style || a.mod.name.localeCompare(b.mod.name, 'en'))
  }

  const previousOrder = new Map((previous?.slots ?? []).map((slot, index) => [slot.slot, index]))
  const previousSlots = new Map((previous?.slots ?? []).map((slot) => [slot.slot, slot]))

  const rank = (slot: string): number => {
    const existing = previousOrder.get(slot)
    if (existing !== undefined) return existing
    const known = SLOT_ORDER.indexOf(slot)
    return 1000 + (known === -1 ? 500 : known)
  }

  return [...bySlot.keys()]
    .sort((a, b) => rank(a) - rank(b) || a.localeCompare(b, 'en'))
    .map((slot) => {
      const prev = previousSlots.get(slot)
      const out: Slot = {
        slot,
        title: titleFor(slot, prev),
        mods: bySlot.get(slot)!.map((entry) => entry.mod)
      }
      // Hero-specific empty state: the default item's own icon for this slot.
      // Same `econ/...` key shape as mod icons, so it resolves via R2 like they do.
      const fallback = defaultFor(schema, owner, schemaSlotForArmorySlot(slot))?.image
      if (fallback) out.empty_img = fallback
      return out
    })
}

/** Remove every external URL from an armory entry, wherever it hides. */
function pruneExternal<T>(value: T): T {
  if (Array.isArray(value)) return value.map((item) => pruneExternal(item)) as unknown as T
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      if (typeof child === 'string' && /^https?:\/\//i.test(child)) continue
      out[key] = pruneExternal(child)
    }
    return out as unknown as T
  }
  return value
}

function withoutExternalFields(entry: HeroEntry | undefined): Record<string, unknown> {
  const out = pruneExternal({ ...(entry ?? {}) }) as Record<string, unknown>
  // Hero art comes from `assets/heroes/<canonical>.png`, taunts come from the generated
  // `taunt` slot, and portrait metadata from the old dataset — none of it needs an
  // external image host. `empty_img` survives here only as Valve `econ/...` paths (http
  // variants are pruned above); the renderer resolves those through R2 like mod icons.
  delete out.portrait
  delete out.taunt
  delete out.gamesets
  return out
}

const ARMORY_FILE = 'heroes_armory.json'

interface HeroIndexEntry {
  tag: string
  name: string
  img?: string
}

/** Read a data file, failing with an actionable message instead of a stack trace. */
function readJsonFile<T>(path: string, notFoundHint: string): { raw: string; value: T } {
  if (!fs.existsSync(path)) throw new Error(`${notFoundHint} not found: ${path}`)
  const raw = fs.readFileSync(path, 'utf-8')
  try {
    return { raw, value: JSON.parse(raw) as T }
  } catch (error) {
    throw new Error(`${path} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`, {
      cause: error
    })
  }
}

function reportFindings(findings: Finding[]): number {
  const errors = findings.filter((finding) => finding.level === 'error')
  const infos = findings.filter((finding) => finding.level === 'info')
  if (errors.length > 0) {
    console.log(`\n${errors.length} problem${errors.length === 1 ? '' : 's'}:`)
    for (const finding of errors) console.log(`  ERROR ${finding.where}\n        ${finding.message}`)
  }
  if (infos.length > 0) {
    console.log(`\n${infos.length} informational note${infos.length === 1 ? '' : 's'} (never modified):`)
    for (const finding of infos) console.log(`  note  ${finding.where}: ${finding.message}`)
  }
  return errors.length
}

/** The hero list and the armory must agree on which heroes exist, or the picker looks up nothing. */
function heroIndexFindings(heroes: HeroIndexEntry[], armory: Armory): Finding[] {
  const findings: Finding[] = []
  const tags = new Set(heroes.map((hero) => hero.tag))
  for (const tag of tags) {
    if (!armory[tag]) findings.push({ level: 'error', where: tag, message: 'listed in heroes.json but missing from the armory' })
  }
  for (const key of Object.keys(armory)) {
    if (!tags.has(key)) findings.push({ level: 'error', where: key, message: 'in the armory but missing from heroes.json' })
  }
  return findings
}

/** `--check` / `--fix`: validate the shipped armory against the schema, optionally repairing it. */
function checkArmory(schema: SchemaIndex): void {
  const armoryPath = dataPath(ARMORY_FILE)
  const { raw, value: armory } = readJsonFile<Armory>(armoryPath, 'Armory file (run `npm run armory` to generate it)')
  const { value: heroes } = readJsonFile<{ heroes: HeroIndexEntry[] }>(dataPath('heroes.json'), 'Hero index')

  console.log(`schema:  ${schema.items.size} items, ${schema.defaults.size} owners`)
  console.log(`armory:  ${Object.keys(armory).length} owners, ${armoryEntryCount(armory)} items`)

  const findings = [...collectArmoryFindings(armory, schema), ...heroIndexFindings(heroes.heroes, armory)]
  const errors = reportFindings(findings)
  const fix = hasFlag('--fix')

  if (!fix) {
    if (errors > 0) {
      console.log('\nRun `npm run armory:fix` to repair these.')
      process.exitCode = 1
    } else {
      console.log('\nArmory matches the schema.')
    }
    return
  }

  if (errors === 0) {
    console.log('\nNothing to repair.')
    return
  }
  const repairable = findings.filter((finding) => finding.level === 'error' && finding.repair)
  if (repairable.length === 0) {
    console.log('\nNothing repairable to do; rebuild with `npm run armory`.')
    process.exitCode = 1
    return
  }
  if (hasFlag('--dry-run')) {
    console.log(`\n--dry-run: would repair ${repairable.length} finding(s); nothing written.`)
    process.exitCode = 1
    return
  }

  for (const finding of repairable) finding.repair?.()
  try {
    fs.writeFileSync(armoryPath, stringifyLikeFile(raw, armory, ARMORY_FILE), 'utf-8')
  } catch (error) {
    throw new Error(
      `${error instanceof Error ? error.message : String(error)}\nInspect the findings above; \`npm run armory\` rebuilds the file from scratch.`,
      { cause: error }
    )
  }
  console.log(`\nRepaired ${repairable.length} finding(s); wrote ${armoryPath}`)

  const reread = readJsonFile<Armory>(armoryPath, 'Armory file').value
  const remaining = [...collectArmoryFindings(reread, schema), ...heroIndexFindings(heroes.heroes, reread)].filter(
    (finding) => finding.level === 'error'
  )
  console.log(`Re-check: ${remaining.length} problem(s) remaining.`)
  for (const finding of remaining) console.log(`  ERROR ${finding.where}: ${finding.message}`)
  process.exitCode = remaining.length > 0 ? 1 : 0
}

async function main(): Promise<void> {
  const files = await resolveSchemaFiles()
  if (!fs.existsSync(files.itemsGame)) throw new Error(`items_game.txt not found: ${files.itemsGame}`)
  const { schema, text } = loadSchema(files)

  if (hasFlag('--check') || hasFlag('--fix')) return checkArmory(schema)

  const { value: heroIndex } = readJsonFile<{ heroes: HeroIndexEntry[] }>(dataPath('heroes.json'), 'Hero index')
  const heroes = heroIndex.heroes
  const armoryPath = dataPath(ARMORY_FILE)
  const { raw, value: previous } = readJsonFile<Armory>(armoryPath, 'Armory file (run `npm run armory` to generate it)')

  // Match existing keys so the hero cards keep their extra fields.
  const keyOf = (tag: string): string => tag.toLowerCase().replace(/[^a-z0-9]/g, '')
  const previousByKey = new Map(Object.entries(previous).map(([key, entry]) => [keyOf(key), entry]))
  const previousKeyByCanonical = new Map(Object.entries(previous).map(([key, entry]) => [keyOf(entry.tag ?? key), key]))

  const next: Armory = {}
  const empty: string[] = []
  const preserved: string[] = []

  for (const hero of heroes) {
    const canonical = getCanonicalHero(hero.tag)
    const prev = previousByKey.get(keyOf(hero.tag)) ?? previousByKey.get(keyOf(canonical))
    const slots = buildSlots(schema, text, canonical, prev)
    const key = previousKeyByCanonical.get(keyOf(canonical)) ?? hero.tag
    // Set membership travels with the armory: pieces are {slot, id} rows into `slots`.
    const sets: ArmorySet[] = prev?.sets ?? []

    if (!slots.length) {
      // A hero the installed schema knows nothing about (newly shipped) keeps its old list
      // rather than vanishing from the picker.
      if (prev) {
        next[key] = { ...(withoutExternalFields(prev) as unknown as HeroEntry), sets }
        preserved.push(hero.tag)
      } else {
        empty.push(hero.tag)
      }
      continue
    }

    next[key] = {
      ...withoutExternalFields(prev),
      tag: prev?.tag ?? hero.tag,
      slots,
      sets
    } as HeroEntry
  }

  const ordered = Object.fromEntries(Object.entries(next).sort(([a], [b]) => a.localeCompare(b, 'en')))
  const count = (armory: Armory): number =>
    Object.values(armory).reduce((sum, hero) => sum + (hero.slots ?? []).reduce((n, slot) => n + slot.mods.length, 0), 0)
  const setCount = Object.values(ordered).reduce((sum, hero) => sum + (hero.sets?.length ?? 0), 0)

  console.log(`schema:  ${schema.items.size} items, ${schema.defaults.size} owners`)
  console.log(`heroes:  ${Object.keys(ordered).length} written, ${empty.length} without items`)
  if (preserved.length) console.log(`  kept previous list for: ${preserved.join(', ')}`)
  if (empty.length) console.log(`  empty: ${empty.join(', ')}`)
  console.log(`entries: ${count(previous)} (was) -> ${count(ordered)} (now)`)
  console.log(`sets:    ${setCount}`)

  const sample = ['lina', 'legion commander', 'tidehunter']
  for (const name of sample) {
    const key = Object.keys(ordered).find((k) => keyOf(k) === keyOf(name))
    if (!key) continue
    const hero = ordered[key]
    const slots = hero.slots ?? []
    const flat = slots.map((slot) => `${slot.slot}=${slot.mods.length}`).join(' ')
    console.log(`\n${key}: ${flat}`)
    const arcana = slots
      .flatMap((slot) => slot.mods.map((mod) => ({ slot: slot.slot, mod })))
      .filter(({ mod }) => mod.rarity === 'arcana' || mod.rarity === 'persona')
    for (const { slot, mod } of arcana.slice(0, 6)) console.log(`  ${slot}: ${mod.id} ${mod.name} [${mod.rarity}]`)

    const withStyles = slots.flatMap((slot) => slot.mods.filter((mod) => mod.name.includes(' - ')))
    if (withStyles.length) {
      console.log(
        `  style variants kept together: ${withStyles
          .slice(0, 4)
          .map((m) => m.name)
          .join(' | ')}`
      )
    }
  }

  const target = argValue('--out') ?? armoryPath
  const findings = [...collectArmoryFindings(ordered, schema), ...heroIndexFindings(heroes, ordered)]
  const errors = reportFindings(findings)
  if (errors > 0) {
    console.log('\nRefusing to write: the rebuilt armory does not match the schema (see above).')
    process.exitCode = 1
    return
  }

  if (hasFlag('--dry-run')) {
    console.log('\n--dry-run: nothing written.')
    return
  }

  fs.writeFileSync(target, stringifyLikeFile(raw, ordered, ARMORY_FILE, { allowRewrite: true }), 'utf-8')
  console.log(`\nWrote ${target}`)
  console.log('Verified: armory matches the schema.')
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
