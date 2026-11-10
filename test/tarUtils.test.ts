import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  createTarBrotliFromDir,
  extractTarBrotliSafely,
  sanitizeTarEntryPath,
  buildTarBuffer,
  extractTarBufferSafely
} from '../src/main/services/tarUtils'

test('sanitizeTarEntryPath prevents path traversal and drive letters', () => {
  assert.equal(sanitizeTarEntryPath('models/hero.vmdl_c'), 'models/hero.vmdl_c')
  assert.equal(sanitizeTarEntryPath('models\\hero.vmdl_c'), 'models/hero.vmdl_c')
  assert.equal(sanitizeTarEntryPath('/models/hero.vmdl_c'), 'models/hero.vmdl_c')

  assert.throws(() => sanitizeTarEntryPath('../etc/passwd'), /path traversal/)
  assert.throws(() => sanitizeTarEntryPath('models/../../hero.vmdl_c'), /path traversal/)
  assert.throws(() => sanitizeTarEntryPath('C:/Windows/system32'), /drive or device/)
})

test('createTarBrotliFromDir and extractTarBrotliSafely roundtrip cleanly with long paths', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skinforge-tar-test-'))
  const srcDir = path.join(tmpDir, 'source')
  const outTarBr = path.join(tmpDir, 'test.tar.br')
  const extractDir = path.join(tmpDir, 'extracted')

  const veryLongDirName = 'a_very_long_directory_name_that_exceeds_normal_short_path_expectations_for_valve_assets'
  const veryLongFileName = 'monkey_king_arcana_special_refit_extra_custom_inverted_crown_texture_normal_lod0.vtex_c'
  const deepDir = path.join(srcDir, veryLongDirName)

  fs.mkdirSync(deepDir, { recursive: true })
  fs.writeFileSync(path.join(srcDir, 'short.txt'), 'Short file content')
  fs.writeFileSync(path.join(deepDir, veryLongFileName), Buffer.from([10, 20, 30, 40, 50, 60, 70, 80]))

  const createResult = await createTarBrotliFromDir(srcDir, outTarBr)
  assert.equal(createResult.fileCount, 2)
  assert.ok(fs.existsSync(outTarBr))

  const extractResult = await extractTarBrotliSafely(outTarBr, extractDir)
  assert.equal(extractResult.fileCount, 2)

  assert.equal(fs.readFileSync(path.join(extractDir, 'short.txt'), 'utf8'), 'Short file content')
  const extractedLong = fs.readFileSync(path.join(extractDir, veryLongDirName, veryLongFileName))
  assert.deepEqual(extractedLong, Buffer.from([10, 20, 30, 40, 50, 60, 70, 80]))

  fs.rmSync(tmpDir, { recursive: true, force: true })
})

test('extractTarBufferSafely rejects malicious path traversal headers', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skinforge-tar-attack-'))
  const srcDir = path.join(tmpDir, 'src')
  fs.mkdirSync(srcDir, { recursive: true })
  fs.writeFileSync(path.join(srcDir, 'safe.txt'), 'hello')

  const tarBuf = buildTarBuffer(srcDir, [path.join(srcDir, 'safe.txt')])

  // Tamper with the entry name in the header to be a path traversal
  tarBuf.write('../../evil.txt\0', 0, 100, 'utf8')

  await assert.rejects(() => extractTarBufferSafely(tarBuf, path.join(tmpDir, 'out')), /path traversal/)

  fs.rmSync(tmpDir, { recursive: true, force: true })
})
