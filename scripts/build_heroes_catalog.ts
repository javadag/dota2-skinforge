/**
 * Rebuild `data/heroes_catalog.json` from the game's own `items_game.txt`.
 *
 * Output shape is unchanged from the shipped catalog:
 *
 *   { "<hero>": { tag, portrait?, variant_default?, slots: [{ slot, title, empty_img?, mods: [
 *       { id, name, rarity?, img? } ] }], ... } }
 *
 * Item icons use the `image_inventory` path (`econ/items/...`), which is exactly the key the
 * R2 icon sync uploads, so the renderer resolves them through `skinforge-icon://`.
 *
 * Style variants of one item are emitted as separate mods with a `- <style>` suffix and sorted
 * next to each other instead of being scattered by rarity.
 *
 *   npm run build:heroes-catalog
 *   npm run build:heroes-catalog -- --dry-run
 *   npm run build:heroes-catalog -- --items-game <path> --localization <path>
 */

import fs from 'fs'

import { argValue, dataPath, hasFlag, loadSchema, resolveSchemaFiles, stringifyLikeFile } from './lib/schemaSource'
import { getCanonicalHero } from '../src/shared/constants/heroAliases'
import { defaultFor, type SchemaIndex, type SchemaItem } from '../src/main/services/modifier/schema'
import { getNode, getString, materializeDeep, type VdfNode } from '../src/main/services/modifier/vdf'
import { styleOptions } from '../src/main/services/modifier/visuals'

interface Mod {
  id: number
  name: string
  rarity?: string
  img?: string
}

interface Slot {
  slot: string
  title: string
  empty_img?: string
  mods: Mod[]
}

interface HeroEntry {
  tag?: string
  portrait?: string
  variant_default?: string
  slots: Slot[]
  [key: string]: unknown
}

type Catalog = Record<string, HeroEntry>

/** Presentation order for slots that are not already ordered by the previous catalog. */
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
  'voice',
  'taunt'
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
  voice: 'Voice',
  taunt: 'Taunt'
}

/** `head_persona_1` -> `persona_head`, so the persona pieces keep their shipped slot names. */
function catalogSlot(item: SchemaItem): string | undefined {
  if (item.prefab === 'taunt') return 'taunt'
  const slot = item.resolvedSlot || item.slot
  if (!slot) return undefined
  if (slot === 'persona_selector') return 'persona'
  const persona = /^(.*)_persona_\d+$/.exec(slot)
  if (persona) return `persona_${persona[1]}`
  return slot
}

/** Reverse of `catalogSlot`: catalog slot name -> schema slot holding its default. */
function schemaSlotForCatalogSlot(slot: string): string {
  if (slot === 'persona') return 'persona_selector'
  const persona = /^persona_(.+)$/.exec(slot)
  if (persona) return `${persona[1]}_persona_1`
  return slot
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
  return styles.map((style) => {
    const mod: Mod = { ...base }
    if (style.index > 0) mod.name = `${item.name} - ${style.name}`
    const icon = alternateIcons && !alternateIcons.opaque ? getNode(alternateIcons, String(style.index)) : undefined
    const iconPath = icon ? getString(icon, 'icon_path') : undefined
    if (iconPath) mod.img = iconPath
    return mod
  })
}

function buildSlots(schema: SchemaIndex, text: string, owner: string, previous?: HeroEntry): Slot[] {
  const bySlot = new Map<string, Array<{ base: string; style: number; mod: Mod }>>()

  for (const item of schema.items.values()) {
    if (!item.heroes.includes(owner)) continue
    // Defaults are represented by the UI's synthetic "Official Base" entry, and bundles are
    // containers rather than cosmetics.
    if (item.prefab !== 'wearable' && item.prefab !== 'taunt') continue
    const slot = catalogSlot(item)
    if (!slot) continue
    if (!item.image && item.prefab !== 'taunt') continue

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
      const fallback = defaultFor(schema, owner, schemaSlotForCatalogSlot(slot))?.image
      if (fallback) out.empty_img = fallback
      return out
    })
}

/** Remove every external URL from a catalog entry, wherever it hides. */
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
  // `taunt` slot, and item sets are unused — none of it needs an external image host.
  // `empty_img` survives here only as Valve `econ/...` paths (http variants are pruned
  // above); the renderer resolves those through R2 like mod icons.
  delete out.portrait
  delete out.taunt
  delete out.gamesets
  return out
}

