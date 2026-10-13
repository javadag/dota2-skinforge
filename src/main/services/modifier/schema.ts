/**
 * Dota 2 SkinForge — typed index over the game's own items_game.txt.
 *
 * Everything the modifier engine needs is derived here from the schema itself:
 * item identity and slots, per-hero default items, `item_sets` membership, persona
 * variant slots and localized style names. No cosmetic is ever referenced by id or
 * by hand-written name, so new arcanas, personas and sets work on release day.
 */

import { find, findAll, getNode, getString, isNode, materializeDeep, parseVdf, type VdfDocument, type VdfEntry, type VdfNode } from './vdf'

/** A cosmetic or base item from the `items` block. */
export interface SchemaItem {
  id: string
  name: string
  prefab: string
  /** `item_slot` as declared by the schema; empty string when the schema omits it. */
  slot: string
  /**
   * The slot the engine actually uses: `slot` when the schema declares it, otherwise the
   * primary-weapon convention for the ~1,960 slot-less wearables. See `resolveSlot`.
   */
  resolvedSlot: string
  /** How `resolvedSlot` was determined. */
  slotSource: SlotSource
  rarity: string
  /** Heroes from `used_by_heroes` (bare names, e.g. `juggernaut`). */
  heroes: string[]
  /** `model_player`, empty when absent (common for voice/misc/visual-only pieces). */
  model: string
  particleFolder: string
  /** `image_inventory`, the icon path the UI catalog uses. */
  image: string
  /**
   * Slots this item forces back to their default when it is equipped, declared through
   * `force_default_item_into_slot_index_when_equipped`. Two arcanas work by rewriting the
   * *default* weapon with their own `type model` remaps — Legion Commander's dual swords and
   * Drow's bow — and list the alternate weapon itemdefs as exceptions. Auto-pairing a set
   * piece into such a slot fights that mechanism, so companion pairing must skip them.
   */
  forcesDefaultSlots: string[]
  /** The `items/<id>` entry, for span access. */
  entry: VdfEntry
}

/** An `item_sets` entry: the authoritative definition of a cosmetic set. */
export interface SchemaSet {
  key: string
  displayName: string
  storeBundle: string
  members: string[]
}

export interface SchemaIndex {
  items: Map<string, SchemaItem>
  byName: Map<string, SchemaItem>
  sets: Map<string, SchemaSet>
  /** Item name -> keys of every set containing it. */
  setsForItem: Map<string, string[]>
  /** Bundle item name -> member names. */
  bundleMembers: Map<string, string[]>
  /** Owner (hero or non-hero category) -> slot -> default item. */
  defaults: Map<string, Map<string, SchemaItem>>
  /** Normalized localization token -> display text. */
  localization: Map<string, string>
  /** Names that appeared more than once; the engine refuses to guess for these. */
  ambiguousNames: Set<string>
  /**
   * Hero -> persona selector items (`prefab: wearable`, `item_slot: persona_selector`).
   * These are the real personas: each carries `type persona` plus the `entity_model`
   * that swaps the hero's body. Every persona hero has exactly one.
   */
  personaSelectors: Map<string, SchemaItem[]>
}

/**
 * How an item's slot was decided.
 * - `declared` — the schema states `item_slot`.
 * - `prefab` — the schema implies it: `prefab: taunt` always means the `taunt` slot.
 * - `fallback` — Valve omitted it, so it is treated as the hero's primary weapon.
 * - `none` — not a wearable, so no slot is assumed.
 */
export type SlotSource = 'declared' | 'prefab' | 'fallback' | 'none'

/**
 * `baseitem` items are the default for a non-hero category. The schema declares the
 * category through `prefab`; these are the UI slot ids the catalog uses for it.
 */
