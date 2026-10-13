const assert = require('assert')
const { compileItemsGame } = require('../src/main/services/modifier/compile')
const { buildSchema, primarySetFor, personaHeroes } = require('../src/main/services/modifier/schema')
const { parseVdf, getNode, getString, findAll, isNode } = require('../src/main/services/modifier/vdf')

const sampleVdf = `"items_game"
{
	"items"
	{
		"1"
		{
			"name"		"Axe's Axe"
			"prefab"	"default_item"
			"used_by_heroes" { "npc_dota_hero_axe" "1" }
			"model_player"	"models/heroes/axe/axe_weapon.vmdl"
		}
		"100"
		{
			"name"		"Axe of Phractos"
			"prefab"	"wearable"
			"item_slot"	"weapon"
			"used_by_heroes" { "npc_dota_hero_axe" "1" }
			"model_player"	"models/items/axe/phractos.vmdl"
		}
		"200"
		{
			"name"		"Juggernaut's Base"
			"prefab"	"default_item"
			"item_slot"	"hero_base"
			"used_by_heroes" { "npc_dota_hero_juggernaut" "1" }
			"model_player"	"models/heroes/juggernaut/juggernaut.vmdl"
		}
		"201"
		{
			"name"		"Juggernaut's Mask"
			"prefab"	"default_item"
			"item_slot"	"head"
			"used_by_heroes" { "npc_dota_hero_juggernaut" "1" }
			"model_player"	"models/heroes/juggernaut/jugg_mask.vmdl"
		}
		"300"
		{
			"name"		"Bladeform Legacy"
			"prefab"	"wearable"
			"item_slot"	"hero_base"
			"used_by_heroes" { "npc_dota_hero_juggernaut" "1" }
			"visuals"
			{
				"asset_modifier"
				{
					"type"		"entity_model"
					"asset"		"npc_dota_hero_juggernaut"
					"modifier"	"models/heroes/juggernaut/juggernaut_arcana.vmdl"
					"style"		"0"
				}
				"asset_modifier"
				{
					"type"		"entity_model"
					"asset"		"npc_dota_hero_juggernaut"
					"modifier"	"models/heroes/juggernaut/juggernaut_arcana_red.vmdl"
					"style"		"1"
				}
				"asset_modifier"
				{
					"type"		"particle_create"
					"modifier"	"particles/jugg_green.vpcf"
					"style"		"0"
				}
				"asset_modifier"
				{
					"type"		"particle_create"
					"modifier"	"particles/jugg_red.vpcf"
					"style"		"1"
				}
				"asset_modifier"
				{
					"type"		"common_fx"
					"modifier"	"particles/common.vpcf"
				}
				"asset_modifier"
				{
					"type"		"named_value"
					"asset"		"force_default_item_into_slot_index_when_equipped"
					"value"		"0"
				}
				"asset_modifier"
				{
					"type"		"named_value"
					"asset"		"force_default_item_into_slot_index_when_equipped_exception_itemdef"
					"value"		"302"
				}
			}
		}
		"302"
		{
			"name"		"Bladeform Legacy - Sword"
			"prefab"	"wearable"
			"item_slot"	"weapon"
			"used_by_heroes" { "npc_dota_hero_juggernaut" "1" }
			"model_player"	"models/items/juggernaut/arcana/juggernaut_arcana_polearm.vmdl"
		}
		"301"
		{
			"name"		"Bladeform Legacy - Mask"
			"prefab"	"wearable"
			"item_slot"	"head"
			"used_by_heroes" { "npc_dota_hero_juggernaut" "1" }
			"model_player"	"models/items/juggernaut/arcana/juggernaut_arcana_mask.vmdl"
		}
		"202"
		{
			"name"		"Juggernaut's Sword"
			"prefab"	"default_item"
			"used_by_heroes" { "npc_dota_hero_juggernaut" "1" }
			"model_player"	"models/heroes/juggernaut/jugg_sword.vmdl"
		}
		"203"
		{
			"name"		"Juggernaut's Cape"
			"prefab"	"default_item"
			"item_slot"	"back"
			"used_by_heroes" { "npc_dota_hero_juggernaut" "1" }
			"model_player"	"models/heroes/juggernaut/jugg_cape.vmdl"
		}
		"400"
		{
			"name"		"Frost Avalanche"
			"prefab"	"wearable"
			"item_slot"	"back"
			"used_by_heroes" { "npc_dota_hero_crystal_maiden" "1" }
			"model_player"	"models/items/crystal_maiden/arcana_back.vmdl"
		}
		"401"
		{
			"name"		"Roost of the Winter Raven - Arms"
			"prefab"	"wearable"
			"item_slot"	"arms"
			"used_by_heroes" { "npc_dota_hero_crystal_maiden" "1" }
			"model_player"	"models/items/crystal_maiden/raven_arms.vmdl"
		}
		"402"
		{
			"name"		"Cold Feet"
			"prefab"	"default_item"
			"item_slot"	"back"
			"used_by_heroes" { "npc_dota_hero_crystal_maiden" "1" }
			"model_player"	"models/heroes/crystal_maiden/cape.vmdl"
		}
		"500"
		{
			"name"		"Anti-Mage Persona Weapon"
			"prefab"	"default_item"
			"item_slot"	"weapon_persona_1"
			"used_by_heroes" { "npc_dota_hero_antimage" "1" }
			"model_player"	"models/heroes/antimage_female/antimage_female_weapon.vmdl"
		}
		"501"
		{
			"name"		"Anti-Mage's Head"
			"prefab"	"default_item"
			"item_slot"	"head"
			"used_by_heroes" { "npc_dota_hero_antimage" "1" }
			"model_player"	"models/heroes/antimage/antimage_head.vmdl"
		}
		"502"
		{
			"name"		"Anti-Mage's Persona"
			"prefab"	"default_item"
			"item_slot"	"persona_selector"
			"used_by_heroes" { "npc_dota_hero_antimage" "1" }
		}
		"503"
		{
			"name"		"Anti-Mage's Glaive"
			"prefab"	"default_item"
			"used_by_heroes" { "npc_dota_hero_antimage" "1" }
			"model_player"	"models/heroes/antimage/antimage_weapon.vmdl"
		}
		"504"
		{
			"name"		"Anti-Mage's Bracers"
			"prefab"	"default_item"
			"item_slot"	"arms"
			"used_by_heroes" { "npc_dota_hero_antimage" "1" }
			"model_player"	"models/heroes/antimage/antimage_arms.vmdl"
		}
		"505"
		{
			"name"		"Anti-Mage's Shoulders"
			"prefab"	"default_item"
			"item_slot"	"shoulder"
			"used_by_heroes" { "npc_dota_hero_antimage" "1" }
		}
		"506"
		{
			"name"		"Anti-Mage's Base"
			"prefab"	"default_item"
			"item_slot"	"hero_base"
			"used_by_heroes" { "npc_dota_hero_antimage" "1" }
		}
		"600"
		{
			"name"		"The Disciple's Path"
			"prefab"	"wearable"
			"item_slot"	"persona_selector"
			"used_by_heroes" { "npc_dota_hero_antimage" "1" }
			"visuals"
			{
				"asset_modifier"
				{
					"type"		"persona"
					"persona"	"1"
				}
				"asset_modifier"
				{
					"type"		"entity_model"
					"asset"		"npc_dota_hero_antimage"
					"modifier"	"models/heroes/antimage_female/antimage_female.vmdl"
				}
			}
		}
		"900"
		{
			"name"		"Default Music"
			"prefab"	"music"
			"baseitem"	"1"
		}
		"901"
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
	"item_sets"
	{
		"bladeform_legacy"
		{
			"name"		"#DOTA_Set_Bladeform_Legacy"
			"items"
			{
				"Bladeform Legacy"		"1"
				"Bladeform Legacy - Mask"		"1"
				"Bladeform Legacy - Sword"		"1"
			}
		}
		"frost_avalanche"
		{
			"name"		"#DOTA_Set_Frost_Avalanche"
			"items"
			{
				"Frost Avalanche"		"1"
			}
		}
		"crystal_maiden_roost_of_the_winter_raven"
		{
			"name"		"#DOTA_Set_Roost_of_the_Winter_Raven"
			"items"
			{
				"Frost Avalanche"		"1"
				"Roost of the Winter Raven - Arms"		"1"
			}
		}
	}
}
`

