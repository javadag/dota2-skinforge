const assert = require('assert')
const { applyModModifications } = require('../src/main/services/modifier/compiler')

// Sample VDF containing default items and Arcanas for VS, QoP, WK, and Terrorblade
const sampleVdf = `
"items_game"
{
	"items"
	{
		"100"
		{
			"name"		"base_vs_wings"
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
			}
		}
		"200"
		{
			"name"		"base_qop_back"
			"prefab"	"default_item"
			"item_slot"	"back"
			"used_by_heroes" { "npc_dota_hero_queenofpain" "1" }
			"model_player"	"models/heroes/queenofpain/wings.vmdl"
		}
		"13753"
		{
			"name"		"The Eminence of Ristul"
			"prefab"	"wearable"
			"item_slot"	"back"
			"used_by_heroes" { "npc_dota_hero_queenofpain" "1" }
			"model_player"	"models/items/queenofpain/arcana/qop_arcana.vmdl"
			"visuals"
			{
				"asset_modifier"
				{
					"type"		"model_skin"
					"skin"		"1"
					"style"		"1"
				}
				"asset_modifier"
				{
					"type"		"particle_create"
					"modifier"	"particles/qop_arcana_style1.vpcf"
					"style"		"1"
				}
				"asset_modifier"
				{
					"type"		"particle_create"
					"modifier"	"particles/qop_arcana_style0.vpcf"
					"style"		"0"
				}
			}
		}
		"300"
		{
			"name"		"base_wk_head"
			"prefab"	"default_item"
			"item_slot"	"head"
			"used_by_heroes" { "npc_dota_hero_skeleton_king" "1" }
			"model_player"	"models/heroes/wraith_king/head.vmdl"
		}
		"13783"
		{
			"name"		"The One True King"
			"prefab"	"wearable"
			"item_slot"	"head"
			"used_by_heroes" { "npc_dota_hero_skeleton_king" "1" }
			"model_player"	"models/items/wraith_king/arcana/wk_arcana_head.vmdl"
			"visuals"
			{
				"asset_modifier"
				{
					"type"		"model_skin"
					"skin"		"1"
					"style"		"1"
				}
				"asset_modifier"
				{
					"type"		"particle_create"
					"modifier"	"particles/wk_malignant_monster.vpcf"
					"style"		"1"
				}
				"asset_modifier"
				{
					"type"		"particle_create"
					"modifier"	"particles/wk_base_flame.vpcf"
					"style"		"0"
				}
			}
		}
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

function extractItem(vdf, itemId) {
  const marker = `"${itemId}"`
  const start = vdf.indexOf(marker)
  if (start === -1) return ''
  const open = vdf.indexOf('{', start)
  let depth = 1
  let cur = open + 1
  while (cur < vdf.length && depth > 0) {
    if (vdf[cur] === '{') depth++
    else if (vdf[cur] === '}') depth--
    cur++
  }
  return vdf.slice(start, cur)
}

// 1. Vengeful Spirit: Style 2 (Queen Imperia)
{
  const res = applyModModifications(
    sampleVdf,
    { 'vengeful spirit': { shoulder: 'The Resurrection of Shen - Wings' } },
    { 'vengeful spirit': { shoulder: { style: 2 } } }
  )
  const patched = extractItem(res.modifiedContent, '100')
  assert.ok(patched.includes('models/items/vengefulspirit/imperia/imperia.vmdl'), 'VS Style 2 must override model_player')
  assert.ok(!patched.includes('screeauk_wings.vpcf'), 'VS Style 2 must not include Style 1 particle')
  assert.ok(!patched.includes('base_wings.vpcf'), 'VS Style 2 must not include Style 0 particle')
  assert.ok(!patched.includes('"style"'), 'VS Style tags must be stripped')
  console.log('✔ E2E Vengeful Spirit Arcana (Queen Imperia) passed')
}

// 2. Queen of Pain: Style 1 (Royal Decree)
{
  const res = applyModModifications(sampleVdf, { queenofpain: { back: 'The Eminence of Ristul' } }, { queenofpain: { back: { style: 1 } } })
  const patched = extractItem(res.modifiedContent, '200')
  assert.ok(patched.includes('particles/qop_arcana_style1.vpcf'), 'QoP Style 1 must include style 1 particle')
  assert.ok(!patched.includes('particles/qop_arcana_style0.vpcf'), 'QoP Style 1 must not include style 0 particle')
  assert.ok(patched.includes('"skin"\t\t"1"'), 'QoP Style 1 must include skin 1')
  assert.ok(!patched.includes('"style"'), 'QoP Style tags must be stripped')
  console.log('✔ E2E Queen of Pain Arcana (Royal Decree) passed')
}

// 3. Wraith King: Style 1 (Malignant Monster)
{
  const res = applyModModifications(
    sampleVdf,
    { 'skeleton king': { head: 'The One True King' } },
    { 'skeleton king': { head: { style: 1 } } }
  )
  const patched = extractItem(res.modifiedContent, '300')
  assert.ok(patched.includes('particles/wk_malignant_monster.vpcf'), 'WK Style 1 must include style 1 particle')
  assert.ok(!patched.includes('particles/wk_base_flame.vpcf'), 'WK Style 1 must not include style 0 particle')
  assert.ok(patched.includes('"skin"\t\t"1"'), 'WK Style 1 must include skin 1')
  assert.ok(!patched.includes('"style"'), 'WK Style tags must be stripped')
  console.log('✔ E2E Wraith King Arcana (Malignant Monster) passed')
}

// 4. Terrorblade: Prismatic Gem Rubiline (#D11FA1 -> RGB "209 31 161")
{
  const res = applyModModifications(
    sampleVdf,
    { terrorblade: { hero_base: 'Fractal Horns of Inner Abysm' } },
    { terrorblade: { hero_base: { gemColor: '#D11FA1', gemName: 'Rubiline' } } }
  )
  const patchedBase = extractItem(res.modifiedContent, '913')
  const patchedAmbient = extractItem(res.modifiedContent, '540')

  assert.ok(patchedBase.includes('particle_control_point'), 'TB Base must include CP modifier')
  assert.ok(patchedBase.includes('209 31 161'), 'TB Base must have Rubiline RGB vector')
  assert.ok(patchedBase.includes('"control_point_number"\t\t"15"'), 'TB Base must inject CP 15')
  assert.ok(patchedBase.includes('"control_point_number"\t\t"16"'), 'TB Base must inject CP 16')
  assert.ok(patchedBase.includes('"cp_position"\t\t"1 0 0"'), 'TB Base must inject CP 16 activation')

  assert.ok(patchedAmbient.includes('particle_control_point'), 'TB Ambient must include CP modifier')
  assert.ok(patchedAmbient.includes('209 31 161'), 'TB Ambient must have Rubiline RGB vector')
  assert.ok(patchedAmbient.includes('"control_point_number"\t\t"15"'), 'TB Ambient must inject CP 15')
  assert.ok(patchedAmbient.includes('"control_point_number"\t\t"16"'), 'TB Ambient must inject CP 16')
  assert.ok(patchedAmbient.includes('"cp_position"\t\t"1 0 0"'), 'TB Ambient must inject CP 16 activation')
  console.log('✔ E2E Terrorblade Arcana Prismatic Gem passed')
}

// 5. Default item with no customizations backward compatibility check
{
  const res = applyModModifications(sampleVdf, { 'vengeful spirit': { shoulder: 'The Resurrection of Shen - Wings' } })
  const patched = extractItem(res.modifiedContent, '100')
  assert.ok(patched.includes('models/items/vengefulspirit/vengeful_spirit_arcana/vengeful_spirit_arcana.vmdl'), 'Standard model applied')
  assert.strictEqual(res.patchedCount, 1)
  console.log('✔ E2E Backward Compatibility passed')
}

console.log('✔ ALL Arcana customization end-to-end tests passed!')
