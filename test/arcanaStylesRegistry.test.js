const assert = require('assert')
const { getCosmeticCustomizationInfo } = require('../src/shared/constants/arcanaStyles')

// Vengeful Spirit Arcana check
const vsInfo = getCosmeticCustomizationInfo('vengeful spirit', 'shoulder', 'The Resurrection of Shen - Wings')
assert.ok(vsInfo, 'VS Wings should have customization info')
assert.strictEqual(vsInfo.hasStyles, true)
assert.strictEqual(vsInfo.styles.length, 3)
assert.strictEqual(vsInfo.styles[2].name, 'Queen Imperia')

// QoP Arcana check
const qopInfo = getCosmeticCustomizationInfo('queen of pain', 'back', 'Eminence of Ristul')
assert.ok(qopInfo, 'QoP Back should have customization info')
assert.strictEqual(qopInfo.hasStyles, true)
assert.strictEqual(qopInfo.styles.length, 2)
assert.strictEqual(qopInfo.styles[1].name, 'Royal Decree')

// Terrorblade Arcana check (no style customization, returns null)
const tbInfo = getCosmeticCustomizationInfo('terrorblade', 'hero_base', 'Fractal Horns of Inner Abysm')
assert.strictEqual(tbInfo, null)

// Wraith King Arcana check
const wkInfo = getCosmeticCustomizationInfo('skeleton king', 'head', 'The One True King')
assert.ok(wkInfo, 'WK Arcana should have customization info')
assert.strictEqual(wkInfo.hasStyles, true)
assert.strictEqual(wkInfo.styles.length, 2)

console.log('✔ Arcana Registry tests passed')