/** Read an item block out of compiled output, structurally. */
function itemBlock(text, id) {
  const doc = parseVdf(text)
  const entry = getNode(doc.root, 'items').entries.find((candidate) => candidate.key === id)
  assert.ok(entry, `item ${id} must exist in the output`)
  return entry.value
}
function modelOf(node) {
  return getString(node, 'model_player')
}
function assetModifierTypes(node) {
  const visuals = getNode(node, 'visuals')
  if (!visuals) return []
  return findAll(visuals, 'asset_modifier')
    .map((entry) => (isNode(entry.value) ? getString(entry.value, 'type') : undefined))
    .filter(Boolean)
}
function serialized(text, id) {
  const doc = parseVdf(text)
  const entry = getNode(doc.root, 'items').entries.find((candidate) => candidate.key === id)
  return JSON.stringify(entry.value)
}

// --- schema derivation ------------------------------------------------------
{
  const schema = buildSchema(sampleVdf)
  assert.strictEqual(schema.items.size, 22)
  assert.strictEqual(schema.ambiguousNames.size, 0)
  // "Axe's Axe" has no item_slot; the game's convention makes it the weapon.
  const axeDefault = schema.items.get('1')
  assert.strictEqual(axeDefault.slot, '')
  assert.strictEqual(axeDefault.resolvedSlot, 'weapon')
  assert.strictEqual(axeDefault.slotSource, 'fallback')
  // non-hero base items are mapped through their prefab
  assert.strictEqual(schema.defaults.get('music_packs').get('music_pack').id, '900')
  assert.deepStrictEqual(personaHeroes(schema), ['antimage'])
  console.log('✔ schema: slots, defaults, non-hero base items and personas are derived')
}

