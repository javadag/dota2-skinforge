const assert = require('assert')
const { parseItemsGame } = require('../src/main/services/modifier/vdfParser')
const { applyModModifications } = require('../src/main/services/modifier/index')

const sampleVdf = `
"items_game"
{
	"items"
	{
		"1"
		{
			"name"		"weapon_axe_default"
			"prefab"	"default_item"
			"item_slot"	"weapon"
			"used_by_heroes"
			{
				"npc_dota_hero_axe"		"1"
			}
			"model_player"		"models/heroes/axe/axe_weapon.vmdl"
		}
		"200"
		{
			"name"		"Axe of Phractos"
			"prefab"	"wearable"
			"item_slot"	"weapon"
			"used_by_heroes"
			{
				"npc_dota_hero_axe"		"1"
			}
			"model_player"		"models/items/axe/phractos.vmdl"
		}
	}
}
`

const parsed = parseItemsGame(sampleVdf)
assert.strictEqual(parsed.defaultItems.length, 1)
assert.strictEqual(parsed.cosmetics.length, 2)

const result = applyModModifications(sampleVdf, {
  axe: { weapon: 'Axe of Phractos' }
})

assert.strictEqual(result.patchedCount, 1)
assert.ok(result.modifiedContent.includes('models/items/axe/phractos.vmdl'))

// Test 2: Hero default weapons without item_slot (e.g. Necrophos Sickle, Riki Daggers)
const multiHeroVdf = `
"items_game"
{
	"items"
	{
		"211"
		{
			"name"		"Necrophos' Sickle"
			"prefab"	"default_item"
			"used_by_heroes"
			{
				"npc_dota_hero_necrolyte"	"1"
			}
			"model_player"	"models/heroes/necrolyte/necrolyte_sickle.vmdl"
		}
		"4730"
		{
			"name"		"Direstone Liferipper"
			"prefab"	"wearable"
			"item_slot"	"weapon"
			"used_by_heroes"
			{
				"npc_dota_hero_necrolyte"	"1"
			}
			"model_player"	"models/items/necrolyte/demon_reaper/demon_reaper.vmdl"
		}
		"322"
		{
			"name"		"Riki's Offhand Dagger"
			"prefab"	"default_item"
			"item_slot"	"offhand_weapon"
			"used_by_heroes"
			{
				"npc_dota_hero_riki"	"1"
			}
			"model_player"	"models/heroes/rikimaru/rikimaru__offhand_weapon.vmdl"
		}
		"561"
		{
			"name"		"Riki's Dagger"
			"prefab"	"default_item"
			"used_by_heroes"
			{
				"npc_dota_hero_riki"	"1"
			}
			"model_player"	"models/heroes/rikimaru/rikimaru_weapon.vmdl"
		}
		"4740"
		{
			"name"		"Royal Dagger of the Tahlin Watch - Off-Hand"
			"prefab"	"wearable"
			"item_slot"	"offhand_weapon"
			"used_by_heroes"
			{
				"npc_dota_hero_riki"	"1"
			}
			"model_player"	"models/items/rikimaru/masquerade_dagger_off/masquerade_dagger_off.vmdl"
		}
		"4823"
		{
			"name"		"Yasha the Quickblade"
			"prefab"	"wearable"
			"item_slot"	"weapon"
			"used_by_heroes"
			{
				"npc_dota_hero_riki"	"1"
			}
			"model_player"	"models/items/rikimaru/weapon_yasha/weapon_yasha.vmdl"
		}
		"677"
		{
			"name"		"Default Radiant Towers"
			"prefab"	"radianttowers"
			"baseitem"	"1"
		}
		"12936"
		{
			"name"		"Guardians of the Lost Path Radiant Towers"
			"prefab"	"radianttowers"
			"visuals"
			{
				"asset_modifier"
				{
					"type"		"entity_clientside_model"
					"asset"		"npc_dota_goodguys_tower1_top"
					"modifier"	"models/props_structures/rock_golem/tower_radiant_rock_golem.vmdl"
				}
			}
		}
		"588"
		{
			"name"		"Default Music"
			"prefab"	"music"
			"baseitem"	"1"
		}
		"10850"
		{
			"name"		"The International 2014 Music Pack"
			"prefab"	"music"
			"visuals"
			{
				"asset_modifier0"
				{
					"type"		"sound"
					"asset"		"valve_dota_001.music."
					"modifier"	"valve_ti4.music."
				}
			}
		}
	}
}
`

const multiResult = applyModModifications(multiHeroVdf, {
  necrophos: { weapon: 'Direstone Liferipper' },
  riki: {
    weapon: 'Yasha the Quickblade',
    offhand_weapon: 'Royal Dagger of the Tahlin Watch - Off-Hand'
  },
  towers: { radiant_tower: 'Guardians of the Lost Path Radiant Towers' },
  music_packs: { music_pack: 'The International 2014 Music Pack' }
})

assert.strictEqual(multiResult.patchedCount, 5)
assert.ok(multiResult.modifiedContent.includes('models/items/necrolyte/demon_reaper/demon_reaper.vmdl'), 'Necro weapon patched')
assert.ok(multiResult.modifiedContent.includes('models/items/rikimaru/weapon_yasha/weapon_yasha.vmdl'), 'Riki main weapon patched')
assert.ok(
  multiResult.modifiedContent.includes('models/items/rikimaru/masquerade_dagger_off/masquerade_dagger_off.vmdl'),
  'Riki offhand patched'
)
assert.ok(multiResult.modifiedContent.includes('models/props_structures/rock_golem/tower_radiant_rock_golem.vmdl'), 'Tower visuals patched')
assert.ok(multiResult.modifiedContent.includes('valve_ti4.music.'), 'Music visuals patched')

console.log('Modifier engine test passed!')