const BASE_ITEM_SLOTS: Record<string, { owner: string; slot: string }> = {
  music: { owner: 'music_packs', slot: 'music_pack' },
  radiantcreeps: { owner: 'creeps', slot: 'radiant_creeps' },
  direcreeps: { owner: 'creeps', slot: 'dire_creeps' },
  radiantsiegecreeps: { owner: 'creeps', slot: 'radiant_siege' },
  diresiegecreeps: { owner: 'creeps', slot: 'dire_siege' },
  radianttowers: { owner: 'towers', slot: 'radiant_tower' },
  diretowers: { owner: 'towers', slot: 'dire_tower' },
  courier: { owner: 'courier', slot: 'courier' },
  ward: { owner: 'wards', slot: 'ward' },
  weather: { owner: 'weather', slot: 'weather_effect' },
  terrain: { owner: 'terrain', slot: 'map_terrain' },
  cursor_pack: { owner: 'cursor', slot: 'cursor_pack' },
  hud_skin: { owner: 'huds', slot: 'hud_skin' },
  loading_screen: { owner: 'loadscreens', slot: 'loading_screen' },
  announcer: { owner: 'announcers', slot: 'announcer' },
  roshan: { owner: 'roshan', slot: 'roshan_model' },
  versus_screen: { owner: 'versus_screen', slot: 'versus_screen' },
  streak_effect: { owner: 'kill_streak', slot: 'streak_effect' }
}

const HERO_PREFIX = 'npc_dota_hero_'

/** Words that carry no set identity, so they never count as a shared stem. */
const STOP_WORDS = new Set(['of', 'the', 'a', 'an', 'and', 's', 'set', 'bundle'])

export function tokenizeName(name: string): Set<string> {
  const tokens = name
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length > 1 && !STOP_WORDS.has(token))
  return new Set(tokens)
}

function readHeroes(node: VdfNode | undefined): string[] {
  if (!node) return []
  return node.entries.map((entry) => (entry.key.startsWith(HERO_PREFIX) ? entry.key.slice(HERO_PREFIX.length) : entry.key))
}

interface RawItem extends Omit<SchemaItem, 'resolvedSlot' | 'slotSource' | 'forcesDefaultSlots'> {
  itemType: string
  baseItem: boolean
}

/**
 * `force_default_item_into_slot_index_when_equipped` lives inside the `visuals` block, which
 * the initial parse leaves opaque so indexing stays cheap. Only a couple of items in the whole
 * schema declare it, so rather than materializing 26,000 visuals blocks we locate the marker
 * in the raw text, map each hit to its item through the spans we already recorded, and
 * materialize just those.
 */
const FORCE_DEFAULT_MARKER = 'force_default_item_into_slot_index_when_equipped'

function readForcedDefaultSlots(text: string, items: Map<string, SchemaItem>): Map<string, string[]> {
  const result = new Map<string, string[]>()
  const owners = new Set<string>()

  for (let offset = text.indexOf(FORCE_DEFAULT_MARKER); offset !== -1; offset = text.indexOf(FORCE_DEFAULT_MARKER, offset + 1)) {
    for (const item of items.values()) {
      const node = item.entry.value
      if (typeof node === 'string') continue
      if (offset >= node.start && offset <= node.end) {
        owners.add(item.id)
        break
      }
    }
  }

  for (const id of owners) {
    const item = items.get(id)
    const node = item?.entry.value
    if (!item || !node || typeof node === 'string') continue
    materializeDeep(text, node)
    const visuals = getNode(node, 'visuals')
    if (!visuals) continue

    const named = findAll(visuals, 'asset_modifier')
      .map((entry) => entry.value)
      .filter((value): value is VdfNode => isNode(value) && getString(value, 'type') === 'named_value')

    const forces = named.some((value) => getString(value, 'asset') === FORCE_DEFAULT_MARKER)
    if (!forces) continue

    // The exception itemdefs are items in the forced slot, which names that slot for us
    // without needing an index -> slot table.
    const exceptionSlots = [
      ...new Set(
        named
          .filter((value) => getString(value, 'asset') === `${FORCE_DEFAULT_MARKER}_exception_itemdef`)
          .map((value) => items.get(getString(value, 'value') ?? '')?.resolvedSlot)
          .filter((slot): slot is string => Boolean(slot))
      )
    ]
    result.set(id, exceptionSlots.length === 1 ? exceptionSlots : [])
  }

  return result
}

