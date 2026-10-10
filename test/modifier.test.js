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

// Test 3: Lina Arcana portraits block propagation & headflame particles
const linaVdf = `
"items_game"
{
	"items"
	{
		"319"
		{
			"name"		"Lina's Hair"
			"prefab"	"default_item"
			"item_slot"	"head"
			"used_by_heroes"
			{
				"npc_dota_hero_lina"	"1"
			}
			"model_player"	"models/heroes/lina/head.vmdl"
			"portraits"
			{
				"icon"
				{
					"PortraitParticle"	"particles/units/heroes/hero_lina/portrait_lina.vpcf"
				}
			}
		}
		"4794"
		{
			"name"		"Fiery Soul of the Slayer"
			"prefab"	"wearable"
			"item_slot"	"head"
			"used_by_heroes"
			{
				"npc_dota_hero_lina"	"1"
			}
			"model_player"	"models/items/lina/origins_flamehair/origins_flamehair.vmdl"
			"particle_folder"	"particles/econ/items/lina/lina_head_headflame"
			"portraits"
			{
				"game"
				{
					"PortraitParticle"	"particles/econ/items/lina/lina_head_headflame/portrait_lina_alt1.vpcf"
				}
			}
		}
	}
}
`

const linaResult = applyModModifications(linaVdf, {
  lina: { head: 'Fiery Soul of the Slayer' }
})

assert.strictEqual(linaResult.patchedCount, 1)
const linaDefBlock = linaResult.modifiedContent.substring(
  linaResult.modifiedContent.indexOf('"319"'),
  linaResult.modifiedContent.indexOf('"4794"')
)
assert.ok(linaDefBlock.includes('models/items/lina/origins_flamehair/origins_flamehair.vmdl'), 'Lina hair model patched')
assert.ok(linaDefBlock.includes('portrait_lina_alt1.vpcf'), 'Lina Arcana HUD portrait particle patched in default item 319')

// Test 4: Windranger Arcana (Compass of the Rising Gale) rule
const wrVdf = `
"items_game"
{
	"items"
	{
		"828"
		{
			"name"		"Windranger's Base"
			"prefab"	"default_item"
			"item_slot"	"hero_base"
			"used_by_heroes"
			{
				"npc_dota_hero_windrunner"	"1"
			}
		}
		"21"
		{
			"name"		"Wind Ranger's Head"
			"prefab"	"default_item"
			"item_slot"	"head"
			"used_by_heroes"
			{
				"npc_dota_hero_windrunner"	"1"
			}
			"model_player"	"models/heroes/windrunner/windrunner_head.vmdl"
		}
		"13806"
		{
			"name"		"Compass of the Rising Gale"
			"prefab"	"wearable"
			"item_slot"	"hero_base"
			"used_by_heroes"
			{
				"npc_dota_hero_windrunner"	"1"
			}
			"portraits"
			{
				"icon"
				{
					"PortraitLightScale"	"1.750000"
				}
			}
			"visuals"
			{
				"asset_modifier"
				{
					"type"		"entity_model"
					"asset"		"npc_dota_hero_windrunner"
					"modifier"	"models/items/windrunner/windrunner_arcana/wr_arcana_base.vmdl"
				}
			}
		}
		"32650"
		{
			"name"		"Hair of the Rising Gale"
			"prefab"	"wearable"
			"item_slot"	"head"
			"used_by_heroes"
			{
				"npc_dota_hero_windrunner"	"1"
			}
			"model_player"	"models/items/windrunner/windrunner_arcana/wr_arcana_head.vmdl"
			"portraits"
			{
				"icon"
				{
					"PortraitFOV"	"33.330002"
				}
			}
		}
	}
}
`

const wrResult = applyModModifications(wrVdf, {
  windrunner: { hero_base: 'Compass of the Rising Gale' }
})

const wrDefHeadBlock = wrResult.modifiedContent.substring(
  wrResult.modifiedContent.indexOf('"21"'),
  wrResult.modifiedContent.indexOf('"13806"')
)
assert.ok(
  wrResult.modifiedContent.includes('models/items/windrunner/windrunner_arcana/wr_arcana_base.vmdl'),
  'WR Arcana base entity_model patched'
)
assert.ok(
  wrDefHeadBlock.includes('models/items/windrunner/windrunner_arcana/wr_arcana_head.vmdl'),
  'WR Arcana head automatically paired to replace original head'
)
assert.ok(wrDefHeadBlock.includes('33.330002'), 'WR Arcana portrait configuration applied to head')

console.log('Modifier engine test passed!')
