import test from 'node:test'
import assert from 'node:assert/strict'
import { parseVdf, serializeValue, isNode, materialize } from '../src/main/services/modifier/vdf'
import { buildSchema, itemByName, localize, resolveSlot, isPersonaSlot, personaVariantSlots } from '../src/main/services/modifier/schema'
import { HERO_BASE_MODELS, baseModelForHero } from '../src/main/services/modifier/heroBaseModels'
import { compileItemsGame } from '../src/main/services/modifier/compile'

test('item lookup accepts surrounding whitespace while preserving exact names and rejecting ambiguous aliases', () => {
  const source = `"items_game" { "items" {
    "1" { "name" "Default Head" "prefab" "default_item" "item_slot" "head"
      "used_by_heroes" { "axe" "1" } "model_player" "models/default.vmdl" }
    "2" { "name" "Padded Head " "prefab" "wearable" "item_slot" "head"
      "used_by_heroes" { "axe" "1" } "model_player" "models/padded.vmdl" }
    "3" { "name" "Exact" "prefab" "wearable" }
    "4" { "name" " Exact " "prefab" "wearable" }
    "5" { "name" " Ambiguous" "prefab" "wearable" }
    "6" { "name" "Ambiguous " "prefab" "wearable" }
  } }`
  const schema = buildSchema(source)
  assert.equal(itemByName(schema, 'Padded Head')?.id, '2')
  assert.equal(itemByName(schema, ' Padded Head ')?.id, '2')
  assert.equal(itemByName(schema, 'Exact')?.id, '3')
  assert.equal(itemByName(schema, ' Exact ')?.id, '4')
  assert.equal(itemByName(schema, 'Ambiguous'), undefined)
  for (const name of ['Padded Head', 'Padded Head ']) {
    const result = compileItemsGame(source, { axe: { head: name } })
    assert.deepEqual(result.report.skipped, [])
    assert.equal(result.report.modelSwaps[0]?.sourceModel, 'models/padded.vmdl')
  }
})

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

