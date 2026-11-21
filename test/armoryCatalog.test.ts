/**
 * Coverage for the armory catalog resolver: keeps the item picker in sync with
 * `data/heroes_armory.json` and `data/other_armory.json`.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { formatCatalogName, normalizeEntityTag, resolveArmoryEntry } from '../src/shared/armory/armoryCatalog'
import { getItemRarityKey, rarityRank } from '../src/shared/armory/rarityConfig'

test('normalizeEntityTag ignores case and punctuation', () => {
  assert.equal(normalizeEntityTag('anti-mage'), 'antimage')
  assert.equal(normalizeEntityTag('Ancient Apparition'), 'ancientapparition')
  assert.equal(normalizeEntityTag('antimage'), 'antimage')
})

test('formatCatalogName looks up category display names from other_armory', () => {
  assert.equal(formatCatalogName('music_packs'), 'Music Packs')
  assert.equal(formatCatalogName('kill_streak'), 'Kill Streak Effects')
  assert.equal(formatCatalogName('terrain'), 'Terrain')
})

test('formatCatalogName title-cases hero tags and tolerates junk', () => {
  assert.equal(formatCatalogName('outworld devourer'), 'Outworld Devourer')
  assert.equal(formatCatalogName('natures prophet'), 'Natures Prophet')
  assert.equal(formatCatalogName(null), '')
  assert.equal(formatCatalogName(undefined), '')
})

test('resolveArmoryEntry resolves a hero, rarest item first', () => {
  const armory = resolveArmoryEntry('abaddon')
  assert.ok(armory, 'abaddon must resolve')
  assert.ok(armory.slots.length > 0)

  const rank = (mod: { name: string; rarity?: string }): number => rarityRank(getItemRarityKey(mod))
  for (const slot of armory.slots) {
    for (let i = 1; i < slot.mods.length; i++) {
      assert.ok(rank(slot.mods[i - 1]) >= rank(slot.mods[i]), `${slot.slot} is not sorted rarest-first at index ${i}`)
    }
  }
})

test('resolveArmoryEntry tolerates alias-shaped tags', () => {
  assert.ok(resolveArmoryEntry('Anti-Mage'))
  assert.ok(resolveArmoryEntry('ANCIENT APPARITION'))
})

test('resolveArmoryEntry returns null for an unknown tag', () => {
  assert.equal(resolveArmoryEntry('not a hero'), null)
  assert.equal(resolveArmoryEntry(''), null)
  assert.equal(resolveArmoryEntry(null), null)
})

test('resolveArmoryEntry memoises: same tag returns the same object', () => {
  const first = resolveArmoryEntry('axe')
  const second = resolveArmoryEntry('axe')
  assert.equal(first, second, 'callers rely on a stable reference for re-renders')
})

test('resolveArmoryEntry resolves non-hero categories too', () => {
  const couriers = resolveArmoryEntry('courier')
  assert.ok(couriers, 'courier category must resolve')
  assert.ok(couriers.slots.some((slot) => slot.mods.length > 0))
})

test('resolved armories carry no taunt slot', () => {
  for (const tag of ['axe', 'juggernaut', 'pudge']) {
    const armory = resolveArmoryEntry(tag)
    assert.ok(armory)
    assert.ok(
      armory.slots.every((slot) => slot.slot !== 'taunt'),
      `${tag} still exposes a taunt slot`
    )
  }
})
