const assert = require('assert')
const path = require('path')

// Test helper functions of iconCacheService
const { resolveCachePath, normalizeIconPath, formatBytes } = require('../src/main/services/iconCacheService')

assert.strictEqual(typeof resolveCachePath, 'function', 'resolveCachePath must be exported')
assert.strictEqual(typeof normalizeIconPath, 'function', 'normalizeIconPath must be exported')
assert.strictEqual(typeof formatBytes, 'function', 'formatBytes must be exported')

// 1. Path normalization
assert.strictEqual(normalizeIconPath('skinforge-icon://econ/items/invoker/dark_artistry.webp'), 'econ/items/invoker/dark_artistry.webp')
assert.strictEqual(normalizeIconPath('skinforge-icon://econ/items/invoker/dark_artistry.png'), 'econ/items/invoker/dark_artistry.webp')
assert.strictEqual(
  normalizeIconPath('skinforge-icon://econ/items/invoker/dark_artistry_png.vtex_c'),
  'econ/items/invoker/dark_artistry_png.webp'
)

// 2. Cache path resolution
const mockBase = 'C:\\mockUserData'
const resolved = resolveCachePath(mockBase, 'econ/items/invoker/dark_artistry.webp')
assert.strictEqual(resolved, path.join(mockBase, 'icon_cache', 'econ/items/invoker/dark_artistry.webp'))

// 3. Format bytes helper
assert.strictEqual(formatBytes(0), '0 B')
assert.strictEqual(formatBytes(1024), '1.0 KB')
assert.strictEqual(formatBytes(1024 * 1024 * 2.5), '2.5 MB')

console.log('Icon cache service unit tests passed!')