test('a style with its own model uses that model at the stock wearable path', () => {
  const source = `"items_game" { "items" {
    "1" { "name" "Default Head" "prefab" "default_item" "item_slot" "head"
      "used_by_heroes" { "axe" "1" } "model_player" "models/stock.vmdl" }
    "2" { "name" "Styled Head" "prefab" "wearable" "item_slot" "head"
      "used_by_heroes" { "axe" "1" } "model_player" "models/regular.vmdl"
      "visuals" { "styles" {
        "0" { "skin" "0" }
        "1" { "model_player" "models/alternate.vmdl" "skin" "1" }
      } } }
  } }`

  const picks = { axe: { head: 'Styled Head' } }
  const regular = compileItemsGame(source, picks)
  const alternate = compileItemsGame(source, picks, { axe: { head: { style: 1 } } })
  assert.equal(regular.report.modelSwaps[0]?.sourceModel, 'models/regular.vmdl')
  assert.equal(alternate.report.modelSwaps[0]?.sourceModel, 'models/alternate.vmdl')
  assert.equal(alternate.report.modelSwaps[0]?.destModel, 'models/stock.vmdl')
  assert.equal(alternate.report.validation.ok, true)
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

test('buildSchema lowercases item_slot so one hero never gets two slot groups', () => {
  // Valve writes "Legs" with a capital L for Drow's Death Shadow Boots — the only mixed-case
  // item_slot in items_game.txt.
  const schema = buildSchema(`"items_game"
{
  "items"
  {
    "5844"
    {
      "name" "Death Shadow Boots"
      "item_slot" "Legs"
      "prefab" "wearable"
      "used_by_heroes" { "drow_ranger" "1" }
    }
  }
}`)
  assert.equal(schema.items.get('5844')?.resolvedSlot, 'legs')
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
})

test('a replacement Persona mirrors official gear and rejects regular gear in the same build', () => {
  const personaModel = 'models/heroes/antimage_female/antimage_female.vmdl'
  const item = (id: number, name: string, slot: string, prefab: string, model?: string) => `
    "${id}" {
      "name" "${name}"
      "item_slot" "${slot}"
      "prefab" "${prefab}"
      "used_by_heroes" { "antimage" "1" }
      ${model ? `"model_player" "${model}"` : ''}
    }`
  const source = `"items_game" {
    "items" {
      ${item(1, 'Default Weapon', 'weapon', 'default_item', 'models/male_weapon.vmdl')}
      ${item(2, 'Default Persona Weapon', 'weapon_persona_1', 'default_item', 'models/persona_weapon.vmdl')}
      ${item(3, 'Default Persona Selector', 'persona_selector', 'default_item')}
      ${item(4, 'Regular Weapon', 'weapon', 'wearable', 'models/regular_weapon.vmdl')}
      ${item(5, 'Official Persona Weapon', 'weapon_persona_1', 'wearable', 'models/official_weapon.vmdl')}
      "13783" {
        "name" "The Disciple's Path"
        "item_slot" "persona_selector"
        "prefab" "wearable"
        "used_by_heroes" { "antimage" "1" }
        "visuals" {
          "asset_modifier" { "type" "persona" "persona" "1" }
          "asset_modifier" { "type" "entity_model" "asset" "npc_dota_hero_antimage" "modifier" "${personaModel}" }
        }
      }
    }
  }`
  const options = { overlayIds: [13783], personaSlotsOnlyIds: [13783] }
  const { report } = compileItemsGame(
    source,
    { antimage: { weapon: 'Regular Weapon', persona_weapon: 'Official Persona Weapon' } },
    {},
    options
  )

  assert.ok(report.validation.ok)
  assert.equal(report.skipped[0]?.itemName, 'Regular Weapon')
  assert.deepEqual(report.entityModelOverrides, [])
  assert.deepEqual(
    report.modelSwaps.map((swap) => [swap.destModel, swap.sourceModel]),
    [
      ['models/persona_weapon.vmdl', 'models/official_weapon.vmdl'],
      ['models/male_weapon.vmdl', 'models/official_weapon.vmdl']
    ]
  )
  assert.equal(report.applied.find((patch) => patch.slot === 'persona_selector')?.reason, 'persona-activation')

  const regular = compileItemsGame(source, { antimage: { weapon: 'Regular Weapon' } }, {}, options).report
  assert.deepEqual(
    regular.modelSwaps.map((swap) => swap.destModel),
    ['models/male_weapon.vmdl']
  )
})

test('overlay personas keep uncovered base slots untouched instead of pointing them at prop_null', () => {
  const source = `"items_game" {
    "items" {
      "1" { "name" "Default Weapon" "item_slot" "weapon" "prefab" "default_item" "used_by_heroes" { "phantom_assassin" "1" } "model_player" "models/pa_weapon.vmdl" }
      "2" { "name" "Default Back" "item_slot" "back" "prefab" "default_item" "used_by_heroes" { "phantom_assassin" "1" } "model_player" "models/pa_cape.vmdl" }
      "3" { "name" "Default Persona Selector" "item_slot" "persona_selector" "prefab" "default_item" "used_by_heroes" { "phantom_assassin" "1" } }
      "22723" {
        "name" "Exile Unveiled"
        "item_slot" "persona_selector"
        "prefab" "wearable"
        "used_by_heroes" { "phantom_assassin" "1" }
        "visuals" {
          "asset_modifier" { "type" "persona" "persona" "1" }
          "asset_modifier" { "type" "entity_model" "asset" "npc_dota_hero_phantom_assassin" "modifier" "models/heroes/phantom_assassin_persona/phantom_assassin_persona.vmdl" }
        }
      }
    }
  }`

  const overlay = compileItemsGame(source, { phantom_assassin: { persona: 'Exile Unveiled' } }, {}, { overlayIds: [22723] })
  assert.ok(overlay.report.validation.ok)
  assert.equal(
    overlay.report.applied.some((a) => a.reason === 'persona-hide'),
    false
  )
  assert.equal(overlay.content.includes('prop_null'), false)

  const nonOverlay = compileItemsGame(source, { phantom_assassin: { persona: 'Exile Unveiled' } }, {})
  assert.ok(nonOverlay.report.validation.ok)
  assert.equal(
    nonOverlay.report.applied.some((a) => a.reason === 'persona-hide' && a.targetId === '2'),
    true
  )
  assert.equal(nonOverlay.content.includes('prop_null'), true)
})

test('HERO_BASE_MODELS maps official heroes and provides predictable convention fallback', () => {
  assert.equal(HERO_BASE_MODELS['antimage'], 'models/heroes/antimage/antimage.vmdl')
  assert.equal(HERO_BASE_MODELS['nevermore'], 'models/heroes/shadow_fiend/shadow_fiend.vmdl')
  assert.equal(baseModelForHero('pudge'), 'models/heroes/pudge/pudge.vmdl')
  assert.equal(baseModelForHero('legion_commander'), 'models/heroes/legion_commander/legion_commander.vmdl')
  assert.equal(baseModelForHero('custom_hero'), 'models/heroes/custom_hero/custom_hero.vmdl')
})

test('styled wearable with skin writes visuals.skin and model_skin onto the default item', () => {
  const source = `"items_game"
{
  "items"
  {
    "1"
    {
      "name" "Default Armor"
      "prefab" "default_item"
      "item_slot" "armor"
      "model_player" "models/heroes/antimage/antimage_chest.vmdl"
      "used_by_heroes" { "npc_dota_hero_antimage" "1" }
    }
    "27560"
    {
      "name" "Pinions of Piety - Armor"
      "prefab" "wearable"
      "item_slot" "armor"
      "model_player" "models/items/antimage_female/am_screeauk/am_screeauk_armor.vmdl"
      "used_by_heroes" { "npc_dota_hero_antimage" "1" }
      "visuals"
      {
        "skip_model_combine" "1"
        "styles"
        {
          "0" { "name" "Style 0" "skin" "0" }
          "1" { "name" "Style 1" "skin" "1" }
        }
      }
    }
  }
}`
  const res = compileItemsGame(source, { antimage: { armor: 'Pinions of Piety - Armor' } }, { antimage: { armor: { style: 1 } } })
  assert.ok(res.report.validation.ok)
  assert.match(res.content, /"skin"\s+"1"/)
  assert.match(res.content, /"type"\s+"model_skin"/)
})

test('VDF skipBlock ignores braces and quotes inside comments within opaque blocks', () => {
  const source = `"items_game"
{
  "visuals"
  {
    // comment with unmatched } and "quote
    /* block comment with { and } and " */
    "skin" "1"
  }
  "after" "ok"
}`
  const doc = parseVdf(source, { opaque: (k) => k === 'visuals' })
  assert.equal(doc.root.entries.length, 2)
  const visuals = doc.root.entries[0].value
  assert.ok(isNode(visuals) && visuals.opaque)
  materialize(source, visuals)
  assert.equal(visuals.entries[0].key, 'skin')
  assert.equal(doc.root.entries[1].value, 'ok')
})

test('localize matches mixed-case localization tokens case-insensitively', () => {
  const schema = buildSchema('"items_game" { "items" {} }', {
    localizationText: '"lang" { "Tokens" { "DOTA_Style_Arcana_Alt" "Second Style" } }'
  })
  assert.equal(localize(schema, '#dota_style_arcana_alt'), 'Second Style')
  assert.equal(localize(schema, '#DOTA_Style_Arcana_Alt'), 'Second Style')
})
