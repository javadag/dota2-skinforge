/**
 * Coverage for the armory resolver: it had none, and every one of these behaviours is what
 * keeps the item picker in sync with `data/heroes_armory.json`.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { formatHeroName, getHeroSlotsDefinition, normalizeTag } from '../src/renderer/components/slotGenerator'
import { getItemRarityKey, rarityRank } from '../src/renderer/utils/itemImages'

test('normalizeTag ignores case and punctuation', () => {
  assert.equal(normalizeTag('anti-mage'), 'antimage')
  assert.equal(normalizeTag('Ancient Apparition'), 'ancientapparition')
  assert.equal(normalizeTag('antimage'), 'antimage')
})

test('formatHeroName looks up category display names from other_armory', () => {
  assert.equal(formatHeroName('music_packs'), 'Music Packs')
  assert.equal(formatHeroName('kill_streak'), 'Kill Streak Effects')
  assert.equal(formatHeroName('terrain'), 'Terrain')
})

test('formatHeroName title-cases hero tags and tolerates junk', () => {
  assert.equal(formatHeroName('outworld devourer'), 'Outworld Devourer')
  assert.equal(formatHeroName('natures prophet'), 'Natures Prophet')
  assert.equal(formatHeroName(null), '')
  assert.equal(formatHeroName(undefined), '')
})

test('getHeroSlotsDefinition resolves a hero, rarest item first', () => {
  const armory = getHeroSlotsDefinition('abaddon')
  assert.ok(armory, 'abaddon must resolve')
  assert.ok(armory.slots.length > 0)

  const rank = (mod: { name: string; rarity?: string }): number => rarityRank(getItemRarityKey(mod))
  for (const slot of armory.slots) {
    for (let i = 1; i < slot.mods.length; i++) {
      assert.ok(rank(slot.mods[i - 1]) >= rank(slot.mods[i]), `${slot.slot} is not sorted rarest-first at index ${i}`)
    }
  }
})

test('getHeroSlotsDefinition tolerates alias-shaped tags', () => {
  assert.ok(getHeroSlotsDefinition('Anti-Mage'))
  assert.ok(getHeroSlotsDefinition('ANCIENT APPARITION'))
})

test('getHeroSlotsDefinition returns null for an unknown tag', () => {
  assert.equal(getHeroSlotsDefinition('not a hero'), null)
  assert.equal(getHeroSlotsDefinition(''), null)
  assert.equal(getHeroSlotsDefinition(null), null)
})

test('getHeroSlotsDefinition memoises: same tag returns the same object', () => {
  const first = getHeroSlotsDefinition('axe')
  const second = getHeroSlotsDefinition('axe')
  assert.equal(first, second, 'callers rely on a stable reference for re-renders')
})

test('getHeroSlotsDefinition resolves non-hero categories too', () => {
  const couriers = getHeroSlotsDefinition('courier')
  assert.ok(couriers, 'courier category must resolve')
  assert.ok(couriers.slots.some((slot) => slot.mods.length > 0))
})

test('resolved armories carry no taunt slot', () => {
  for (const tag of ['axe', 'juggernaut', 'pudge']) {
    const armory = getHeroSlotsDefinition(tag)
    assert.ok(armory)
    assert.ok(
      armory.slots.every((slot) => slot.slot !== 'taunt'),
      `${tag} still exposes a taunt slot`
    )
  }
})
