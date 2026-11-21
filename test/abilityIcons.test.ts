import assert from 'node:assert/strict'
import test from 'node:test'
import { getHeroAbilitySlots, readAbilityIconModifiers } from '../src/main/services/assets/abilityIconResolver'
import { buildSchema } from '../src/main/services/modifier'
import { getNode, isNode, materializeDeep } from '../src/main/services/modifier/vdf'
import { applyAbilityIconOverrides } from '../src/main/services/pipeline/passes/applyUserAbilityIcons'
import type { VpkEntry, VpkIndex } from '../src/main/services/dota/vpkService'

const ability = 'drow_ranger_wave_of_silence'
const icon = 'axe_berserkers_call'
const resource = (text: string): VpkEntry => ({ archive: 0x7fff, offset: 0, length: 0, preload: Buffer.from(text) })
const stock: VpkIndex = {
  dir: '',
  entries: new Map([
    [
      'scripts/npc/heroes/npc_dota_hero_drow_ranger.txt',
      resource(`"DOTAHeroes" {
      "npc_dota_hero_drow_ranger" {
        "Ability6" "drow_ranger_marksmanship"
        "Ability2" "${ability}"
        "Ability3" "generic_hidden"
        "Ability4" "${ability}"
        "Ability10" "special_bonus_unique_drow_ranger"
      }
    }`)
    ],
    [`panorama/images/spellicons/${icon}_png.vtex_c`, resource('')]
  ])
}

test('ability slots preserve their game order and omit duplicate, hidden and talent slots', () => {
  assert.deepEqual(getHeroAbilitySlots(stock, 'drow_ranger'), [
    { id: ability, slot: 2 },
    { id: 'drow_ranger_marksmanship', slot: 6 }
  ])
})

test('a standalone override adds a wearable redirect and replaces the loadout redirect without touching other heroes', () => {
  const content = `"items_game" { "items" {
    "1" { "name" "Default Drow Head" "prefab" "default_item" "item_slot" "head"
      "model_player" "models/drow_head.vmdl" "used_by_heroes" { "npc_dota_hero_drow_ranger" "1" } }
    "2" { "name" "Default Drow Base" "prefab" "default_item" "item_slot" "hero_base"
      "used_by_heroes" { "npc_dota_hero_drow_ranger" "1" }
      "visuals" {
        "asset_modifier" { "type" "ability_icon" "asset" "${ability}" "modifier" "drow_arcana" "style" "1" }
        "asset_modifier" { "type" "particle" "asset" "existing" "modifier" "replacement" }
      }
    }
    "3" { "name" "Default Axe Head" "prefab" "default_item" "item_slot" "head"
      "model_player" "models/axe_head.vmdl" "used_by_heroes" { "npc_dota_hero_axe" "1" } }
  } }`
  const schema = buildSchema(content)
  const warnings: string[] = []
  const result = applyAbilityIconOverrides(
    content,
    schema,
    stock,
    {
      'drow ranger': { [ability]: icon, unrelated_ability: icon }
    },
    warnings
  )
  assert.deepEqual(result.targets, ['1', '2'])
  assert.equal(warnings.length, 1)
  const rebuilt = buildSchema(result.content)
  for (const id of ['1', '2']) {
    const node = rebuilt.items.get(id)!.entry.value
    assert(isNode(node))
    materializeDeep(result.content, node)
    const modifiers = readAbilityIconModifiers(getNode(node, 'visuals'))
    assert.deepEqual(
      modifiers.map(({ ability, icon }) => ({ ability, icon })),
      [{ ability, icon }]
    )
  }
  assert.match(result.content, /"type"\s+"particle"\s+"asset"\s+"existing"/)
  const untouched = rebuilt.items.get('3')!.entry
  const original = schema.items.get('3')!.entry
  assert.equal(result.content.slice(untouched.valueStart, untouched.valueEnd), content.slice(original.valueStart, original.valueEnd))
  assert.equal(applyAbilityIconOverrides(content, schema, stock, {}, []).content, content)
})
