import assert from 'node:assert/strict'
import test from 'node:test'
import { buildSchema, compileItemsGame } from '../src/main/services/modifier'
import { applyItemBlocks, readItemsSection } from '../src/main/services/pipeline/itemsGamePatcher'
import { resolveOverlayAbilityIcons } from '../src/main/services/pipeline/passes/resolveOverlayAbilityIcons'

test('a configured overlay uses the selected wearable icon for the listed ability', () => {
  const icon = (asset: string, modifier: string) => `"asset_modifier" { "type" "ability_icon" "asset" "${asset}" "modifier" "${modifier}" }`
  const source = `"items_game" { "items" {
    "10" { "name" "Default Head" "prefab" "default_item" "item_slot" "head"
      "used_by_heroes" { "axe" "1" } "model_player" "models/stock.vmdl" }
    "20" { "name" "Default Weapon" "prefab" "default_item" "item_slot" "weapon"
      "used_by_heroes" { "axe" "1" } }
    "30" { "name" "Test Head" "prefab" "wearable" "item_slot" "head"
      "used_by_heroes" { "axe" "1" } "model_player" "models/wearable.vmdl"
      "visuals" { ${icon('ability_one', 'wearable_one')} ${icon('ability_two', 'wearable_two')} } }
  } }`
  const schema = buildSchema(source)
  const { content, report } = compileItemsGame(source, { axe: { head: 'Test Head' } })
  const overlay = `{ "visuals" { ${icon('ability_one', 'overlay_one')} ${icon('ability_two', 'overlay_two')} } }`
  const { text } = applyItemBlocks(content, [['20', overlay]])
  const overlayTargets = new Set(['20'])
  const preferences = new Map([['20', new Set(['ability_one'])]])
  const actual = resolveOverlayAbilityIcons(text, schema, report.applied, overlayTargets, preferences)
  const span = readItemsSection(actual).blocks.get('20')!
  const visuals = actual.slice(span.start, span.end)

  assert.ok(visuals.includes(icon('ability_one', 'wearable_one')))
  assert.ok(visuals.includes(icon('ability_two', 'overlay_two')))
  assert.equal(resolveOverlayAbilityIcons(text, schema, [], overlayTargets, preferences), text)
  assert.equal(resolveOverlayAbilityIcons(text, schema, report.applied, overlayTargets, new Map()), text)
})
