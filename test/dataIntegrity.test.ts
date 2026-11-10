/**
 * Cross-file invariants for `data/`. Every one of these has silently drifted before — the
 * stale `mods` counts went unnoticed for months because nothing compared the files. Fast
 * and schema-free on purpose: `npm run armory:check` is the slow check that needs
 * `items_game.txt`, this is the one that runs with every `npm test`.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import assetsData from '../data/cosmetic-assets.json'
import categoriesData from '../data/categories.json'
import heroSetsData from '../data/hero_sets.json'
import heroesData from '../data/heroes.json'
import styleData from '../data/itemStyles.json'
import otherArmoryData from '../data/other_armory.json'
import armoryData from '../data/heroes_armory.json'
import packagesData from '../data/cosmetic-packages.json'
import { getStyleOptionsByName } from '../src/shared/constants/itemStyles'

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
  slots: Slot[]
}

interface SetPiece {
  slot: string
  name: string
  rarity?: string
  img?: string
}

interface HeroSet {
  id: string
  name: string
  rarity?: string
  img?: string
  isPersona?: boolean
  items: SetPiece[]
}

const armory = armoryData as unknown as Record<string, Entry>
const otherArmory = otherArmoryData as unknown as Record<string, Entry>
const heroSets = heroSetsData as unknown as Record<string, HeroSet[]>
const heroes = (heroesData as unknown as { heroes: Array<{ tag: string; name?: string; alias?: string[]; mods?: number }> }).heroes
const categories = (categoriesData as unknown as { categories: Array<{ tag: string; name: string }> }).categories
const packages = (packagesData as unknown as { packages: Record<string, unknown> }).packages
const styleItems = (styleData as unknown as { items: Record<string, unknown> }).items
const assetGroups = new Set(
  Object.values((assetsData as unknown as { items: Record<string, { group: string }> }).items).map((i) => i.group)
)

test('heroes.json, the armory and hero_sets describe the same heroes', () => {
  const tags = heroes.map((hero) => hero.tag)
  assert.equal(new Set(tags).size, tags.length, 'duplicate hero tag in heroes.json')

  assert.deepEqual(new Set(tags), new Set(Object.keys(armory)), 'heroes.json and heroes_armory.json disagree')
  assert.deepEqual(new Set(tags), new Set(Object.keys(heroSets)), 'heroes.json and hero_sets.json disagree')

  for (const hero of heroes) {
    assert.ok(!('mods' in hero), `${hero.tag} carries a mods count again — it is derived and was never displayed`)
    assert.ok(hero.name, `${hero.tag} has no display name`)
    assert.ok(Array.isArray(hero.alias), `${hero.tag} has no alias list`)
  }
})

test('every set piece resolves to exactly one armory row, and by id too', () => {
  for (const [hero, sets] of Object.entries(heroSets)) {
    const entry = armory[hero]
    assert.ok(entry, `${hero} has sets but no armory entry`)

    const byNameAndImg = new Map<string, Mod[]>()
    for (const slot of entry.slots) {
      for (const mod of slot.mods) {
        const key = `${mod.name}|${mod.img}`
        const list = byNameAndImg.get(key)
        if (list) list.push(mod)
        else byNameAndImg.set(key, [mod])
      }
    }

    for (const set of sets) {
      assert.ok(set.img, `${hero}/${set.id} has no set image (the picker renders it from R2)`)
      for (const piece of set.items) {
        const matches = byNameAndImg.get(`${piece.name}|${piece.img}`) ?? []
        assert.equal(matches.length, 1, `${hero}/${set.id}: "${piece.name}" matched ${matches.length} armory rows by name+img`)

        // The merged format stores {slot, id} only: resolving the first row carrying that id
        // must land on this exact piece (style variants share an id within a slot).
        const slot = entry.slots.find((s) => s.slot === piece.slot)
        assert.ok(slot, `${hero}/${set.id}: "${piece.name}" claims slot "${piece.slot}" the armory does not have`)
        const sharing = slot.mods.filter((m) => m.id === matches[0].id)
        assert.equal(sharing[0].name, piece.name, `${hero}/${set.id}: id ${matches[0].id} does not resolve to "${piece.name}"`)
      }
    }
  }
})

test('categories.json and other_armory.json describe the same categories', () => {
  const tags = categories.map((category) => category.tag)
  assert.equal(new Set(tags).size, tags.length, 'duplicate category tag')
  assert.deepEqual(new Set(tags), new Set(Object.keys(otherArmory)), 'categories.json and other_armory.json disagree')
  for (const category of categories) assert.ok(category.name, `${category.tag} has no display name`)
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

test('every set item sits in a slot its hero actually has', () => {
  for (const [hero, sets] of Object.entries(heroSets)) {
    const slots = new Set(armory[hero].slots.map((slot) => slot.slot))
    for (const set of sets) {
      for (const piece of set.items) {
        assert.ok(slots.has(piece.slot), `${hero}/${set.id}: slot "${piece.slot}" does not exist`)
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
