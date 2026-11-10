/**
 * Set hydration from the armory: `data/hero_sets.json` used to be the second copy of this
 * data, and the merge that removed it was proven equal against the legacy file first
 * (see the merge commit). What stays under test afterwards is the invariant that makes
 * the join safe — every hydrated piece comes back as a real armory row.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import armoryData from '../data/heroes_armory.json'
import { getHeroSets } from '../src/renderer/utils/heroSets'

interface ArmoryMod {
  id?: number
  name: string
}

interface ArmoryEntry {
  tag?: string
  slots: Array<{ slot: string; mods: ArmoryMod[] }>
  sets?: Array<{ id: string; items: Array<{ slot: string; id: number }> }>
}

const armory = armoryData as unknown as Record<string, ArmoryEntry>

test('every hydrated piece resolves to an armory row of the same hero', () => {
  let setsChecked = 0
  let piecesChecked = 0

  for (const [hero, entry] of Object.entries(armory)) {
    const rowNames = new Map<string, Set<string>>()
    for (const slot of entry.slots) {
      const names = new Set(slot.mods.map((mod) => mod.name))
      rowNames.set(slot.slot, names)
    }

    const sets = getHeroSets(entry.tag ?? hero)
    assert.equal(sets.length, (entry.sets ?? []).length, `${hero}: hydrated set count differs from the armory`)

    for (const set of sets) {
      assert.ok(set.items.length > 0, `${hero}/${set.id} hydrated with no pieces`)
      assert.ok(set.name && set.img, `${hero}/${set.id} lost its name or image`)
      for (const piece of set.items) {
        assert.ok(
          rowNames.get(piece.slot)?.has(piece.name),
          `${hero}/${set.id}: "${piece.name}" is not an armory row in slot "${piece.slot}"`
        )
        assert.ok(piece.rarity || set.rarity, `${hero}/${set.id}: piece "${piece.name}" has no rarity anywhere`)
        piecesChecked++
      }
      setsChecked++
    }
  }

  assert.ok(setsChecked > 1900, `only ${setsChecked} sets checked`)
  assert.ok(piecesChecked > 9500, `only ${piecesChecked} pieces checked`)
})

test('heroes with no sets stay empty instead of disappearing from the API', () => {
  for (const hero of ['io', 'kez', 'largo']) {
    assert.deepEqual(getHeroSets(hero), [], `${hero} should have no sets`)
  }
})

test('heroes with sets expose them', () => {
  for (const hero of ['abaddon', 'lina', 'phantom assassin']) {
    assert.ok(getHeroSets(hero).length > 0, `${hero} lost its sets`)
  }
})

test('set lookup survives alias-shaped tags', () => {
  const fromTag = getHeroSets('abaddon')
  const fromAlias = getHeroSets('Abaddon')
  assert.ok(fromTag.length > 0)
  assert.deepEqual(
    fromTag.map((set) => set.id),
    fromAlias.map((set) => set.id)
  )
})
