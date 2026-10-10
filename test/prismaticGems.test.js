const assert = require('assert')
const { PRISMATIC_GEMS, hexToRgb, getGemByHex } = require('../src/shared/constants/prismaticGems')

// Verify palette completeness
assert.ok(Array.isArray(PRISMATIC_GEMS), 'PRISMATIC_GEMS should be an array')
assert.strictEqual(PRISMATIC_GEMS.length, 42, 'Should include all 42 Valve prismatic gems')

// Test hexToRgb conversion
assert.strictEqual(hexToRgb('#D11FA1'), '209 31 161', 'Rubiline RGB should be 209 31 161')
assert.strictEqual(hexToRgb('#DCF2FF'), '220 242 255', "Creator's Light RGB should be 220 242 255")
assert.strictEqual(hexToRgb('#060606'), '6 6 6', 'Cursed Black RGB should be 6 6 6')

// Test getGemByHex lookup
const rubiline = getGemByHex('#D11FA1')
assert.ok(rubiline, 'Rubiline lookup should find gem')
assert.strictEqual(rubiline.name, 'Rubiline')

console.log('✔ Task 1 Prismatic Gems tests passed')
