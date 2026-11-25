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

test('stages hero-specific stock ability particles for selected wearables without an overlay', () => {
  const screamProj = 'particles/units/heroes/hero_queenofpain/queen_scream_of_pain.vpcf'
  const screamDonor = 'particles/econ/items/queen_of_pain/qop_2022_immortal/queen_2022_scream_of_pain_projectile.vpcf'
  const blinkStock = 'particles/items_fx/blink_dagger_start.vpcf'
  const blinkDonor = 'particles/econ/items/queen_of_pain/custom_blink.vpcf'
  const skippedStock = 'particles/units/heroes/hero_queenofpain/queen_ambient_blade.vpcf'
  const skippedDonor = 'particles/econ/items/queen_of_pain/ambient_generic.vpcf'
  const criteriaStock = 'particles/units/heroes/hero_queenofpain/queen_criteria.vpcf'
  const criteriaDonor = 'particles/econ/items/queen_of_pain/criteria_donor.vpcf'
  const source = `"items_game" { "items" {
    "83" { "name" "Queen of Pain's Armor" "prefab" "default_item" "item_slot" "shoulder"
      "used_by_heroes" { "npc_dota_hero_queenofpain" "1" } "model_player" "models/heroes/queenofpain/shoulders.vmdl" }
    "23697" { "name" "Bloodfeather Frock" "prefab" "wearable" "item_slot" "shoulder"
      "used_by_heroes" { "npc_dota_hero_queenofpain" "1" } "model_player" "models/items/queenofpain/qop_2022_immortal/qop_2022_immortal.vmdl"
      "visuals" {
        "asset_modifier" { "type" "particle" "asset" "${screamProj}" "modifier" "${screamDonor}" }
        "asset_modifier" { "type" "particle" "asset" "${blinkStock}" "modifier" "${blinkDonor}" }
        "asset_modifier" { "type" "particle" "asset" "${skippedStock}" "modifier" "${skippedDonor}" "replacement_type" "PARTICLE_REPLACE_NONE" }
        "asset_modifier" { "type" "particle" "asset" "${criteriaStock}" "modifier" "${criteriaDonor}" "criteria" "isbetween( style, 1, 2 )" }
      } }
  } }`
  const schema = buildSchema(source)
  const compiled = compileItemsGame(source, { queenofpain: { shoulder: 'Bloodfeather Frock' } })
  const particle = (data: string) => ({ archive: 0x7fff, offset: 0, length: 0, preload: Buffer.from(data) })
  const stock: VpkIndex = {
    dir: '',
    entries: new Map([
      [`${screamProj}_c`, particle('stock-scream')],
      [`${screamDonor}_c`, particle('immortal-scream')],
      [`${blinkStock}_c`, particle('stock-blink')],
      [`${blinkDonor}_c`, particle('custom-blink')],
      [`${skippedStock}_c`, particle('stock-skipped')],
      [`${skippedDonor}_c`, particle('donor-skipped')],
      [`${criteriaStock}_c`, particle('stock-criteria')],
      [`${criteriaDonor}_c`, particle('donor-criteria')]
    ])
  }
  const entries = new Map<string, VpkPackEntry>()
  const warnings: string[] = []

  resolveOverlayParticleConflicts(compiled.content, schema, compiled.report.applied, new Set(), entries, stock, warnings)

  assert.deepEqual(warnings, [])
  assert.deepEqual(entries.get(`${screamProj}_c`)?.source, Buffer.from('immortal-scream'))
  // Shared non-hero item particles, PARTICLE_REPLACE_NONE, and criteria-gated modifiers must not be staged globally.
  assert.equal(entries.has(`${blinkStock}_c`), false)
  assert.equal(entries.has(`${skippedStock}_c`), false)
  assert.equal(entries.has(`${criteriaStock}_c`), false)
})
