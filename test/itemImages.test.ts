import test from 'node:test'
import assert from 'node:assert/strict'
import { getItemRarityKey, getRarityConfig, RARITY_CONFIG } from '../src/shared/armory/rarityConfig'
import { getCategorySvg, getSlotImage, resolveEmptySlotImage } from '../src/shared/armory/slotSvgIcons'
import { generateItemSvg } from '../src/shared/armory/cardSvgGenerator'
import { getItemImage } from '../src/shared/armory/itemImages'

test('getItemRarityKey prioritizes authoritative Valve tags', () => {
  assert.equal(getItemRarityKey({ rarity: 'arcana' }), 'arcana')
  assert.equal(getItemRarityKey({ tag: 'immortal' }), 'immortal')
  assert.equal(getItemRarityKey({ rarity: 'persona' }), 'persona')
  assert.equal(getItemRarityKey({ tag: 'mythical' }), 'mythical')
  assert.equal(getItemRarityKey({ rarity: 'legendary' }), 'legendary')
  assert.equal(getItemRarityKey({ rarity: 'rare' }), 'rare')
  assert.equal(getItemRarityKey({ rarity: 'uncommon' }), 'uncommon')
  assert.equal(getItemRarityKey({ rarity: 'common' }), 'common')
  assert.equal(getItemRarityKey({ tag: 'taunt' }), 'taunt')
  assert.equal(getItemRarityKey({ isDefault: true }), 'common')
  assert.equal(getItemRarityKey(null), 'default')
})

test('getItemRarityKey handles name-based heuristics when tag is absent', () => {
  assert.equal(getItemRarityKey({ name: 'Taunt: Shake Your Moneymaker' }), 'taunt')
  assert.equal(getItemRarityKey({ name: 'Gabe Newell Voice Pack' }), 'voice')
  assert.equal(getItemRarityKey({ name: 'Fiery Soul of the Slayer Arcana' }), 'arcana')
  assert.equal(getItemRarityKey({ name: 'The Toy Butcher Persona' }), 'persona')

  // Never infer immortal from name alone
  assert.notEqual(getItemRarityKey({ name: "Immortal's Pride" }), 'immortal')
})

test('getRarityConfig returns configured color and background palettes', () => {
  const arcanaConfig = getRarityConfig({ rarity: 'arcana' })
  assert.equal(arcanaConfig.color, RARITY_CONFIG.arcana.color)
  assert.equal(arcanaConfig.name, 'Arcana')

  const fallbackConfig = getRarityConfig(null)
  assert.equal(fallbackConfig.name, 'Base')
})

test('getCategorySvg maps standard non-hero categories to valid svg paths', () => {
  assert.equal(getCategorySvg('courier'), '../assets/categories/courier.svg')
  assert.equal(getCategorySvg('wards'), '../assets/categories/wards.svg')
  assert.equal(getCategorySvg('music_packs'), '../assets/categories/music.svg')
  assert.equal(getCategorySvg('weather'), '../assets/categories/weather.svg')
  assert.equal(getCategorySvg('unknown_non_existent'), null)
})

test('resolveEmptySlotImage correctly handles econ paths and local fallbacks', () => {
  const econResult = resolveEmptySlotImage('econ/items/antimage/weapon.png', 'weapon')
  assert.equal(econResult, 'skinforge-icon://econ/items/antimage/weapon.webp')

  const slotImg = getSlotImage('weapon')
  assert.match(slotImg, /^data:image\/svg\+xml/)

  const fallbackResult = resolveEmptySlotImage('', 'weapon')
  assert.match(fallbackResult, /^data:image\/svg\+xml/)
})

test('generateItemSvg outputs valid data URI with SVG content', () => {
  const svgDataUri = generateItemSvg({ name: 'Manta Style', rarity: 'rare' }, 'weapon')
  assert.match(svgDataUri, /^data:image\/svg\+xml;utf8,/)
  const decoded = decodeURIComponent(svgDataUri)
  assert.match(decoded, /<svg xmlns="http:\/\/www.w3.org\/2000\/svg"/)
  assert.match(decoded, /RARE/)
})

test('getItemImage resolves across all 4 image hierarchy tiers', () => {
  // Tier 1: econ assets -> skinforge-icon://
  const tier1 = getItemImage({ img: 'econ/items/juggernaut/sword.png' }, 'weapon')
  assert.equal(tier1, 'skinforge-icon://econ/items/juggernaut/sword.webp')

  // Tier 2: direct custom image path
  const tier2 = getItemImage({ img: 'https://example.com/item.png' }, 'weapon')
  assert.equal(tier2, 'https://example.com/item.png')

  // Tier 3: default item with heroObj portrait
  const tier3 = getItemImage({ isDefault: true }, 'weapon', 'juggernaut', { img: '../assets/portrait.png' })
  assert.equal(tier3, '../assets/portrait.png')

  // Tier 4: procedural SVG fallback
  const tier4 = getItemImage({ name: 'Custom Mesh', rarity: 'mythical' }, 'weapon')
  assert.match(tier4, /^data:image\/svg\+xml/)
})
