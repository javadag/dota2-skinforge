const assert = require('assert')
const { getItemStyleOptions, getStyleOptionsByName, styledItemNames } = require('../src/shared/constants/itemStyles')

// The catalog is generated from items_game.txt by scripts/build_item_styles.ts and is
// what the UI uses to offer style pills. These checks guard the file's shape, since a
// stale or empty catalog would silently hide every style option in the app.

const names = styledItemNames()
assert.ok(names.length > 500, `expected a substantial styles catalog, found ${names.length} items`)
assert.ok(
  names.every((name) => typeof name === 'string' && name.length > 0),
  'every key must be an item name'
)
console.log(`✔ itemStyles: catalog covers ${names.length} items`)

let checked = 0
for (const name of names) {
  const styles = getStyleOptionsByName(name)
  assert.ok(styles.length > 0, `${name} must expose at least one style`)
  const indices = styles.map((style) => style.index)
  assert.strictEqual(new Set(indices).size, indices.length, `${name} has duplicate style indices`)
  for (const style of styles) {
    assert.ok(Number.isInteger(style.index) && style.index >= 0, `${name} has a non-numeric style index`)
    assert.ok(typeof style.name === 'string' && style.name.length > 0, `${name} style ${style.index} has no name`)
  }
  checked++
}
console.log(`✔ itemStyles: ${checked} entries have well-formed, uniquely indexed styles`)

// Names must be resolved, not raw localization tokens.
const tokenLeaks = names.filter((name) => getStyleOptionsByName(name).some((style) => style.name.startsWith('#')))
assert.deepStrictEqual(tokenLeaks, [], `unresolved style tokens: ${tokenLeaks.slice(0, 5).join(', ')}`)
console.log('✔ itemStyles: every style name is resolved, not a raw localization token')

// Lookup semantics used by the UI.
const bladeform = getItemStyleOptions('juggernaut', 'hero_base', 'Bladeform Legacy')
assert.ok(bladeform && bladeform.hasStyles, 'Bladeform Legacy must report styles')
assert.ok(bladeform.styles.length >= 2, 'Bladeform Legacy has at least two styles')
assert.strictEqual(bladeform.styles[0].index, 0)

// A hero or slot mismatch must not leak another item's styles.
assert.strictEqual(getItemStyleOptions('axe', 'weapon', 'Bladeform Legacy'), null, 'hero mismatch must be rejected')
assert.strictEqual(getItemStyleOptions('juggernaut', 'weapon', 'Bladeform Legacy'), null, 'slot mismatch must be rejected')
assert.strictEqual(getItemStyleOptions('juggernaut', 'hero_base', 'Not A Real Item'), null)
assert.strictEqual(getItemStyleOptions(), null)
console.log('✔ itemStyles: lookup validates the hero and slot and rejects unknown items')

// Styles that change the model must carry it, which is what lets the UI preview them.
const withModels = names.filter((name) => getStyleOptionsByName(name).some((style) => style.model))
assert.ok(withModels.length > 0, 'some styles must declare a model')
console.log(`✔ itemStyles: ${withModels.length} items declare a style-specific model`)

console.log('✔ all item styles catalog tests passed')
