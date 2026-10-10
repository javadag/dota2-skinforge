const assert = require('assert')
const { getItemImage } = require('../src/renderer/utils/itemImages')

// 1. Econ item with econ/ path should route through skinforge-icon:// protocol
const bundled = getItemImage({
  id: '7986',
  name: 'Dark Artistry Hair',
  img: 'econ/items/invoker/dark_artistry/dark_artistry_hair_model'
})
assert.strictEqual(
  bundled,
  'skinforge-icon://econ/items/invoker/dark_artistry/dark_artistry_hair_model.webp',
  'Econ items must route through skinforge-icon://'
)

// 2. Unbundled item with econ/ or loadingscreens/ path should route through skinforge-icon:// protocol
const unbundled = getItemImage({
  id: '999999',
  name: 'New Set Item',
  img: 'econ/items/invoker/magus_apex/magus_apex2'
})
assert.strictEqual(
  unbundled,
  'skinforge-icon://econ/items/invoker/magus_apex/magus_apex2.webp',
  'Econ items must route through skinforge-icon:// with .webp'
)

const loadingScreenItem = getItemImage({
  id: '597',
  name: 'Default Loading Screen',
  img: 'loadingscreens/default/startup_background_logo'
})
assert.strictEqual(
  loadingScreenItem,
  'skinforge-icon://loadingscreens/default/startup_background_logo.webp',
  'Loading screen items must route through skinforge-icon://'
)

// 3. Default base item should return hero portrait or base SVG
const defaultBase = getItemImage({ isDefault: true, name: 'Default Base' }, 'weapon', 'invoker')
assert.strictEqual(defaultBase, '../assets/heroes/invoker.png', 'Default base should use hero portrait')

// 4. Missing/empty item without heroTag should return procedural SVG data URI
const emptyNoHero = getItemImage(null, 'weapon', '')
assert.ok(emptyNoHero.startsWith('data:image/svg+xml'), 'Empty item without hero should return SVG')

// 5. Missing/empty item with heroTag should return hero portrait
const emptyWithHero = getItemImage(null, 'weapon', 'invoker')
assert.strictEqual(emptyWithHero, '../assets/heroes/invoker.png', 'Empty item with hero should return portrait')

// 6. True Golden Immortals with Immortal tag evaluate to Immortal
const { getItemRarityKey, getRarityConfig } = require('../src/renderer/utils/itemImages')
const goldenStaff = { name: 'Golden Staff of Gun-Yu', tag: 'Immortal' }
assert.strictEqual(getItemRarityKey(goldenStaff), 'immortal', 'Golden immortal item must map to immortal rarity key')
assert.strictEqual(getRarityConfig(goldenStaff).name, 'Immortal', 'Golden immortal item rarity name must be Immortal')

// 7. Items with Golden in name but Common, Rare, or Mythical tags retain their authentic rarity
const goldenArms = { name: 'Golden Reel Guardian Arms', tag: 'Rare' }
assert.strictEqual(getItemRarityKey(goldenArms), 'rare', 'Golden Reel Guardian Arms must be rare')

const goldenMane = { name: 'Belt of the Golden Mane', tag: 'Common' }
assert.strictEqual(getItemRarityKey(goldenMane), 'common', 'Belt of the Golden Mane must be common')

const goldenBone = { name: 'Golden Bone Mail', tag: 'Mythical' }
assert.strictEqual(getItemRarityKey(goldenBone), 'mythical', 'Golden Bone Mail must be mythical')

// 8. Crimson items with real tags retain their authentic rarity
const crimsonEdge = { name: 'Crimson Edge of the Lost Order', tag: 'Immortal' }
assert.strictEqual(getItemRarityKey(crimsonEdge), 'immortal', 'Crimson witness immortal must map to immortal')

const crimsonAgony = { name: 'Crimson Agony', tag: 'Common' }
assert.strictEqual(getItemRarityKey(crimsonAgony), 'common', 'Crimson Agony must be common')

// 8b. Items with Immortal in name but Common, Uncommon, or Rare tags retain authentic rarity
const immortalHelm = { name: 'Immortals Pride Helm', tag: 'Uncommon' }
assert.strictEqual(getItemRarityKey(immortalHelm), 'uncommon', 'Immortals Pride Helm must be uncommon')

const immortalHalberd = { name: 'Immortals Pride Halberd', tag: 'Rare' }
assert.strictEqual(getItemRarityKey(immortalHalberd), 'rare', 'Immortals Pride Halberd must be rare')

const immortalScreen = { name: 'Immortals Pride Loading Screen', tag: 'Common' }
assert.strictEqual(getItemRarityKey(immortalScreen), 'common', 'Immortals Pride Loading Screen must be common')

// True Immortals with Immortal tag evaluate to Immortal
const trueImmortal = { name: 'Immortal Pantheon', tag: 'Immortal' }
assert.strictEqual(getItemRarityKey(trueImmortal), 'immortal', 'Immortal Pantheon must be immortal')

// 9. Non-hero category base items must return category vector SVGs, not broken hero portraits
const courierBase = getItemImage({ isDefault: true, name: 'Default Base' }, 'courier', 'courier')
assert.strictEqual(courierBase, '../assets/categories/courier.svg', 'Courier base must return category SVG')

const wardBase = getItemImage(null, 'ward', 'wards')
assert.strictEqual(wardBase, '../assets/categories/wards.svg', 'Ward base must return category SVG')

const weatherBase = getItemImage(null, 'weather_effect', 'weather')
assert.strictEqual(weatherBase, '../assets/categories/weather.svg', 'Weather base must return category SVG')

const creepsBase = getItemImage({ isDefault: true, name: 'Default Base' }, 'radiant_creeps', 'creeps')
assert.strictEqual(creepsBase, '../assets/categories/creeps.svg', 'Creeps base must return category SVG')

const musicBase = getItemImage(null, 'music_pack', 'music_packs')
assert.strictEqual(musicBase, '../assets/categories/music.svg', 'Music packs base must return category SVG')

// 10. Non-hero items with authentic econ paths route through skinforge-icon:// protocol
const weatherAsh = getItemImage(
  {
    id: 11549,
    name: 'Weather Ash',
    img: 'econ/tools/weather_burning'
  },
  'weather_effect',
  'weather'
)
assert.strictEqual(weatherAsh, 'skinforge-icon://econ/tools/weather_burning.webp', 'Weather Ash must route through skinforge-icon://')

const goldenBabyRosh = getItemImage(
  {
    id: 10091,
    name: 'Golden Baby Roshan',
    img: 'econ/courier/baby_rosh/babyroshan1'
  },
  'courier_ground',
  'courier'
)
assert.strictEqual(
  goldenBabyRosh,
  'skinforge-icon://econ/courier/baby_rosh/babyroshan1.webp',
  'Golden Baby Roshan must route through skinforge-icon://'
)

// 11. Procedural SVG for non-hero slots produces rich SVG
const { generateItemSvg } = require('../src/renderer/utils/itemImages')
const creepSvg = generateItemSvg({ name: 'Custom Creep', tag: 'Mythical' }, 'radiant_creeps', 'creeps')
assert.ok(creepSvg.startsWith('data:image/svg+xml'), 'Procedural SVG must be valid data URI')

console.log('getItemImage and rarity tests passed!')
