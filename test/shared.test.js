const assert = require('assert')
const { crc32 } = require('../src/shared/utils/crc32')
const { getCanonicalHero, HERO_ALIASES } = require('../src/shared/constants/heroAliases')
const { APP_CONFIG } = require('../src/shared/constants/appConfig')
const { getHeroAttribute, getAttrLabel } = require('../src/shared/constants/attributes')

// CRC32 verification
const buf = Buffer.from('GameInfo')
assert.strictEqual(typeof crc32(buf), 'number')

// Hero Aliases verification
assert.strictEqual(HERO_ALIASES['zeus'], 'zuus')
assert.strictEqual(getCanonicalHero('zeus'), 'zuus')
assert.strictEqual(getCanonicalHero('necrophos'), 'necrolyte')
assert.strictEqual(getCanonicalHero('wraith king'), 'skeleton_king')

// App config verification
assert.strictEqual(APP_CONFIG.modFolder, 'skinforge')

// Attribute verification
assert.strictEqual(getHeroAttribute('pudge'), 'str')
assert.strictEqual(getHeroAttribute('antimage'), 'agi')
assert.strictEqual(getAttrLabel('str'), 'Strength')

console.log('Shared utilities test passed!')