function readItem(entry: VdfEntry): RawItem | null {
  const node = entry.value
  if (!isNode(node)) return null
  const name = getString(node, 'name')
  if (!name) return null
  return {
    id: entry.key,
    name,
    prefab: getString(node, 'prefab') ?? '',
    slot: getString(node, 'item_slot') ?? '',
    rarity: getString(node, 'item_rarity') ?? '',
    heroes: readHeroes(getNode(node, 'used_by_heroes')),
    model: getString(node, 'model_player') ?? '',
    particleFolder: getString(node, 'particle_folder') ?? '',
    image: getString(node, 'image_inventory') ?? '',
    entry,
    itemType: getString(node, 'item_type_name') ?? '',
    baseItem: getString(node, 'baseitem') === '1'
  }
}

/** Skip portrait/visual subtrees; they are materialized only for items we rewrite. */
export function isOpaqueBlock(key: string, depth: number): boolean {
  if (depth < 2) return false
  const k = key.toLowerCase()
  return k === 'portraits' || k === 'visuals' || k === 'attributes' || k === 'tool'
}

const FALLBACK_SLOT = 'weapon'

/**
 * Decide an item's slot. The schema declares `item_slot` for ~9,600 wearables; for the
 * ~1,960 where Valve omitted it we follow the convention the game itself uses: a
 * slot-less wearable is the hero's primary hand item.
 *
 * Measured over all 87 slot-less `default_item`s, every one is the hero's weapon or
 * hand item (Sven's Sword, Wind Ranger's Bow, Legion Commander's Sword, Juggernaut's
 * Weapon, Tidehunter's Anchor, Tinker's Right Arm). The same holds for the slot-less
 * set pieces we need to pair, e.g. "Blades of Voth Domosh - Swords".
 *
 * `item_type_name` was evaluated as a richer signal and deliberately rejected: its
 * vocabulary maps `#DOTA_WearableType_Sword` to `offhand_weapon` more often than to
 * `weapon`, which mis-slotted exactly the case that matters (and moved Windranger's
 * bow out of the weapon slot). The chosen source is recorded on every item so the
 * compiler can report each assumption instead of guessing silently.
 */
export function resolveSlot(item: { prefab: string; slot: string }): { slot: string; source: SlotSource } {
  if (item.slot) return { slot: item.slot, source: 'declared' }
  // A taunt only declares its slot through its prefab, and the weapon convention would mis-slot
  // all 122 of them — which matters because a mis-slotted item would be paired into the wrong
  // default item when it turns up as a set companion.
  if (item.prefab === 'taunt') return { slot: 'taunt', source: 'prefab' }
  if (item.prefab !== 'wearable' && item.prefab !== 'default_item') return { slot: '', source: 'none' }
  return { slot: FALLBACK_SLOT, source: 'fallback' }
}

export interface BuildSchemaOptions {
  /** Pre-parsed document, to avoid parsing twice. */
  document?: VdfDocument
  /** Contents of dota_english.txt, used to resolve `#Token` style names. */
  localizationText?: string
}

