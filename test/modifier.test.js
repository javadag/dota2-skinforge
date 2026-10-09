const assert = require('assert');
const { parseItemsGame } = require('../src/main/services/modifier/vdfParser');
const { applyModModifications } = require('../src/main/services/modifier/index');

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
`;

const parsed = parseItemsGame(sampleVdf);
assert.strictEqual(parsed.defaultItems.length, 1);
assert.strictEqual(parsed.cosmetics.length, 2);

const result = applyModModifications(sampleVdf, {
  'axe': { 'weapon': 'Axe of Phractos' }
});

assert.strictEqual(result.patchedCount, 1);
assert.ok(result.modifiedContent.includes('models/items/axe/phractos.vmdl'));
console.log('Modifier engine test passed!');
