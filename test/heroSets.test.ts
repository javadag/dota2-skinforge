/**
 * The armory now carries set membership itself, so this runs while `hero_sets.json` still
 * exists: hydrating the merged armory has to reproduce the legacy file set for set and
 * piece for piece. That is the proof that folding the two files together changed nothing
 * the picker, the set badges or "Equip Entire Set" can see.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import legacyData from '../data/hero_sets.json'
import { getHeroSets, type HeroSet } from '../src/renderer/utils/heroSets'

interface LegacySet {
  id: string
  name: string
  rarity?: string
  img?: string
  isPersona?: boolean
  items: Array<{ slot: string; name: string; rarity?: string; img?: string }>
}

const legacy = legacyData as unknown as Record<string, LegacySet[]>

function byId(sets: HeroSet[]): Map<string, HeroSet> {
  return new Map(sets.map((set) => [set.id, set]))
}

test('hydrating the armory reproduces hero_sets.json exactly', () => {
  let setsChecked = 0
  let piecesChecked = 0

  for (const [hero, expected] of Object.entries(legacy)) {
    const hydrated = byId(getHeroSets(hero))
    assert.equal(hydrated.size, expected.length, `${hero}: ${expected.length} sets expected, ${hydrated.size} hydrated`)

    for (const want of expected) {
      const got = hydrated.get(want.id)
      assert.ok(got, `${hero}: set ${want.id} did not hydrate`)
      assert.equal(got.name, want.name, `${hero}/${want.id}: name`)
      assert.equal(got.rarity, want.rarity, `${hero}/${want.id}: rarity`)
      assert.equal(got.img, want.img, `${hero}/${want.id}: image`)
      assert.equal(got.isPersona, want.isPersona, `${hero}/${want.id}: isPersona`)

      assert.equal(got.items.length, want.items.length, `${hero}/${want.id}: piece count`)
      want.items.forEach((piece, index) => {
        const gotPiece = got.items[index]
        assert.equal(gotPiece.slot, piece.slot, `${hero}/${want.id}: piece ${index} slot`)
        assert.equal(gotPiece.name, piece.name, `${hero}/${want.id}: piece ${index} name`)
        assert.equal(gotPiece.rarity, piece.rarity, `${hero}/${want.id}: piece ${index} rarity`)
        assert.equal(gotPiece.img, piece.img, `${hero}/${want.id}: piece ${index} image`)
        piecesChecked++
      })
      setsChecked++
    }
  }

  // Guard against a test that quietly stopped comparing anything.
  assert.ok(setsChecked > 1900, `only ${setsChecked} sets checked`)
  assert.ok(piecesChecked > 9500, `only ${piecesChecked} pieces checked`)
})

test('heroes with no sets stay empty instead of disappearing from the API', () => {
  for (const hero of ['io', 'kez', 'largo']) {
    assert.deepEqual(getHeroSets(hero), [], `${hero} should have no sets`)
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
