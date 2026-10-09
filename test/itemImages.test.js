const assert = require('assert')
const { getItemImage } = require('../src/renderer/utils/itemImages')

// 1. Bundled item should return local assets path
const bundled = getItemImage({
  id: '7986',
  name: 'Dark Artistry Hair',
  img: 'econ/items/invoker/dark_artistry/dark_artistry_hair_model'
})
assert.strictEqual(bundled, '../assets/items/7986.png', 'Bundled items must use assets/items/')

// 2. Unbundled item with econ/ path should route through skinforge-icon:// protocol
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

// 3. Default base item should return hero portrait or base SVG
const defaultBase = getItemImage({ isDefault: true, name: 'Default Base' }, 'weapon', 'invoker')
assert.strictEqual(defaultBase, '../assets/heroes/invoker.png', 'Default base should use hero portrait')

// 4. Missing/empty item without heroTag should return procedural SVG data URI
const emptyNoHero = getItemImage(null, 'weapon', '')
assert.ok(emptyNoHero.startsWith('data:image/svg+xml'), 'Empty item without hero should return SVG')

// 5. Missing/empty item with heroTag should return hero portrait
const emptyWithHero = getItemImage(null, 'weapon', 'invoker')
assert.strictEqual(emptyWithHero, '../assets/heroes/invoker.png', 'Empty item with hero should return portrait')

console.log('getItemImage protocol tests passed!')