// --- set disambiguation -----------------------------------------------------
{
  const schema = buildSchema(sampleVdf)
  const avalancHE = schema.byName.get('Frost Avalanche')
  const choice = primarySetFor(schema, avalancHE)
  assert.strictEqual(choice.set.key, 'frost_avalanche', 'must prefer the set that names the item, not the merged one')
  assert.strictEqual(choice.ambiguous, false)
  console.log('✔ schema: set choice prefers the set whose own identity matches the item')
}

// --- basic application ------------------------------------------------------
{
  const { content, report } = compileItemsGame(sampleVdf, { axe: { weapon: 'Axe of Phractos' } })
  assert.strictEqual(report.validation.ok, true, report.validation.errors.join('; '))
  assert.strictEqual(modelOf(itemBlock(content, '1')), 'models/items/axe/phractos.vmdl')
  assert.strictEqual(report.patchedCount, 1)
  console.log('✔ engine: equips a cosmetic onto the hero default item')
}

// --- arcana auto-pairing, style flattening and the hero-model anchor --------
{
  const { content, report } = compileItemsGame(sampleVdf, { juggernaut: { hero_base: 'Bladeform Legacy' } })
  assert.strictEqual(report.validation.ok, true, report.validation.errors.join('; '))

  const base = itemBlock(content, '200')
  const head = itemBlock(content, '201')
  const baseJson = serialized(content, '200')

  // style 0 is applied, and the `style` key is gone so the client activates it
  assert.ok(baseJson.includes('particles/jugg_green.vpcf'), 'style 0 particle applied')
  assert.ok(!baseJson.includes('particles/jugg_red.vpcf'), 'style 1 particle dropped')
  assert.ok(baseJson.includes('particles/common.vpcf'), 'style-less modifiers are kept')
  assert.ok(!baseJson.includes('"style"'), 'style tags are stripped')

  // the companion mask is paired from item_sets, not from a hardcoded list
  assert.strictEqual(modelOf(head), 'models/items/juggernaut/arcana/juggernaut_arcana_mask.vmdl')
  // and the hero-model swap is mirrored onto a wearable the client resolves
  const headJson = serialized(content, '201')
  assert.ok(headJson.includes('juggernaut_arcana.vmdl'), 'hero model anchor mirrors the body swap')
  assert.ok(headJson.includes('entity_model'))
  assert.ok(report.applied.some((a) => a.reason === 'set-companion' && a.slot === 'head'))
  assert.ok(report.applied.some((a) => a.reason === 'hero-model-anchor'))
  assert.ok(base)
  console.log('✔ engine: arcana set pairing, style flattening and hero-model anchor')
}

