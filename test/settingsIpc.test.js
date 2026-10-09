const assert = require('assert')
const fs = require('fs')
const path = require('path')
const os = require('os')
const { getIconCacheStats, clearIconCache } = require('../src/main/services/iconCacheService')

async function runTest() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skinforge-cache-test-'))
  const sampleFile = path.join(tempDir, 'icon_cache', 'econ', 'sample.webp')
  fs.mkdirSync(path.dirname(sampleFile), { recursive: true })
  fs.writeFileSync(sampleFile, Buffer.from('test-image-content'))

  const stats = await getIconCacheStats(tempDir)
  assert.strictEqual(stats.count, 1, 'Should find 1 cached file')
  assert.ok(stats.sizeBytes > 0, 'Size must be greater than 0')
  assert.ok(stats.formattedSize.length > 0, 'Formatted size must be populated')

  const ok = await clearIconCache(tempDir)
  assert.strictEqual(ok, true, 'Clear cache should return true')

  const after = await getIconCacheStats(tempDir)
  assert.strictEqual(after.count, 0, 'Cache should be empty after clear')
  assert.strictEqual(after.sizeBytes, 0, 'Size should be 0 after clear')

  fs.rmSync(tempDir, { recursive: true, force: true })
  console.log('Settings & Cache IPC helper test passed!')
}

runTest().catch((err) => {
  console.error(err)
  process.exit(1)
})
