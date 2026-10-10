const assert = require('assert')
const { loadHeroesData, loadCategoriesData } = require('../src/main/ipc/systemIpc')

console.log('Testing System IPC and heroes/categories data loaders...')

const heroesData = loadHeroesData()
assert.ok(heroesData, 'loadHeroesData must return a valid object')
assert.ok(Array.isArray(heroesData.heroes), 'heroes must be an array')
assert.strictEqual(heroesData.heroes.length, 127, `Expected exactly 127 official heroes in heroes.json, got ${heroesData.heroes.length}`)

const firstHero = heroesData.heroes.find((h) => h.tag === 'abaddon')
assert.ok(firstHero, 'Abaddon hero must exist in local database')
assert.ok(typeof firstHero.img === 'string', 'Hero must have valid image path')
assert.ok(Array.isArray(firstHero.alias), 'Hero must have aliases array')

const categoriesData = loadCategoriesData()
assert.ok(categoriesData, 'loadCategoriesData must return a valid object')
assert.ok(Array.isArray(categoriesData.categories), 'categories must be an array')
assert.ok(categoriesData.categories.length > 0, `Expected categories in categories.json, got ${categoriesData.categories.length}`)

assert.ok(Array.isArray(categoriesData.groups), 'groups must be an array')
assert.strictEqual(categoriesData.groups.length, 2, 'Must have 2 non-hero category groups (World, Interface)')

const courier = categoriesData.categories.find((c) => c.tag === 'courier')
assert.ok(courier, 'Official courier global item must exist in categories.json')
assert.strictEqual(courier.g, 'world')

const creeps = categoriesData.categories.find((c) => c.tag === 'creeps')
assert.ok(creeps, 'Official creeps global item must exist in categories.json')
assert.strictEqual(creeps.g, 'world')

console.log('System IPC heroes and categories loader tests passed cleanly!')
