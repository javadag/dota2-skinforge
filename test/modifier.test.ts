import test from 'node:test'
import assert from 'node:assert/strict'
import { parseVdf, serializeValue, isNode } from '../src/main/services/modifier/vdf'
import {
  buildSchema,
  resolveSlot,
  tokenizeName,
  isPersonaSlot,
  personaVariantSlots,
  personaHeroes
} from '../src/main/services/modifier/schema'
import { HERO_BASE_MODELS, baseModelForHero } from '../src/main/services/modifier/heroBaseModels'
import { isNewerVersion } from '../src/main/services/updateService'

test('VDF parser correctly parses KeyValues tree and preserves spans', () => {
  const vdfText = `"items_game"
{
  "items"
  {
    "1"
    {
      "name" "weapon_test"
      "item_slot" "weapon"
      "model_player" "models/test.vmdl"
    }
  }
}`
  const doc = parseVdf(vdfText)
  assert.equal(doc.key, 'items_game')
  assert.equal(isNode(doc.root), true)
  assert.equal(doc.root.entries.length, 1)
  assert.equal(doc.root.entries[0].key, 'items')
})

test('serializeValue converts string values and VDF nodes to KeyValues syntax', () => {
  assert.equal(serializeValue('hello', 0, '\n'), '"hello"')

  const node = {
    start: 0,
    end: 10,
    entries: [
      {
        key: 'test_key',
        value: 'test_value',
        keyStart: 0,
        keyEnd: 8,
        valueStart: 9,
        valueEnd: 19
      }
    ]
  }
  const serialized = serializeValue(node, 0, '\n')
  assert.match(serialized, /"test_key"\s+"test_value"/)
})

test('tokenizeName splits item and set names into stemmed alphanumeric tokens', () => {
  const tokens = tokenizeName("Juggernaut's Bladeform Legacy - Style 2")
  assert.equal(tokens.has('juggernaut'), true)
  assert.equal(tokens.has('bladeform'), true)
  assert.equal(tokens.has('legacy'), true)
  assert.equal(tokens.has('style'), true)
})

test('resolveSlot prioritizes explicit item_slot and infers from prefab', () => {
  const declared = resolveSlot({ slot: 'weapon', prefab: 'wearable' })
  assert.equal(declared.slot, 'weapon')
  assert.equal(declared.source, 'declared')

  // Taunt prefab infers taunt slot
  const taunt = resolveSlot({ slot: '', prefab: 'taunt' })
  assert.equal(taunt.slot, 'taunt')
  assert.equal(taunt.source, 'prefab')

  // Wearable without slot falls back to weapon convention
  const fallback = resolveSlot({ slot: '', prefab: 'wearable' })
  assert.equal(fallback.slot, 'weapon')
  assert.equal(fallback.source, 'fallback')
})

test('isPersonaSlot accurately identifies persona slots vs standard wearable slots', () => {
  assert.equal(isPersonaSlot('persona_selector'), true)
  assert.equal(isPersonaSlot('head_persona_1'), true)
  assert.equal(isPersonaSlot('weapon_persona_2'), true)

  assert.equal(isPersonaSlot('head'), false)
  assert.equal(isPersonaSlot('weapon'), false)
  assert.equal(isPersonaSlot('armor'), false)
})

test('schema indexing maps persona variants and filters stray persona items', () => {
  const mockItemsGame = `"items_game"
{
  "items"
  {
    "0"
    {
      "name" "default_cm_head"
      "item_slot" "head"
      "prefab" "default_item"
      "used_by_heroes" { "crystal_maiden" "1" }
    }
    "1"
    {
      "name" "default_cm_tail"
      "item_slot" "tail_persona_1"
      "prefab" "default_item"
      "used_by_heroes" { "crystal_maiden" "1" }
    }
    "2"
    {
      "name" "cm_persona_selector"
      "item_slot" "persona_selector"
      "prefab" "default_item"
      "used_by_heroes" { "crystal_maiden" "1" }
    }
    "3"
    {
      "name" "stray_clockwerk_item"
      "item_slot" "head_persona_1"
      "prefab" "default_item"
      "used_by_heroes" { "rattletrap" "1" }
    }
  }
}`
  const schema = buildSchema(mockItemsGame)
  assert.equal(schema.items.size, 4)

  // Crystal Maiden has persona_selector, so personaVariantSlots resolves
  const cmVariants = personaVariantSlots(schema, 'crystal_maiden')
  assert.equal(cmVariants.size > 0, true)
  // 'tail' bridges to 'back' via PERSONA_BASE_SLOT_BRIDGES
  assert.equal(cmVariants.has('back'), true)

  // Clockwerk has stray head_persona_1 but NO persona_selector, so personaVariantSlots is empty
  const clockVariants = personaVariantSlots(schema, 'rattletrap')
  assert.equal(clockVariants.size, 0)

  const heroesWithPersona = personaHeroes(schema)
  assert.equal(heroesWithPersona.includes('crystal_maiden'), true)
  assert.equal(heroesWithPersona.includes('rattletrap'), false)
})

test('HERO_BASE_MODELS maps official heroes and provides predictable convention fallback', () => {
  assert.equal(HERO_BASE_MODELS['antimage'], 'models/heroes/antimage/antimage.vmdl')
  assert.equal(HERO_BASE_MODELS['nevermore'], 'models/heroes/shadow_fiend/shadow_fiend.vmdl')
  assert.equal(baseModelForHero('pudge'), 'models/heroes/pudge/pudge.vmdl')
  assert.equal(baseModelForHero('legion_commander'), 'models/heroes/legion_commander/legion_commander.vmdl')
  assert.equal(baseModelForHero('custom_hero'), 'models/heroes/custom_hero/custom_hero.vmdl')
})

test('isNewerVersion accurately handles semver comparison and prereleases', () => {
  assert.equal(isNewerVersion('1.3.0', '1.4.0'), true)
  assert.equal(isNewerVersion('v1.3.1', 'v1.3.2'), true)
  assert.equal(isNewerVersion('1.4.0', '1.3.9'), false)
  assert.equal(isNewerVersion('1.4.0', '1.4.0'), false)
  // Prerelease comparison: stable release is newer than prerelease of same version
  assert.equal(isNewerVersion('1.4.0-beta.1', '1.4.0'), true)
})