export function buildSchema(text: string, options: BuildSchemaOptions = {}): SchemaIndex {
  const doc = options.document ?? parseVdf(text, { opaque: isOpaqueBlock })

  // Pass 1 — read every item's scalar fields.
  const raw: RawItem[] = []
  const itemsNode = getNode(doc.root, 'items')
  if (itemsNode && !itemsNode.opaque) {
    for (const entry of itemsNode.entries) {
      const item = readItem(entry)
      if (item) raw.push(item)
    }
  }

  // Pass 2 — resolve slots, index items, defaults and bundles.
  const items = new Map<string, SchemaItem>()
  const byName = new Map<string, SchemaItem>()
  const ambiguousNames = new Set<string>()
  const defaults = new Map<string, Map<string, SchemaItem>>()
  const bundleMembers = new Map<string, string[]>()
  const personaSelectors = new Map<string, SchemaItem[]>()

  for (const item of raw) {
    const resolved = resolveSlot(item)
    const full: SchemaItem = { ...item, resolvedSlot: resolved.slot, slotSource: resolved.source, forcesDefaultSlots: [] }
    items.set(full.id, full)

    if (byName.has(full.name)) ambiguousNames.add(full.name)
    else byName.set(full.name, full)

    if (full.resolvedSlot === 'persona_selector' && full.prefab === 'wearable') {
      for (const hero of full.heroes) {
        const list = personaSelectors.get(hero)
        if (list) list.push(full)
        else personaSelectors.set(hero, [full])
      }
    }

    if (full.prefab === 'default_item' && full.heroes.length > 0 && full.resolvedSlot) {
      for (const hero of full.heroes) {
        if (!defaults.has(hero)) defaults.set(hero, new Map())
        defaults.get(hero)!.set(full.resolvedSlot, full)
      }
    } else if (item.baseItem) {
      const mapping = BASE_ITEM_SLOTS[full.prefab]
      if (mapping) {
        if (!defaults.has(mapping.owner)) defaults.set(mapping.owner, new Map())
        defaults.get(mapping.owner)!.set(mapping.slot, full)
      }
    }

    if (full.prefab === 'bundle') {
      const members = getNode(full.entry.value as VdfNode, 'bundle')
      if (members && !members.opaque)
        bundleMembers.set(
          full.name,
          members.entries.map((m) => m.key)
        )
    }
  }

  const sets = new Map<string, SchemaSet>()
  const setsForItem = new Map<string, string[]>()
  const setsNode = getNode(doc.root, 'item_sets')
  if (setsNode && !setsNode.opaque) {
    for (const entry of setsNode.entries) {
      if (!isNode(entry.value)) continue
      const membersNode = getNode(entry.value, 'items')
      const set: SchemaSet = {
        key: entry.key,
        displayName: getString(entry.value, 'name') ?? '',
        storeBundle: getString(entry.value, 'store_bundle') ?? '',
        members: membersNode && !membersNode.opaque ? membersNode.entries.map((m) => m.key) : []
      }
      sets.set(set.key, set)
      for (const member of set.members) {
        const list = setsForItem.get(member)
        if (list) list.push(set.key)
        else setsForItem.set(member, [set.key])
      }
    }
  }

  const localization = options.localizationText ? buildLocalization(options.localizationText) : new Map<string, string>()

  // Fill in the forced-default slots for the handful of items that declare them.
  for (const [id, slots] of readForcedDefaultSlots(text, items)) {
    const item = items.get(id)
    if (item) item.forcesDefaultSlots = slots
  }

  return { items, byName, sets, setsForItem, bundleMembers, defaults, localization, ambiguousNames, personaSelectors }
}

