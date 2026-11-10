import test from 'node:test'
import assert from 'node:assert/strict'
import { isPersonaSlotId } from '../src/shared/constants/personaSlots'
import { RARITY_RANK, rarityRank } from '../src/shared/armory/rarityConfig'
import { buildLaunchArgsString, DEFAULT_LAUNCH_OPTIONS } from '../src/shared/constants/launchOptions'

test('isPersonaSlotId correctly identifies persona slots and excludes base slots', () => {
  assert.equal(isPersonaSlotId('persona'), true)
  assert.equal(isPersonaSlotId('persona_selector'), true)
  assert.equal(isPersonaSlotId('persona_head'), true)
  assert.equal(isPersonaSlotId('head_persona_1'), true)
  assert.equal(isPersonaSlotId('weapon_persona_2'), true)

  // Base hero slots must return false
  assert.equal(isPersonaSlotId('weapon'), false)
  assert.equal(isPersonaSlotId('head'), false)
  assert.equal(isPersonaSlotId('armor'), false)
  assert.equal(isPersonaSlotId('back'), false)
  assert.equal(isPersonaSlotId('arms'), false)
  assert.equal(isPersonaSlotId('legs'), false)
})

test('rarityRank correctly ranks items rarest-first', () => {
  assert.equal(RARITY_RANK.arcana, 8)
  assert.equal(rarityRank('arcana') > rarityRank('immortal'), true)
  assert.equal(rarityRank('immortal') > rarityRank('legendary'), true)
  assert.equal(rarityRank('legendary') > rarityRank('mythical'), true)
  assert.equal(rarityRank('mythical') > rarityRank('rare'), true)
  assert.equal(rarityRank('rare') > rarityRank('uncommon'), true)
  assert.equal(rarityRank('uncommon') > rarityRank('common'), true)
  assert.equal(rarityRank(undefined), 0)
  assert.equal(rarityRank('unknown_rarity'), 0)
})

test('buildLaunchArgsString formats flags properly and respects options', () => {
  const defaultFlags = buildLaunchArgsString(DEFAULT_LAUNCH_OPTIONS)
  assert.match(defaultFlags, /-novid/)
  assert.match(defaultFlags, /-map dota/)
  assert.match(defaultFlags, /-high/)
  assert.match(defaultFlags, /-nojoy/)
  assert.doesNotMatch(defaultFlags, /-console/)
  assert.doesNotMatch(defaultFlags, /-dx11/)

  const customFlags = buildLaunchArgsString({
    novid: true,
    map: false,
    high: false,
    console: true,
    nojoy: false,
    dx11: true,
    customArgs: '-language english'
  })
  assert.match(customFlags, /-novid/)
  assert.match(customFlags, /-console/)
  assert.match(customFlags, /-dx11/)
  assert.match(customFlags, /-language english/)
  assert.doesNotMatch(customFlags, /-map dota/)
  assert.doesNotMatch(customFlags, /-high/)
})
