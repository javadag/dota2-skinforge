const assert = require('assert')
const { applyModModifications } = require('../src/main/services/modifier/compiler')

const sampleVdf = `
"items_game"
{
	"items"
	{
		"913"
		{
			"name"		"terrorblade_base"
			"prefab"	"default_item"
			"item_slot"	"hero_base"
			"used_by_heroes" { "npc_dota_hero_terrorblade" "1" }
			"model_player"	"models/heroes/terrorblade/terrorblade.vmdl"
		}
		"540"
		{
			"name"		"Terrorblade's Ambient Effects"
			"prefab"	"default_item"
			"item_slot"	"ambient_effects"
			"used_by_heroes" { "npc_dota_hero_terrorblade" "1" }
			"visuals"
			{
				"asset_modifier0"
				{
					"type"		"particle_create"
					"modifier"	"particles/units/heroes/hero_terrorblade/terrorblade_feet_effects.vpcf"
					"affected_by_color_gems" "1"
				}
			}
		}
		"5957"
		{
			"name"		"Fractal Horns of Inner Abysm"
			"prefab"	"wearable"
			"item_slot"	"hero_base"
			"used_by_heroes" { "npc_dota_hero_terrorblade" "1" }
			"particle_folder" "particles/econ/items/terrorblade/terrorblade_horns_arcana"
			"visuals"
			{
				"asset_modifier"
				{
					"type"		"entity_model"
					"asset"		"npc_dota_hero_terrorblade"
					"modifier"	"models/heroes/terrorblade/terrorblade_arcana.vmdl"
				}
				"asset_modifier"
				{
					"type"		"particle_create"
					"modifier"	"particles/econ/items/terrorblade/terrorblade_horns_arcana/terrorblade_ambient_body_arcana_horns.vpcf"
				}
			}
		}
	}
}
`

const result = applyModModifications(
  sampleVdf,
  { terrorblade: { hero_base: 'Fractal Horns of Inner Abysm' } },
  { terrorblade: { hero_base: { gemColor: '#D11FA1', gemName: 'Rubiline' } } }
)

assert.strictEqual(result.patchedCount, 2, 'Should patch both base and ambient effects')
assert.ok(result.modifiedContent.includes('particle_control_point'), 'Must inject particle_control_point')
assert.ok(result.modifiedContent.includes('209 31 161'), 'Must inject Rubiline RGB values')
assert.ok(result.modifiedContent.includes('"control_point_number"\t\t"15"'), 'Must target CP 15')
assert.ok(result.modifiedContent.includes('"control_point_number"\t\t"16"'), 'Must target CP 16')
assert.ok(result.modifiedContent.includes('"cp_position"\t\t"1 0 0"'), 'Must set CP 16 activation to 1 0 0')

// Test 2: Full Terrorblade setup with defHead (478) and Arcana Horns (37161)
const sampleVdfWithHead = `
"items_game"
{
	"items"
	{
		"913"
		{
			"name"		"terrorblade_base"
			"prefab"	"default_item"
			"item_slot"	"hero_base"
			"used_by_heroes" { "npc_dota_hero_terrorblade" "1" }
		}
		"478"
		{
			"name"		"terrorblade_horns"
			"prefab"	"default_item"
			"item_slot"	"head"
			"used_by_heroes" { "npc_dota_hero_terrorblade" "1" }
		}
		"540"
		{
			"name"		"Terrorblade's Ambient Effects"
			"prefab"	"default_item"
			"item_slot"	"ambient_effects"
			"used_by_heroes" { "npc_dota_hero_terrorblade" "1" }
		}
		"5957"
		{
			"name"		"Fractal Horns of Inner Abysm"
			"prefab"	"wearable"
			"item_slot"	"hero_base"
			"used_by_heroes" { "npc_dota_hero_terrorblade" "1" }
			"visuals"
			{
				"asset_modifier"
				{
					"type"		"particle_create"
					"modifier"	"particles/econ/items/terrorblade/terrorblade_horns_arcana/terrorblade_ambient_body_arcana_horns.vpcf"
				}
			}
		}
		"37161"
		{
			"name"		"Fractal Horns of Inner Abysm - Horns"
			"prefab"	"wearable"
			"item_slot"	"head"
			"used_by_heroes" { "npc_dota_hero_terrorblade" "1" }
			"model_player"	"models/heroes/terrorblade/horns_arcana.vmdl"
			"visuals"
			{
				"asset_modifier"
				{
					"type"		"particle"
					"asset"		"particles/units/heroes/hero_terrorblade/terrorblade_ambient_eyes.vpcf"
					"modifier"	"particles/econ/items/terrorblade/terrorblade_horns_arcana/terrorblade_ambient_eyes_arcana_horns.vpcf"
				}
			}
		}
	}
}
`

const resultWithHead = applyModModifications(
  sampleVdfWithHead,
  { terrorblade: { hero_base: 'Fractal Horns of Inner Abysm', head: 'Fractal Horns of Inner Abysm - Horns' } },
  { terrorblade: { hero_base: { gemColor: '#7B68EE', gemName: 'Miasmatic Grey' } } }
)

assert.strictEqual(resultWithHead.patchedCount, 3, 'Should patch base, head, and ambient')
assert.ok(resultWithHead.modifiedContent.includes('123 104 238'), 'Must inject RGB for Miasmatic Grey')
assert.ok(resultWithHead.modifiedContent.includes('"cp_position"\t\t"1 0 0"'), 'Must inject CP 16')
assert.ok(resultWithHead.modifiedContent.includes('horns_arcana.vmdl'), 'Head must equip Arcana horns model')

console.log('✔ Task 5 Terrorblade Gem injection tests passed')
