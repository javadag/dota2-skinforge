/**
 * The attribute parser: a hero file's `AttributePrimary` is the only place the game keeps
 * a hero's primary attribute, and the armory is written from it — so the token mapping is
 * worth pinning down here, without needing a Dota install to run the test.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { attributeFromHeroFile } from '../scripts/lib/heroAttributes'

function heroFile(primary: string | null): string {
  const lines = [
    '"DOTAHeroes"',
    '{',
    '\t"npc_dota_hero_axe"',
    '\t{',
    '\t\t"Model"\t\t"models/heroes/axe/axe.vmdl"',
    ...(primary ? [`\t\t"AttributePrimary"\t\t"${primary}"`] : []),
    '\t\t"AttributeStrengthGain"\t\t"2.7"',
    '\t\t}',
    '\t}'
  ]
  return lines.join('\n')
}

test('maps every token the game uses onto the four attributes', () => {
  assert.equal(attributeFromHeroFile(heroFile('DOTA_ATTRIBUTE_STRENGTH'), 'npc_dota_hero_axe'), 'str')
  assert.equal(attributeFromHeroFile(heroFile('DOTA_ATTRIBUTE_AGILITY'), 'npc_dota_hero_axe'), 'agi')
  assert.equal(attributeFromHeroFile(heroFile('DOTA_ATTRIBUTE_INTELLECT'), 'npc_dota_hero_axe'), 'int')
  assert.equal(attributeFromHeroFile(heroFile('DOTA_ATTRIBUTE_ALL'), 'npc_dota_hero_axe'), 'uni')
})

test('returns undefined when the file declares nothing we know', () => {
  assert.equal(attributeFromHeroFile(heroFile(null), 'npc_dota_hero_axe'), undefined)
  assert.equal(attributeFromHeroFile(heroFile('DOTA_ATTRIBUTE_SOMETHING_NEW'), 'npc_dota_hero_axe'), undefined)
  assert.equal(attributeFromHeroFile(heroFile('DOTA_ATTRIBUTE_STRENGTH'), 'npc_dota_hero_nobody'), undefined)
})

test('reads the hero from inside DOTAHeroes, not from any nested block', () => {
  const nested = `${heroFile('DOTA_ATTRIBUTE_STRENGTH')}`
  assert.equal(attributeFromHeroFile(nested, 'npc_dota_hero_axe'), 'str')
  // A style/facet block mentioning another attribute must not be mistaken for the hero's.
  const withDecoy = nested.replace(
    '\t}',
    [
      '\t\t"Facets"',
      '\t\t{',
      '\t\t\t"some_facet"',
      '\t\t\t{',
      '\t\t\t\t"AttributePrimary"\t\t"DOTA_ATTRIBUTE_AGILITY"',
      '\t\t\t}',
      '\t\t}',
      '\t}'
    ].join('\n')
  )
  assert.equal(attributeFromHeroFile(withDecoy, 'npc_dota_hero_axe'), 'str')
})
