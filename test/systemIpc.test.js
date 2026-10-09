const assert = require('assert')
const { loadHeroesData } = require('../src/main/ipc/systemIpc')

console.log('Testing System IPC and heroes data loader...')

const data = loadHeroesData()
assert.ok(data, 'loadHeroesData must return a valid object')
assert.ok(Array.isArray(data.heroes), 'heroes must be an array')
assert.strictEqual(data.heroes.length, 187, `Expected 187 heroes in local database, but got ${data.heroes.length}`)
assert.ok(Array.isArray(data.groups), 'groups must be an array')

// Verify first item contains expected structure
const firstHero = data.heroes.find((h) => h.tag === 'abaddon')
assert.ok(firstHero, 'Abaddon hero must exist in local database')
assert.strictEqual(typeof firstHero.mods, 'number')

console.log('System IPC heroes loader tests passed cleanly!')
