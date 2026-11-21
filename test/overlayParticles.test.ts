import assert from 'node:assert/strict'
import test from 'node:test'
import { buildSchema, compileItemsGame } from '../src/main/services/modifier'
import { resolveOverlayParticleConflicts } from '../src/main/services/pipeline/passes/resolveOverlayParticles'
import { applyItemBlocks, readItemsSection } from '../src/main/services/pipeline/itemsGamePatcher'
import type { VpkIndex, VpkPackEntry } from '../src/main/services/dota/vpkService'

test('a selected wearable replaces a conflicting overlay particle and its redirect', () => {
  const stockPath = 'particles/units/heroes/hero_axe/ability.vpcf'
  const secondaryPath = 'particles/units/heroes/hero_axe/secondary.vpcf'
  const selectedPath = 'particles/econ/items/axe/wearable/ability.vpcf'
  const overlayPath = 'particles/econ/items/axe/overlay/ability.vpcf'
  const redirect = (asset: string, modifier: string) => `"asset_modifier" { "type" "particle" "asset" "${asset}" "modifier" "${modifier}" }`
  const source = `"items_game" { "items" {
    "10" { "name" "Default Head" "prefab" "default_item" "item_slot" "head"
      "used_by_heroes" { "axe" "1" } "model_player" "models/stock.vmdl" }
    "20" { "name" "Default Weapon" "prefab" "default_item" "item_slot" "weapon"
      "used_by_heroes" { "axe" "1" } }
    "30" { "name" "Test Head" "prefab" "wearable" "item_slot" "head"
      "used_by_heroes" { "axe" "1" } "model_player" "models/wearable.vmdl"
      "visuals" { ${redirect(stockPath, selectedPath)} ${redirect(secondaryPath, selectedPath)} } }
  } }`
  const schema = buildSchema(source)
  const compiled = compileItemsGame(source, { axe: { head: 'Test Head' } })
  const overlay = `{
    "visuals" { ${redirect(stockPath, overlayPath)} ${redirect(secondaryPath, overlayPath)} }
  }`
  const { text } = applyItemBlocks(compiled.content, [['20', overlay]])
  const particle = (data: string) => ({ archive: 0x7fff, offset: 0, length: 0, preload: Buffer.from(data) })
  const stock: VpkIndex = {
    dir: '',
    entries: new Map([
      [`${stockPath}_c`, particle('stock')],
      [`${selectedPath}_c`, particle('selected')]
    ])
  }
  const entries = new Map<string, VpkPackEntry>([[`${stockPath}_c`, { vpkPath: `${stockPath}_c`, source: Buffer.from('overlay') }]])
  const warnings: string[] = []

  const content = resolveOverlayParticleConflicts(text, schema, compiled.report.applied, new Set(['20']), entries, stock, warnings)

  assert.deepEqual(warnings, [])
  assert.deepEqual(entries.get(`${stockPath}_c`)?.source, Buffer.from('selected'))
  assert.equal(entries.has(`${secondaryPath}_c`), false)
  const target = readItemsSection(content).blocks.get('20')!
  const actual = content.slice(target.start, target.end)
  assert.ok(actual.includes(redirect(stockPath, selectedPath)))
  assert.ok(actual.includes(redirect(secondaryPath, overlayPath)))
})
