import test, { type TestContext } from 'node:test'
import assert from 'node:assert/strict'
import { createStore } from 'zustand/vanilla'
import { createLoadoutSlice } from '../src/renderer/state/slices/loadoutSlice'
import { createPresetsSlice } from '../src/renderer/state/slices/presetsSlice'
import type { AppStoreState } from '../src/renderer/state/useAppStore'
import { isPersonaSlotId } from '../src/shared/armory/armoryTypes'
import { RARITY_RANK, rarityRank } from '../src/shared/armory/rarityConfig'
import { buildLaunchArgsString, DEFAULT_LAUNCH_OPTIONS } from '../src/shared/constants/launchOptions'
import { dropStaleStyles } from '../src/shared/types/customization'

test('dropStaleStyles clears a slot style only when its item changes', () => {
  const cust = { earthshaker: { arms: { style: 2 }, belt: { style: 1 } } }
  const armsAndBelt = { arms: 'Arms A', belt: 'Belt B' }

  // Re-equipping the same item keeps the saved style, by identity: no write, no re-render.
  assert.equal(dropStaleStyles(cust, 'earthshaker', armsAndBelt, { ...armsAndBelt }), cust)

  // A different item in the slot takes its style choice with it; untouched slots stay.
  const changed = dropStaleStyles(cust, 'earthshaker', armsAndBelt, { arms: 'Arms C', belt: 'Belt B' })
  assert.deepEqual(changed, { earthshaker: { belt: { style: 1 } } })
  assert.deepEqual(cust.earthshaker.arms, { style: 2 }, 'the input map must not be mutated')
  assert.deepEqual(dropStaleStyles(cust, 'earthshaker', armsAndBelt, { belt: 'Belt B' }), { earthshaker: { belt: { style: 1 } } })

  // A hero with no saved styles is left alone.
  assert.equal(dropStaleStyles(cust, 'zeus', { weapon: 'A' }, { weapon: 'B' }), cust)
})

function createTestStore(t: TestContext) {
  const values = new Map<string, string>()
  const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value)
    }
  })
  t.after(() => {
    if (original) Object.defineProperty(globalThis, 'localStorage', original)
    else Reflect.deleteProperty(globalThis, 'localStorage')
  })
  return () =>
    createStore<AppStoreState>()((set, get, store) => {
      const state: Partial<AppStoreState> = {
        ...createLoadoutSlice(set, get, store),
        ...createPresetsSlice(set, get, store),
        addLog: () => {}
      }
      return state as AppStoreState
    }).getState
}

test('equipping a set replaces the active slots and resets styles even for the same items', (t) => {
  const reopen = createTestStore(t)
  const state = reopen()
  const hero = 'drow_ranger'
  const item = 'Sepulchral Stalker - Back'
  state().setHeroSlot(hero, 'back', item)
  state().setSlotCustomization(hero, 'back', { style: 1 })
  state().setHeroSlot(hero, 'taunt', 'Extra taunt')
  state().equipSet(hero, { id: 'stalker', name: 'Sepulchral Stalker', items: [{ slot: 'back', name: item }] })

  assert.deepEqual(state().heroSlots[hero], { back: item })
  assert.equal(state().heroCustomizations[hero]?.back, undefined)
  assert.deepEqual(reopen()().heroSlots[hero], { back: item })
  assert.equal(reopen()().heroCustomizations[hero]?.back, undefined)

  state().setSlotCustomization(hero, 'back', { style: 1 })
  state().setHeroSlot(hero, 'back', 'Tyrian Silent Wake')
  assert.equal(state().heroCustomizations[hero]?.back, undefined)
  state().setHeroSlot(hero, 'back', item)
  assert.equal(reopen()().heroCustomizations[hero]?.back, undefined)
})

test('a preset persists its active loadouts and preserves the inactive stance', (t) => {
  const reopen = createTestStore(t)
  const state = reopen()
  state().setHeroSlot('antimage', 'weapon', 'Previous weapon')
  state().setHeroSlot('drow_ranger', 'back', 'Tyrian Silent Wake')
  state().setSlotCustomization('drow_ranger', 'back', { style: 1 })
  state().setHeroSlot('drow_ranger', 'head', 'Old Head')
  state().setSlotCustomization('drow_ranger', 'head', { style: 1 })
  state().setHeroSlot('axe', 'weapon', 'Old axe')
  const heroSlots = { antimage: { persona: 'Wei' }, drow_ranger: { back: 'Sepulchral Stalker - Back' } }
  state().applyPreset({ id: 'preset', name: 'Test preset', timestamp: 0, heroSlots })

  const restored = reopen()
  assert.deepEqual(state().heroSlots, heroSlots)
  assert.deepEqual(restored().heroSlots, heroSlots)
  assert.equal(restored().heroActiveStance.antimage, 'persona')
  assert.equal(restored().heroCustomizations.drow_ranger?.back, undefined)
  assert.equal(restored().heroCustomizations.drow_ranger?.head, undefined)
  assert.deepEqual(restored().heroStanceSlots.axe?.default, {})
  restored().setHeroActiveStance('antimage', 'default')
  assert.deepEqual(restored().heroSlots.antimage, { weapon: 'Previous weapon' })
})

