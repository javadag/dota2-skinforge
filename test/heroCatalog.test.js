const assert = require('assert')
const { buildSchema } = require('../src/main/services/modifier/schema')
const { collectCatalogFindings, catalogEntryCount } = require('../scripts/lib/heroCatalogCheck')

// A minimal schema: two default items for `axe` plus one cosmetic that Valve has re-slotted to
// `hero_base` while the catalog still files it under `weapon`.
const schemaText = `"items_game"
{
	"items"
	{
		"10"
		{
			"name"		"Axe's Base"
			"prefab"	"default_item"
			"item_slot"	"hero_base"
			"used_by_heroes" { "npc_dota_hero_axe" "1" }
			"model_player"	"models/heroes/axe/axe.vmdl"
		}
		"11"
		{
			"name"		"Axe's Axe"
			"prefab"	"default_item"
			"item_slot"	"weapon"
			"used_by_heroes" { "npc_dota_hero_axe" "1" }
			"model_player"	"models/heroes/axe/axe_weapon.vmdl"
		}
		"20"
		{
			"name"		"Re-slotted Cosmetic"
			"prefab"	"wearable"
			"item_slot"	"hero_base"
			"used_by_heroes" { "npc_dota_hero_axe" "1" }
		}
	}
}
`
const schema = buildSchema(schemaText)

const item = (id, name) => ({ id: String(id), name, tag: 'Arcana', isDefault: false, img: 'econ/x' })
const slots = [
  { id: 'weapon', name: 'Weapon', icon: '⚔️' },
  { id: 'hero_base', name: 'Hero Base / Persona', icon: '👤' }
]

function catalog(overrides) {
  return {
    axe: {
      slots,
      items: {
        weapon: [item(11, "Axe's Axe"), item(20, 'Re-slotted Cosmetic')],
        hero_base: [item(10, "Axe's Base")],
        ...overrides
      }
    }
  }
}

const errorsOf = (cat) => collectCatalogFindings(cat, schema).filter((f) => f.level === 'error')

// --- an item filed under the wrong slot is an error and is moved -----------
{
  const cat = catalog()
  const errors = errorsOf(cat)
  assert.strictEqual(errors.length, 1, `expected one error, got ${JSON.stringify(errors.map((e) => e.message))}`)
  assert.match(errors[0].message, /declares slot "hero_base"/)
  assert.ok(errors[0].repair, 'the finding must be repairable')

  errors[0].repair()
  assert.deepStrictEqual(
    cat.axe.items.weapon.map((i) => i.id),
    ['11'],
    'the cosmetic must leave the group it does not belong to'
  )
  assert.deepStrictEqual(cat.axe.items.hero_base.map((i) => i.id).sort(), ['10', '20'], 'and arrive in the group the schema declares')
  assert.deepStrictEqual(errorsOf(cat), [], 'the repair must clear the finding')
  console.log('✔ catalog check: a mis-slotted item is reported and moved to its declared slot')
}

// --- already filed in the right place: no error ----------------------------
{
  const cat = catalog({ weapon: [item(11, "Axe's Axe")], hero_base: [item(10, "Axe's Base"), item(20, 'Re-slotted Cosmetic')] })
  assert.deepStrictEqual(errorsOf(cat), [])
  console.log('✔ catalog check: a correctly filed catalog reports nothing')
}

// --- listed in two groups: duplicate error, declared group wins ------------
{
  const cat = catalog({ hero_base: [item(10, "Axe's Base"), item(20, 'Re-slotted Cosmetic')] })
  const errors = errorsOf(cat)
  assert.strictEqual(errors.length, 1)
  assert.match(errors[0].message, /more than one slot group/)
  errors[0].repair()
  assert.deepStrictEqual(
    cat.axe.items.weapon.map((i) => i.id),
    ['11']
  )
  assert.deepStrictEqual(cat.axe.items.hero_base.map((i) => i.id).sort(), ['10', '20'])
  assert.deepStrictEqual(errorsOf(cat), [])
  console.log('✔ catalog check: an item listed twice is de-duplicated into its declared slot')
}

// --- an item Valve removed from the game ----------------------------------
{
  const cat = catalog({ weapon: [item(11, "Axe's Axe"), item(999, 'Deleted Item')] })
  const errors = errorsOf(cat)
  assert.strictEqual(errors.length, 1)
  assert.match(errors[0].message, /no longer exists/)
  errors[0].repair()
  assert.deepStrictEqual(
    cat.axe.items.weapon.map((i) => i.id),
    ['11']
  )
  assert.deepStrictEqual(errorsOf(cat), [])
  console.log('✔ catalog check: an item that no longer exists is reported and removed')
}

// --- a renamed owner is informational, never modified ----------------------
{
  const cat = { renamed_hero: { slots, items: { weapon: [item(11, "Axe's Axe")] } } }
  const findings = collectCatalogFindings(cat, schema)
  assert.strictEqual(findings.filter((f) => f.level === 'error').length, 0)
  const note = findings.find((f) => f.level === 'info')
  assert.ok(note, 'an unmatched owner must be noted')
  assert.strictEqual(note.repair, undefined, 'informational findings must never be auto-modified')
  console.log('✔ catalog check: unmatched owners are reported but never touched')
}

// --- aliased owner keys resolve (lifestealer -> life_stealer) --------------
{
  const cat = { axe: { slots, items: { weapon: [item(11, "Axe's Axe")] } }, lifestealer: { slots, items: {} } }
  const findings = collectCatalogFindings(cat, schema)
  const note = findings.find((f) => f.level === 'info' && f.where.includes('owner'))
  assert.ok(!note || !note.where.includes('lifestealer'), 'an aliased key is not reported as unmatched')
  console.log('✔ catalog check: aliased owner keys resolve through the hero alias map')
}

// --- entry counting -------------------------------------------------------
{
  assert.strictEqual(catalogEntryCount(catalog()), 3)
  console.log('✔ catalog check: entry counting')
}

console.log('✔ all hero catalog check tests passed')