async function main(): Promise<void> {
  const files = await resolveSchemaFiles()
  const { schema, text } = loadSchema(files)

  const heroes = JSON.parse(fs.readFileSync(dataPath('heroes.json'), 'utf-8')).heroes as Array<{
    tag: string
    name: string
    img?: string
  }>

  const catalogPath = dataPath('heroes_catalog.json')
  const raw = fs.readFileSync(catalogPath, 'utf-8')
  const previous = JSON.parse(raw) as Catalog

  // Match existing keys so the hero cards keep their portraits and any extra fields.
  const keyOf = (tag: string): string => tag.toLowerCase().replace(/[^a-z0-9]/g, '')
  const previousByKey = new Map(Object.entries(previous).map(([key, entry]) => [keyOf(key), entry]))
  const previousKeyByCanonical = new Map(Object.entries(previous).map(([key, entry]) => [keyOf(entry.tag ?? key), key]))

  const next: Catalog = {}
  const empty: string[] = []
  const preserved: string[] = []

  for (const hero of heroes) {
    const canonical = getCanonicalHero(hero.tag)
    const prev = previousByKey.get(keyOf(hero.tag)) ?? previousByKey.get(keyOf(canonical))
    const slots = buildSlots(schema, text, canonical, prev)
    const key = previousKeyByCanonical.get(keyOf(canonical)) ?? hero.tag

    if (!slots.length) {
      // A hero the installed schema knows nothing about (newly shipped) keeps its old list
      // rather than vanishing from the picker.
      if (prev) {
        next[key] = withoutExternalFields(prev) as unknown as HeroEntry
        preserved.push(hero.tag)
      } else {
        empty.push(hero.tag)
      }
      continue
    }

    next[key] = {
      ...withoutExternalFields(prev),
      tag: prev?.tag ?? hero.tag,
      slots
    } as HeroEntry
  }

  const ordered = Object.fromEntries(Object.entries(next).sort(([a], [b]) => a.localeCompare(b, 'en')))
  const count = (catalog: Catalog): number =>
    Object.values(catalog).reduce((sum, hero) => sum + (hero.slots ?? []).reduce((n, slot) => n + slot.mods.length, 0), 0)

  console.log(`schema:  ${schema.items.size} items, ${schema.defaults.size} owners`)
  console.log(`heroes:  ${Object.keys(ordered).length} written, ${empty.length} without items`)
  if (preserved.length) console.log(`  kept previous list for: ${preserved.join(', ')}`)
  if (empty.length) console.log(`  empty: ${empty.join(', ')}`)
  console.log(`entries: ${count(previous)} (was) -> ${count(ordered)} (now)`)

  const sample = ['lina', 'legion commander', 'tidehunter']
  for (const name of sample) {
    const key = Object.keys(ordered).find((k) => keyOf(k) === keyOf(name))
    if (!key) continue
    const hero = ordered[key]
    const flat = hero.slots.map((slot) => `${slot.slot}=${slot.mods.length}`).join(' ')
    console.log(`\n${key}: ${flat}`)
    const arcana = hero.slots
      .flatMap((slot) => slot.mods.map((mod) => ({ slot: slot.slot, mod })))
      .filter(({ mod }) => mod.rarity === 'arcana' || mod.rarity === 'persona')
    for (const { slot, mod } of arcana.slice(0, 6)) console.log(`  ${slot}: ${mod.id} ${mod.name} [${mod.rarity}]`)

    const withStyles = hero.slots.flatMap((slot) => slot.mods.filter((mod) => mod.name.includes(' - ')))
    if (withStyles.length) {
      console.log(
        `  style variants kept together: ${withStyles
          .slice(0, 4)
          .map((m) => m.name)
          .join(' | ')}`
      )
    }
  }

  if (hasFlag('--dry-run')) {
    console.log('\n--dry-run: nothing written.')
    return
  }

  const target = argValue('--out') ?? catalogPath
  fs.writeFileSync(target, stringifyLikeFile(raw, ordered, 'heroes_catalog.json', { allowRewrite: true }), 'utf-8')
  console.log(`\nWrote ${target}`)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
