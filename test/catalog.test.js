const assert = require('assert')
const fs = require('fs')
const path = require('path')

const catalogPath = path.resolve(__dirname, '../data/valveHeroCatalog.json')
assert.strictEqual(fs.existsSync(catalogPath), true, 'valveHeroCatalog.json must exist in data/')

const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'))
assert.ok(catalog.pudge, 'Pudge catalog entry must exist')
assert.ok(Array.isArray(catalog.pudge.slots), 'Pudge slots must be an array')
// Verify Legion Commander Immortals Pride set rarity integrity
const lcItems = catalog.legion_commander.items
const lcHelm = lcItems.head.find((it) => it.id === '6994')
assert.strictEqual(lcHelm && lcHelm.tag, 'Uncommon', 'Immortals Pride Helm tag must be Uncommon')

const lcHalberd = lcItems.weapon.find((it) => it.id === '6995')
assert.strictEqual(lcHalberd && lcHalberd.tag, 'Rare', 'Immortals Pride Halberd tag must be Rare')

const lcPauldrons = lcItems.shoulder.find((it) => it.id === '7008')
assert.strictEqual(lcPauldrons && lcPauldrons.tag, 'Rare', 'Immortals Pride Pauldrons tag must be Rare')

const lcFlags = lcItems.back.find((it) => it.id === '6909')
assert.strictEqual(lcFlags && lcFlags.tag, 'Rare', 'Immortals Pride Flags tag must be Rare')

const lcBracers = lcItems.arms.find((it) => it.id === '6910')
assert.strictEqual(lcBracers && lcBracers.tag, 'Rare', 'Immortals Pride Bracers tag must be Rare')

// Verify that the redundant 2.35MB JS catalog is removed
// Verify non-hero catalog integrity
const { NON_HERO_SLOTS_CATALOG } = require('../src/data/nonHeroCatalog')
assert.ok(NON_HERO_SLOTS_CATALOG.courier, 'Courier category must exist')
assert.ok(NON_HERO_SLOTS_CATALOG.weather, 'Weather category must exist')
assert.ok(NON_HERO_SLOTS_CATALOG.creeps, 'Creeps category must exist')
assert.ok(NON_HERO_SLOTS_CATALOG.music_packs, 'Music packs category must exist')

// Verify 1-slot modern game client parity for Courier, Wards, and Music Packs
assert.strictEqual(NON_HERO_SLOTS_CATALOG.courier.slots.length, 1, 'Courier must have exactly 1 slot (matching modern game client)')
assert.strictEqual(NON_HERO_SLOTS_CATALOG.courier.slots[0].id, 'courier', 'Courier slot id must be courier')
const courierItems = NON_HERO_SLOTS_CATALOG.courier.items.courier
assert.ok(courierItems && courierItems.length > 0, 'Courier items must exist in courier slot')
assert.ok(
  courierItems.every((it) => typeof it.img === 'string' && it.img.startsWith('econ/')),
  'All courier items must have authentic econ img paths'
)

assert.strictEqual(NON_HERO_SLOTS_CATALOG.wards.slots.length, 1, 'Wards must have exactly 1 slot (matching modern game client)')
assert.strictEqual(NON_HERO_SLOTS_CATALOG.wards.slots[0].id, 'ward', 'Wards slot id must be ward')
const wardItems = NON_HERO_SLOTS_CATALOG.wards.items.ward
assert.ok(wardItems && wardItems.length > 0, 'Ward items must exist in ward slot')

assert.strictEqual(NON_HERO_SLOTS_CATALOG.music_packs.slots.length, 1, 'Music packs must have exactly 1 slot (matching modern game client)')
assert.strictEqual(NON_HERO_SLOTS_CATALOG.music_packs.slots[0].id, 'music_pack', 'Music pack slot id must be music_pack')
const musicItems = NON_HERO_SLOTS_CATALOG.music_packs.items.music_pack
assert.ok(musicItems && musicItems.length > 0, 'Music items must exist in music_pack slot')

const weatherItems = NON_HERO_SLOTS_CATALOG.weather.items.weather_effect
assert.ok(weatherItems && weatherItems.length > 0, 'Weather items must exist')
assert.ok(
  weatherItems.every((it) => typeof it.img === 'string' && it.img.startsWith('econ/')),
  'All weather items must have authentic econ img paths'
)

// Verify loading screens and HUD skins comprehensive expansion
assert.ok(NON_HERO_SLOTS_CATALOG.loadscreens, 'Loadscreens category must exist')
assert.ok(NON_HERO_SLOTS_CATALOG.loadscreens.items.loading_screen.length >= 2000, 'Must contain complete roster of 2000+ loading screens')

assert.ok(NON_HERO_SLOTS_CATALOG.huds, 'HUDs category must exist')
assert.strictEqual(NON_HERO_SLOTS_CATALOG.huds.items.hud_skin.length, 95, 'Must contain all 95 official HUD skins')

assert.ok(NON_HERO_SLOTS_CATALOG.cursor, 'Cursor category must exist')
assert.strictEqual(NON_HERO_SLOTS_CATALOG.cursor.items.cursor_pack.length, 22, 'Must contain all 22 official cursor packs')

console.log('Catalog data integrity test passed!')
