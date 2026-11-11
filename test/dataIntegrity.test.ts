/**
 * Cross-file invariants for `data/`. Every one of these has silently drifted before — the
 * stale `mods` counts went unnoticed for months because nothing compared the files. Fast
 * and schema-free on purpose: `npm run armory:check` is the slow check that needs
 * `items_game.txt`, this is the one that runs with every `npm test`.
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'

import assetsData from '../data/cosmetic-assets.json'
import styleData from '../data/itemStyles.json'
import otherArmoryData from '../data/other_armory.json'
import armoryData from '../data/heroes_armory.json'
import packagesData from '../data/cosmetic-packages.json'
import { getCanonicalHero } from '../src/shared/constants/heroAliases'
import { getItemStyleOptions, getStyleOptionsByName } from '../src/shared/constants/itemStyles'
import { CATEGORY_SVG_MAP } from '../src/shared/armory/slotSvgIcons'
import { listHeroes } from '../src/renderer/components/slotGenerator'

interface Mod {
  id: number
  name: string
  rarity?: string
  img?: string
}

interface Slot {
  slot: string
  mods: Mod[]
}

interface Entry {
  tag?: string
  name?: string
  img?: string
  g?: string
  attribute?: string
  slots: Slot[]
  sets?: Array<{ id: string; name: string; img?: string; items: Array<{ slot: string; id: number }> }>
}

const armory = armoryData as unknown as Record<string, Entry>
const otherArmory = otherArmoryData as unknown as Record<string, Entry>
const packages = (packagesData as unknown as { packages: Record<string, unknown> }).packages
const styleItems = (styleData as unknown as { items: Record<string, unknown> }).items
const assetGroups = new Set(
  Object.values((assetsData as unknown as { items: Record<string, { group: string }> }).items).map((i) => i.group)
)

test('the hero list is derived from the armory and stays searchable by alias', () => {
  const heroes = listHeroes()
  assert.equal(new Set(heroes.map((hero) => hero.tag)).size, heroes.length, 'duplicate hero tag')
  assert.deepEqual(
    new Set(heroes.map((hero) => hero.tag)),
    new Set(Object.keys(armory)),
    'listHeroes() disagrees with the armory it is derived from'
  )

  for (const hero of heroes) {
    assert.ok(hero.name, `${hero.tag} has no display name`)
    for (const alias of hero.alias ?? []) {
      assert.notEqual(alias, hero.tag, `${hero.tag} lists itself as an alias`)
      assert.equal(getCanonicalHero(alias), getCanonicalHero(hero.tag), `${hero.tag}: alias "${alias}" resolves to a different hero`)
    }
  }

  // The one real alias in HERO_ALIASES — the derivation must not lose it.
  const antimage = heroes.find((hero) => hero.tag === 'antimage')
  assert.deepEqual(antimage?.alias, ['anti-mage'])
  assert.ok(heroes.length > 120, `only ${heroes.length} heroes`)
})

test('every hero carries a primary attribute the UI can filter on', () => {
  const valid = new Set(['str', 'agi', 'int', 'uni'])
  let checked = 0
  for (const [hero, entry] of Object.entries(armory)) {
    assert.ok(valid.has(entry.attribute ?? ''), `${hero}: attribute is ${JSON.stringify(entry.attribute)}`)
    checked++
  }
  // Which attribute each hero has is the game's business (`npm run armory:check` compares
  // against it); what matters here is that none is missing or malformed.
  assert.ok(checked > 120, `only ${checked} heroes checked`)
})

test('every set in the armory points at slots and items the armory has', () => {
  let setsChecked = 0
  let piecesChecked = 0
  for (const [hero, entry] of Object.entries(armory)) {
    const slots = new Map(entry.slots.map((slot) => [slot.slot, slot]))
    for (const set of entry.sets ?? []) {
      assert.ok(set.img, `${hero}/${set.id} has no set image (the picker renders it from R2)`)
      assert.ok(set.items.length > 0, `${hero}/${set.id} has no pieces`)
      for (const piece of set.items) {
        const slot = slots.get(piece.slot)
        assert.ok(slot, `${hero}/${set.id}: slot "${piece.slot}" does not exist`)
        assert.ok(
          slot.mods.some((mod) => mod.id === piece.id),
          `${hero}/${set.id}: #${piece.id} is not in slot "${piece.slot}"`
        )
        piecesChecked++
      }
      setsChecked++
    }
  }
  assert.ok(setsChecked > 1900, `only ${setsChecked} sets found`)
  assert.ok(piecesChecked > 9500, `only ${piecesChecked} pieces found`)
})

test('every category entry carries its own display metadata and slots', () => {
  const entries = Object.entries(otherArmory)
  assert.equal(entries.length, 15, `expected the 15 shipped categories, got ${entries.length}`)

  const seen = new Set<string>()
  for (const [key, entry] of entries) {
    const tag = entry.tag ?? key
    assert.ok(!seen.has(tag), `duplicate category tag ${tag}`)
    seen.add(tag)
    assert.ok(entry.name, `${tag} has no display name`)
    assert.ok(entry.img, `${tag} has no icon`)
    assert.ok(entry.g === 'world' || entry.g === 'interface', `${tag} has unexpected group ${JSON.stringify(entry.g)}`)
    assert.ok(entry.slots.length > 0, `${tag} has no slots`)
    for (const slot of entry.slots) assert.ok(slot.mods.length > 0, `${tag}.${slot.slot} is empty`)
  }
})

test('every referenced category SVG ships in assets/categories', () => {
  // default.svg was referenced by three components and the SVG map while not existing —
  // the browser only shows that on error paths, so nothing else catches it.
  const targets = [...Object.values(CATEGORY_SVG_MAP), ...Object.values(otherArmory).map((entry) => entry.img)]
  for (const target of targets) {
    assert.ok(target, 'empty asset target')
    assert.ok(fs.existsSync(path.resolve(__dirname, '..', target.replace(/^\.\.\//, ''))), `${target} is referenced but missing`)
  }
})

test('every asset group has a package, and every package has a group', () => {
  for (const name of Object.keys(packages)) {
    if (name === '_global') continue
    assert.ok(assetGroups.has(name), `package "${name}" has no cosmetic-assets group — nothing can ever request it`)
  }
  for (const group of assetGroups) {
    assert.ok(packages[group], `asset group "${group}" has no package to download`)
  }
})

test('armory rows are well formed: no empty slots, no missing ids, no duplicate rows', () => {
  for (const [hero, entry] of Object.entries(armory)) {
    // An empty slot list is legitimate: it means this schema knows no wearables for the
    // hero yet (kez and largo are in that state today).
    assert.ok(Array.isArray(entry.slots), `${hero} has no slots array`)
    for (const slot of entry.slots) {
      assert.ok(slot.slot, `${hero} has a slot without a name`)
      assert.ok(slot.mods.length > 0, `${hero}.${slot.slot} is empty`)
      const seen = new Set<string>()
      for (const mod of slot.mods) {
        assert.equal(typeof mod.id, 'number', `${hero}.${slot.slot}: "${mod.name}" has no item id`)
        assert.ok(mod.name, `${hero}.${slot.slot} has an item without a name`)
        const key = `${mod.id}:${mod.name}`
        assert.ok(!seen.has(key), `${hero}.${slot.slot} lists #${mod.id} "${mod.name}" twice`)
        seen.add(key)
      }
    }
  }
})

test('every style entry is a name the armory actually shows', () => {
  const rowNames = new Set<string>()
  for (const entry of [...Object.values(armory), ...Object.values(otherArmory)]) {
    for (const slot of entry.slots) for (const mod of slot.mods) rowNames.add(mod.name)
  }
  for (const key of Object.keys(styleItems)) {
    assert.ok(rowNames.has(key), `itemStyles["${key}"] matches no armory row — it can never be looked up`)
  }
})

test('every styled item is reachable from every armory row carrying it', () => {
  // A row is styled when any of its names has an entry; the lookup then has to reach it
  // from each of its sibling rows too (they share an id). plan.ts and selectionBuilder
  // both try the `style N` regex first, then fall back to getStyleOptionsByName.
  const nameToId = new Map<string, string>()
  const rowsById = new Map<string, Set<string>>()
  for (const entry of [...Object.values(armory), ...Object.values(otherArmory)]) {
    for (const slot of entry.slots) {
      for (const mod of slot.mods) {
        if (mod.id == null) continue
        const id = String(mod.id)
        nameToId.set(mod.name, id)
        const names = rowsById.get(id)
        if (names) names.add(mod.name)
        else rowsById.set(id, new Set([mod.name]))
      }
    }
  }

  const styledIds = new Set(
    Object.keys(styleItems)
      .map((name) => nameToId.get(name))
      .filter((id): id is string => Boolean(id))
  )
  assert.ok(styledIds.size > 0)

  for (const [id, names] of rowsById) {
    if (!styledIds.has(id)) continue
    for (const name of names) {
      const viaRegex = /style\s*(\d+)/i.test(name)
      assert.ok(
        viaRegex || getStyleOptionsByName(name).length > 0,
        `#${id} "${name}" has styles in the schema but no armory row can reach them`
      )
    }
  }
})

test('every styled armory row resolves through the UI style lookup', () => {
  // The lookup used to guard on the schema's owner name against the armory tag, which
  // rejected every multi-word hero (drow_ranger vs "drow ranger") and every persona slot
  // (weapon_persona_1 vs persona_weapon). It is name-only now; this locks that in.
  let checked = 0
  let withImg = 0
  for (const entry of [...Object.values(armory), ...Object.values(otherArmory)]) {
    for (const slot of entry.slots) {
      for (const mod of slot.mods) {
        const options = getStyleOptionsByName(mod.name)
        if (options.length === 0) continue
        checked++
        withImg += options.filter((option) => option.img).length
        assert.ok(
          getItemStyleOptions(entry.tag, slot.slot, mod.name),
          `${entry.tag}/${slot.slot} "${mod.name}" has styles but the UI lookup rejects it`
        )
      }
    }
  }
  assert.ok(checked > 1200, `only ${checked} styled rows checked`)
  assert.ok(withImg > 2000, `only ${withImg} style options carry art — the alternate_icons extraction broke`)
})

test('loading screens never carry styles', () => {
  // clean:other drops the whole loadscreens category ("not supported"), which is what
  // keeps screen items out of the armory — and build:styles skips `loadscreen` slots on
  // top of that. If the category ever ships rows again, no screen name may pick up styles.
  assert.ok(!('loadscreens' in otherArmory), 'the loadscreens category must stay out of the armory')
  const loadscreenNames = new Set<string>()
  for (const entry of Object.values(otherArmory)) {
    for (const slot of entry.slots) {
      if (slot.slot !== 'loadscreen') continue
      for (const mod of slot.mods) loadscreenNames.add(mod.name)
    }
  }
  for (const name of loadscreenNames) {
    assert.ok(!(name in styleItems), `loading screen "${name}" has style entries — it must not`)
  }
})