// --- the body swap must land on slots an arcana owner leaves empty ---------
{
  // A `hero_base` arcana declares its body only through `entity_model`, and `hero_base`
  // itself is never resolved by the client. Mirroring it onto one preferred slot is not
  // enough: an owner has the arcana's own set equipped (here hero_base + head), so those
  // defaults go unused. The swap must therefore also reach slots the set does not occupy.
  const { content, report } = compileItemsGame(sampleVdf, { juggernaut: { hero_base: 'Bladeform Legacy' } })
  const swapOn = (id) => {
    const visuals = getNode(itemBlock(content, id), 'visuals')
    if (!visuals) return 0
    return findAll(visuals, 'asset_modifier').filter(
      (entry) =>
        isNode(entry.value) &&
        getString(entry.value, 'type') === 'entity_model' &&
        getString(entry.value, 'asset') === 'npc_dota_hero_juggernaut'
    ).length
  }
  assert.strictEqual(swapOn('200'), 1, 'hero_base keeps the swap')
  assert.strictEqual(swapOn('201'), 1, 'head carries the swap')
  assert.ok(swapOn('202') >= 1, 'the weapon slot must carry the swap (not part of the arcana set)')
  assert.ok(swapOn('203') >= 1, 'the back slot must carry the swap (not part of the arcana set)')
  const anchored = report.applied
    .filter((a) => a.reason === 'hero-model-anchor')
    .map((a) => a.slot)
    .sort()
  assert.deepStrictEqual(anchored, ['back', 'head', 'weapon'], 'every model-bearing wearable is anchored')
  console.log('✔ engine: body swap is mirrored onto every wearable an owner might leave empty')
}

// --- a slot the arcana forces to its default must not be overwritten -------
{
  // Legion Commander's arcana rewrites the *default* weapon into its dual swords with its own
  // `type model` remaps, and lists the alternate weapons as exceptions. Pairing the set's
  // weapon piece into that slot replaced the default with the legacy single weapon, which left
  // the dual-wield activity without a matching model: a one-weapon hero, and an ERROR model
  // once the client rebuilt the hero on reconnect.
  const schema = buildSchema(sampleVdf)
  const arcana = schema.byName.get('Bladeform Legacy')
  assert.deepStrictEqual(arcana.forcesDefaultSlots, ['weapon'], 'the forced-default slot is derived from the exception itemdefs')

  const { content, report } = compileItemsGame(sampleVdf, { juggernaut: { hero_base: 'Bladeform Legacy' } })
  assert.strictEqual(report.validation.ok, true, report.validation.errors.join('; '))
  assert.strictEqual(
    modelOf(itemBlock(content, '202')),
    'models/heroes/juggernaut/jugg_sword.vmdl',
    'the weapon default must keep its original model so the arcana remaps it'
  )
  assert.ok(
    !report.applied.some((a) => a.itemName === 'Bladeform Legacy - Sword'),
    'the set weapon must not be paired into a slot the arcana keeps at default'
  )
  assert.ok(
    report.skipped.some((s) => s.slot === 'weapon' && /keeps the default item/.test(s.reason)),
    'the skip must be explained'
  )
  // The plain head companion is still paired.
  assert.strictEqual(modelOf(itemBlock(content, '201')), 'models/items/juggernaut/arcana/juggernaut_arcana_mask.vmdl')

  // Behavioural `named_value` directives describe an equipped item instance, so they must never
  // be copied onto a default item. The slot-claiming one is what makes the client report
  // "conflicting items were equipped" and unequip the hero's base.
  assert.ok(
    !assetModifierTypes(itemBlock(content, '200')).includes('named_value'),
    'named_value directives must not be copied onto a default item'
  )
  assert.ok(assetModifierTypes(itemBlock(content, '300')).includes('named_value'), 'the source arcana itself must stay untouched')

  // An explicit pick of that weapon is still honoured.
  const explicit = compileItemsGame(sampleVdf, { juggernaut: { weapon: 'Bladeform Legacy - Sword' } })
  assert.strictEqual(modelOf(itemBlock(explicit.content, '202')), 'models/items/juggernaut/arcana/juggernaut_arcana_polearm.vmdl')
  console.log('✔ engine: honours a slot the arcana forces to its default, unless the user asks for it')
}

