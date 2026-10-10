const assert = require('assert')
const { applyModModifications } = require('../src/main/services/modifier/compiler')

const sampleVdf = `
"items_game"
{
	"items"
	{
		"1"
		{
			"name"		"base_wings"
			"prefab"	"default_item"
			"item_slot"	"shoulder"
			"used_by_heroes" { "npc_dota_hero_vengefulspirit" "1" }
			"model_player"	"models/heroes/vengeful/wings.vmdl"
		}
		"22718"
		{
			"name"		"The Resurrection of Shen - Wings"
			"prefab"	"wearable"
			"item_slot"	"shoulder"
			"used_by_heroes" { "npc_dota_hero_vengefulspirit" "1" }
			"model_player"	"models/items/vengefulspirit/vengeful_spirit_arcana/vengeful_spirit_arcana.vmdl"
			"visuals"
			{
				"asset_modifier"
				{
					"type"		"entity_model"
					"asset"		"npc_dota_hero_vengefulspirit"
					"modifier"	"models/items/vengefulspirit/imperia/imperia.vmdl"
					"style"		"2"
				}
				"asset_modifier"
				{
					"type"		"particle_create"
					"modifier"	"particles/screeauk_wings.vpcf"
					"style"		"1"
				}
				"asset_modifier"
				{
					"type"		"particle_create"
					"modifier"	"particles/base_wings.vpcf"
					"style"		"0"
				}
				"asset_modifier"
				{
					"type"		"common_fx"
					"modifier"	"particles/common.vpcf"
				}
			}
		}
	}
}
`

// Test Style 1: Servants of Scree'Auk
const resStyle1 = applyModModifications(
  sampleVdf,
  { 'vengeful spirit': { shoulder: 'The Resurrection of Shen - Wings' } },
  { 'vengeful spirit': { shoulder: { style: 1 } } }
)

const defaultItemBlock1 = resStyle1.modifiedContent.slice(0, resStyle1.modifiedContent.indexOf('"22718"'))
assert.strictEqual(resStyle1.patchedCount, 1)
assert.ok(defaultItemBlock1.includes('particles/screeauk_wings.vpcf'), 'Should include style 1 particle')
assert.ok(!defaultItemBlock1.includes('particles/base_wings.vpcf'), 'Should exclude style 0 particle')
assert.ok(!defaultItemBlock1.includes('models/items/vengefulspirit/imperia/imperia.vmdl'), 'Should exclude style 2 model')
assert.ok(!defaultItemBlock1.includes('"style"'), 'Style tags must be stripped to make modifiers unconditional')
assert.ok(defaultItemBlock1.includes('particles/common.vpcf'), 'Should keep common modifiers')

// Test Style 2: Queen Imperia
const resStyle2 = applyModModifications(
  sampleVdf,
  { 'vengeful spirit': { shoulder: 'The Resurrection of Shen - Wings' } },
  { 'vengeful spirit': { shoulder: { style: 2 } } }
)

const defaultItemBlock2 = resStyle2.modifiedContent.slice(0, resStyle2.modifiedContent.indexOf('"22718"'))
assert.ok(defaultItemBlock2.includes('models/items/vengefulspirit/imperia/imperia.vmdl'), 'Should swap model to imperia')
assert.ok(!defaultItemBlock2.includes('particles/screeauk_wings.vpcf'), 'Should exclude style 1')

console.log('✔ Task 4 Compiler style unrolling tests passed')