function buildLocalization(text: string): Map<string, string> {
  const out = new Map<string, string>()
  const doc = parseVdf(text)
  const tokens = getNode(doc.root, 'Tokens')
  if (!tokens || tokens.opaque) return out
  for (const entry of tokens.entries) {
    if (!isNode(entry.value)) out.set(entry.key, entry.value)
  }
  return out
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

/** Exact lookup by display name. Names are unique in items_game.txt. */
export function itemByName(schema: SchemaIndex, name: string): SchemaItem | undefined {
  return schema.byName.get(name)
}

export function defaultFor(schema: SchemaIndex, owner: string, slot: string): SchemaItem | undefined {
  return schema.defaults.get(owner)?.get(slot)
}

export function defaultSlots(schema: SchemaIndex, owner: string): string[] {
  return [...(schema.defaults.get(owner)?.keys() ?? [])]
}

/**
 * Turn a localization key into something readable, for the handful of tokens the
 * localization file does not define. The schema also contains typos such as the
 * double-hashed `##DOTA_Item_Frightful_Revelries_1`, so leading hashes are stripped
 * wholesale rather than one at a time.
 */
function prettifyToken(key: string): string {
  const cleaned = key
    .replace(/^(?:DOTA)_+/i, '')
    .replace(/^(?:Item|Style|Set|WearableType|Collection)_/i, '')
    .replace(/_\d+$/, '')
    .replace(/_/g, ' ')
    .trim()
  return cleaned || key
}

/** Resolve a `#Token` display name, falling back to a readable form of the key. */
export function localize(schema: SchemaIndex, token: string | undefined): string | undefined {
  if (!token) return undefined
  if (!token.startsWith('#')) return token
  const key = token.replace(/^#+/, '')
  return schema.localization.get(key) ?? schema.localization.get(key.toLowerCase()) ?? prettifyToken(key)
}

/** Fraction of a set's members whose name shares a stem with `itemName`. */
export function setMemberAffinity(set: SchemaSet, itemName: string): number {
  if (set.members.length === 0) return 0
  const stem = tokenizeName(itemName)
  let shared = 0
  for (const member of set.members) {
    for (const token of tokenizeName(member)) {
      if (stem.has(token)) {
        shared++
        break
      }
    }
  }
  return shared / set.members.length
}

/**
 * How strongly a set's own identity (key, localized name, store bundle) names the
 * item. This is what separates an arcana's real bundle from a seasonal set that
 * merely re-lists the same arcana — both score identically on raw member overlap
 * because the arcana itself is a member of each.
 */
export function setIdentityScore(set: SchemaSet, itemName: string): number {
  const stem = tokenizeName(itemName)
  const identity = new Set<string>([...tokenizeName(set.key), ...tokenizeName(set.displayName), ...tokenizeName(set.storeBundle)])
  let shared = 0
  for (const token of identity) if (stem.has(token)) shared++
  return shared
}

function setScore(set: SchemaSet, itemName: string): number {
  return setIdentityScore(set, itemName) * 10 + setMemberAffinity(set, itemName)
}

export interface SetChoice {
  set: SchemaSet
  /** Combined identity + member affinity score. */
  score: number
  identity: number
  affinity: number
  /** Every set containing the item, best first. */
  candidates: Array<{ set: SchemaSet; score: number }>
  /** True when no candidate had any signal, so pairing was skipped. */
  ambiguous: boolean
}

/**
 * Pick the set an item belongs to. An arcana can be listed in several sets — its own
 * bundle plus an unrelated seasonal set that re-lists it — so prefer the set whose own
 * name/bundle matches the item, then the one whose members share its name stem, then
 * the more complete set. Returns undefined when pairing would be a guess.
 */
export function primarySetFor(schema: SchemaIndex, item: SchemaItem): SetChoice | undefined {
  const keys = schema.setsForItem.get(item.name)
  if (!keys || keys.length === 0) return undefined
  const candidates = keys
    .map((key) => schema.sets.get(key))
    .filter((set): set is SchemaSet => Boolean(set))
    .map((set) => ({
      set,
      score: setScore(set, item.name),
      identity: setIdentityScore(set, item.name),
      affinity: setMemberAffinity(set, item.name)
    }))
    .sort((a, b) => b.score - a.score || b.set.members.length - a.set.members.length)
  if (candidates.length === 0) return undefined
  const best = candidates[0]
  const ambiguous = best.identity === 0 && best.affinity === 0
  return {
    set: best.set,
    score: best.score,
    identity: best.identity,
    affinity: best.affinity,
    candidates: candidates.map((c) => ({ set: c.set, score: c.score })),
    ambiguous
  }
}

/**
 * Slots a persona re-skins: `head_persona_1` -> the item for `head`.
 *
 * Gated on the hero having a `persona_selector` default, which is what actually marks a
 * hero as having a persona. A handful of heroes carry stray `*_persona_1` items with no
 * selector (Clockwerk, Timbersaw, Terrorblade, Ember Spirit, Underlord, Muerta); those
 * are not personas and must not be treated as such.
 */
export function personaVariantSlots(schema: SchemaIndex, hero: string): Map<string, SchemaItem> {
  const out = new Map<string, SchemaItem>()
  const slots = schema.defaults.get(hero)
  if (!slots || !slots.has('persona_selector')) return out
  for (const [slot, item] of slots) {
    const match = /^(.*)_persona_\d+$/.exec(slot)
    if (match) out.set(match[1], item)
  }
  return out
}

/** Heroes that actually have a persona, derived from the schema. */
export function personaHeroes(schema: SchemaIndex): string[] {
  const out: string[] = []
  for (const hero of schema.defaults.keys()) {
    if (hero === 'all') continue
    if (personaVariantSlots(schema, hero).size > 0) out.push(hero)
  }
  return out.sort()
}

export function isPersonaSlot(slot: string): boolean {
  return slot === 'persona_selector' || /_persona_\d+$/.test(slot)
}

/** The base slot a persona variant slot belongs to, if any. */
export function baseSlotOfPersona(slot: string): string | undefined {
  return /^(.*)_persona_\d+$/.exec(slot)?.[1]
}

export function findEntry(node: VdfNode | undefined, key: string): VdfEntry | undefined {
  return find(node, key)
}

export function findEntries(node: VdfNode | undefined, key: string): VdfEntry[] {
  return findAll(node, key)
}
