const assert = require('assert')
const { parseArgs, loadEnvFile, findDotaVpkPath } = require('../scripts/sync_r2_icons')

assert.strictEqual(typeof parseArgs, 'function', 'parseArgs must be exported')
assert.strictEqual(typeof loadEnvFile, 'function', 'loadEnvFile must be exported')
assert.strictEqual(typeof findDotaVpkPath, 'function', 'findDotaVpkPath must be exported')

// 1. Test argument parsing
const parsed = parseArgs(['--vpk', 'D:\\dummy\\pak01_dir.vpk', '--limit', '10', '--dry-run', '--skip-extract'])
assert.strictEqual(parsed.vpk, 'D:\\dummy\\pak01_dir.vpk')
assert.strictEqual(parsed.limit, 10)
assert.strictEqual(parsed.dryRun, true)
assert.strictEqual(parsed.skipExtract, true)

// 2. Test VPK auto-detection on this machine
const foundVpk = findDotaVpkPath()
console.log('[Test Info] Found local VPK:', foundVpk)
assert.ok(typeof foundVpk === 'string' || foundVpk === null, 'Should return string or null')

// 3. Test catalog image paths extraction
const { getCatalogImagePaths } = require('../scripts/sync_r2_icons')
assert.strictEqual(typeof getCatalogImagePaths, 'function', 'getCatalogImagePaths must be exported')
const catalogSet = getCatalogImagePaths()
assert.ok(catalogSet.size > 5000, `Catalog set should contain at least 5000 items, got ${catalogSet.size}`)
console.log(`[Test Info] Indexed ${catalogSet.size} unique catalog cosmetic paths.`)

console.log('Sync CLI unit tests passed!')