test('selecting a reconnect dependent leaves the rest of the loadout untouched', (t) => {
  const reopen = createTestStore(t)
  const store = reopen()
  const hero = 'earthshaker'
  const head = 'Intergalactic Orbliterator - Head'
  const otherBelt = 'Belt of the Behemoth'

  store().setHeroSlot(hero, 'belt', otherBelt)
  store().setSlotCustomization(hero, 'belt', { style: 1 })
  store().setHeroSlot(hero, 'head', head)
  assert.deepEqual(reopen()().heroSlots[hero], { head, belt: otherBelt })
  assert.equal(store().heroCustomizations[hero]?.belt?.style, 1)

  store().resetHeroSlot(hero, 'belt')
  assert.deepEqual(store().heroSlots[hero], { head })
  store().applyPreset({ id: 'old', name: 'Old loadout', timestamp: 0, heroSlots: { [hero]: { head } } })
  assert.deepEqual(store().heroSlots[hero], { head })
  store().setHeroSlot(hero, 'belt', otherBelt)
  assert.deepEqual(reopen()().heroSlots[hero], { head, belt: otherBelt })
})

test('reconnect dependents and carriers do not replace or clear each other', (t) => {
  const state = createTestStore(t)()
  const hero = 'bane'
  state().setHeroSlot(hero, 'arms', 'Feasts of Fear - Arms')
  assert.equal(state().heroSlots[hero].arms, 'Feasts of Fear - Arms')
  assert.equal(state().heroSlots[hero].shoulder, undefined)
  state().setHeroSlot(hero, 'back', 'Cloth of Lucid Torment')
  assert.equal(state().heroSlots[hero].back, 'Cloth of Lucid Torment')
  assert.equal(state().heroSlots[hero].arms, 'Feasts of Fear - Arms')
  state().resetHeroSlot(hero, 'shoulder')
  assert.equal(state().heroSlots[hero].back, 'Cloth of Lucid Torment')
  assert.equal(state().heroSlots[hero].arms, 'Feasts of Fear - Arms')
})

test('ability icon overrides survive item changes and reloads, and presets restore cleared overrides', (t) => {
  const reopen = createTestStore(t)
  const state = reopen()
  const hero = 'drow ranger'
  const ability = 'drow_ranger_wave_of_silence'
  const icon = 'axe_berserkers_call'
  state().setAbilityIcon(hero, ability, icon)
  state().setHeroSlot(hero, 'back', 'Tyrian Silent Wake')
  state().addPreset('Icon loadout')
  assert.equal(reopen()().heroAbilityIcons[hero]?.[ability], icon)

  state().setAbilityIcon(hero, ability)
  assert.deepEqual(reopen()().heroAbilityIcons, {})
  state().applyPreset(state().presets[0])
  assert.equal(reopen()().heroAbilityIcons[hero]?.[ability], icon)
  state().resetHeroAbilityIcons(hero)
  assert.deepEqual(reopen()().heroAbilityIcons, {})
  assert.equal(state().heroSlots[hero].back, 'Tyrian Silent Wake')
  state().setAbilityIcon(hero, ability, icon)
  state().resetAllHeroSlots(hero)
  assert.deepEqual(reopen()().heroAbilityIcons, {})
})

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

test('isPatchReset only flags patch reset when autoDetect is enabled on valid unconfigured dotaDir', async () => {
  const { isPatchReset } = await import('../src/renderer/state/useAppStore')
  assert.equal(
    isPatchReset(
      {
        validDotaDir: true,
        gameinfoConfigured: false,
        signaturesBypassed: false,
        vpkFileExists: true
      },
      true
    ),
    true
  )
  assert.equal(
    isPatchReset(
      {
        validDotaDir: true,
        gameinfoConfigured: false,
        signaturesBypassed: false,
        vpkFileExists: true
      },
      false
    ),
    false
  )
  assert.equal(
    isPatchReset(
      {
        validDotaDir: true,
        gameinfoConfigured: true,
        signaturesBypassed: true,
        vpkFileExists: true
      },
      true
    ),
    false
  )
  assert.equal(
    isPatchReset(
      {
        validDotaDir: true,
        gameinfoConfigured: false,
        signaturesBypassed: false,
        vpkFileExists: false
      },
      true
    ),
    false
  )
})