// --- a declared slot beats the slot the UI filed the item under -------------
{
  // The shipped catalog listed Legion Commander's arcana under `weapon` long after Valve moved
  // it to `hero_base`. Acting on the requested slot wrote the arcana onto the weapon default;
  // the item's own declaration must win instead.
  const { content, report } = compileItemsGame(sampleVdf, { juggernaut: { weapon: 'Bladeform Legacy' } })
  const applied = report.applied.filter((a) => a.reason === 'requested')
  assert.strictEqual(applied.length, 1)
  assert.strictEqual(applied[0].slot, 'hero_base', 'the declared slot must win over the requested one')
  assert.strictEqual(applied[0].targetId, '200', 'it must land on the hero_base default item')
  assert.strictEqual(modelOf(itemBlock(content, '202')), 'models/heroes/juggernaut/jugg_sword.vmdl', 'the weapon default must be untouched')
  assert.ok(
    report.warnings.some((w) => /declared as slot "hero_base"/.test(w)),
    'the mismatch must be reported'
  )
  console.log("✔ engine: an item's declared slot beats the slot it was selected under")
}

// --- style selection picks the matching modifiers ---------------------------
{
  const { content } = compileItemsGame(
    sampleVdf,
    { juggernaut: { hero_base: 'Bladeform Legacy' } },
    { juggernaut: { hero_base: { style: 1 } } }
  )
  const json = serialized(content, '200')
  assert.ok(json.includes('particles/jugg_red.vpcf'), 'style 1 particle applied')
  assert.ok(!json.includes('particles/jugg_green.vpcf'), 'style 0 particle dropped')
  assert.ok(json.includes('juggernaut_arcana_red.vmdl'), 'style 1 body swap applied')
  assert.ok(!json.includes('"style"'), 'style tags stripped for the chosen style')

  // the anchor must mirror only the selected style's swap
  const headJson = serialized(content, '201')
  assert.ok(headJson.includes('juggernaut_arcana_red.vmdl'))
  assert.ok(!headJson.includes('juggernaut_arcana.vmdl'), 'unselected style swaps must not be mirrored')
  console.log('✔ engine: style selection filters modifiers and the mirrored body swap')
}

// --- merged set must not drag in unrelated pieces --------------------------
{
  const { content, report } = compileItemsGame(sampleVdf, { crystal_maiden: { back: 'Frost Avalanche' } })
  assert.strictEqual(report.validation.ok, true, report.validation.errors.join('; '))
  assert.strictEqual(modelOf(itemBlock(content, '402')), 'models/items/crystal_maiden/arcana_back.vmdl')
  assert.ok(
    !report.applied.some((a) => a.itemName === 'Roost of the Winter Raven - Arms'),
    'must not pair pieces from the merged seasonal set'
  )
  console.log('✔ engine: does not pair pieces from a merged seasonal set')
}

