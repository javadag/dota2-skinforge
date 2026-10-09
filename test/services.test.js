const assert = require('assert')
const gameinfoService = require('../src/main/services/gameinfoService')
const signatureService = require('../src/main/services/signatureService')
const pipelineService = require('../src/main/services/pipelineService')
const dotaPathService = require('../src/main/services/dotaPathService')
const vpkService = require('../src/main/services/vpkService')
const appPathService = require('../src/main/services/appPathService')

assert.strictEqual(typeof dotaPathService.detectDotaPath, 'function')
assert.strictEqual(typeof dotaPathService.isValidDotaGameDir, 'function')

assert.strictEqual(typeof gameinfoService.getGameinfoPath, 'function')
assert.strictEqual(typeof gameinfoService.injectSearchPaths, 'function')
assert.strictEqual(typeof gameinfoService.restoreCleanGameinfo, 'function')

assert.strictEqual(typeof signatureService.getSignaturesPath, 'function')
assert.strictEqual(typeof signatureService.updateSignaturesForGameinfo, 'function')
assert.strictEqual(typeof signatureService.restoreSignatures, 'function')

assert.strictEqual(typeof vpkService.pack, 'function')
assert.strictEqual(typeof vpkService.packMultiChunk, 'function')

assert.strictEqual(typeof pipelineService.checkStatus, 'function')
assert.strictEqual(typeof pipelineService.installMods, 'function')
assert.strictEqual(typeof pipelineService.uninstallMods, 'function')
assert.strictEqual(typeof pipelineService.isDotaRunning, 'function')

assert.strictEqual(typeof appPathService.getAppRoot, 'function')
assert.strictEqual(typeof appPathService.getDataPath, 'function')
assert.strictEqual(typeof appPathService.getToolsPath, 'function')
assert.strictEqual(typeof appPathService.getStagingPackPath, 'function')
assert.strictEqual(typeof appPathService.getStagingIconsPath, 'function')

console.log('Services structure test passed!')