// --- persona: explicit selector --------------------------------------------
{
  const { content, report } = compileItemsGame(sampleVdf, { antimage: { persona_selector: "The Disciple's Path" } })
  assert.strictEqual(report.validation.ok, true, report.validation.errors.join('; '))
  // the selector default item receives the persona body swap
  assert.ok(serialized(content, '502').includes('antimage_female.vmdl'))
  assert.ok(assetModifierTypes(itemBlock(content, '502')).includes('persona'))
  // the persona's own piece lands on the slot it re-skins
  assert.strictEqual(modelOf(itemBlock(content, '503')), 'models/heroes/antimage_female/antimage_female_weapon.vmdl')
  // slots with geometry the persona does not cover are hidden
  assert.strictEqual(modelOf(itemBlock(content, '504')), 'models/props_nature/prop_null.vmdl')
  console.log('✔ engine: persona activation, piece substitution and hiding')
}

// --- persona: selecting a piece activates the persona automatically ---------
{
  const { content, report } = compileItemsGame(sampleVdf, { antimage: { weapon_persona_1: 'Anti-Mage Persona Weapon' } })
  assert.strictEqual(report.validation.ok, true, report.validation.errors.join('; '))
  assert.ok(
    report.applied.some((a) => a.reason === 'persona-activation' && a.slot === 'persona_selector'),
    'selecting a persona piece must activate the persona selector'
  )
  assert.ok(serialized(content, '502').includes('antimage_female.vmdl'))
  // a slot without a model must never be pointed at the null prop
  assert.strictEqual(modelOf(itemBlock(content, '505')), undefined, 'model-less slots are left alone')
  assert.strictEqual(modelOf(itemBlock(content, '506')), undefined, 'hero_base must never be blanked')
  console.log('✔ engine: persona auto-activation never blanks model-less or hero_base slots')
}

// --- explicit user choices are never overwritten ---------------------------
{
  const { report } = compileItemsGame(sampleVdf, {
    juggernaut: { hero_base: 'Bladeform Legacy', head: 'Bladeform Legacy - Mask' }
  })
  const headPatches = report.applied.filter((a) => a.slot === 'head' && a.reason !== 'hero-model-anchor')
  assert.strictEqual(headPatches.length, 1, 'the user pick must not be duplicated by set pairing')
  assert.strictEqual(headPatches[0].reason, 'requested')
  console.log('✔ engine: explicit selections win over set companions')
}

// --- non-hero categories ----------------------------------------------------
{
  const { content, report } = compileItemsGame(sampleVdf, {
    music_packs: { music_pack: 'The International 2014 Music Pack' }
  })
  assert.strictEqual(report.validation.ok, true, report.validation.errors.join('; '))
  assert.ok(serialized(content, '900').includes('valve_ti4.music.'))
  console.log('✔ engine: applies non-hero categories via baseitem/prefab mapping')
}

// --- unknown selections are reported, not guessed --------------------------
{
  const { report } = compileItemsGame(sampleVdf, { axe: { weapon: 'Nonexistent Item' } })
  assert.strictEqual(report.patchedCount, 0)
  assert.strictEqual(report.skipped.length, 1)
  assert.match(report.skipped[0].reason, /not found/)
  console.log('✔ engine: reports unknown selections instead of guessing')
}

// --- "official base" means leave the slot alone ----------------------------
{
  const { report } = compileItemsGame(sampleVdf, { axe: { weapon: 'Official Base Armament — Axe' } })
  assert.strictEqual(report.patchedCount, 0)
  console.log('✔ engine: treats "Official Base" as no selection')
}

// --- output is only rewritten where it must be -----------------------------
{
  const { content } = compileItemsGame(sampleVdf, { axe: { weapon: 'Axe of Phractos' } })
  const schema = buildSchema(sampleVdf)
  // Every item the planner did not target must survive byte-identical.
  const untouched = schema.items.get('201').entry.value
  assert.ok(content.includes(sampleVdf.slice(untouched.start, untouched.end)), 'untouched item blocks must be copied verbatim')
  // And with nothing selected, the file is returned unchanged.
  assert.strictEqual(compileItemsGame(sampleVdf, {}).content, sampleVdf)
  console.log('✔ engine: leaves untouched item blocks byte-identical')
}

console.log('✔ all modifier engine tests passed')
