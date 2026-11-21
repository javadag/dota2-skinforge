import test from 'node:test'
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  buildTarBuffer,
  computeFileSha256,
  createTarBrotliFromDir,
  extractTarBrotliSafely,
  extractTarBufferSafely,
  sanitizeArchiveEntryPath
} from '../src/main/services/assets/archiveUtils'

test('sanitizeArchiveEntryPath prevents path traversal and drive letters', () => {
  assert.equal(sanitizeArchiveEntryPath('models/hero.vmdl_c'), 'models/hero.vmdl_c')
  assert.equal(sanitizeArchiveEntryPath('models\\hero.vmdl_c'), 'models/hero.vmdl_c')
  assert.equal(sanitizeArchiveEntryPath('/models/hero.vmdl_c'), 'models/hero.vmdl_c')

  assert.throws(() => sanitizeArchiveEntryPath('../etc/passwd'), /path traversal/)
  assert.throws(() => sanitizeArchiveEntryPath('models/../../hero.vmdl_c'), /path traversal/)
  assert.throws(() => sanitizeArchiveEntryPath('C:/Windows/system32'), /drive or device/)
  assert.throws(() => sanitizeArchiveEntryPath(''), /empty path/)
  assert.throws(() => sanitizeArchiveEntryPath('/'), /empty path/)
})

test('computeFileSha256 hashes file contents accurately', async (t) => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skinforge-sha-test-'))
  t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }))
  const filePath = path.join(tmpDir, 'payload.bin')
  const payload = Buffer.from('skinforge-archive-sha256-test')
  fs.writeFileSync(filePath, payload)

  const expected = crypto.createHash('sha256').update(payload).digest('hex')
  assert.equal(await computeFileSha256(filePath), expected)
})

test('createTarBrotliFromDir and extractTarBrotliSafely roundtrip cleanly with long paths', async (t) => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skinforge-tar-test-'))
  t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }))
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
})

test('extractTarBufferSafely rejects malicious path traversal headers', async (t) => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skinforge-tar-attack-'))
  t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }))
  const srcDir = path.join(tmpDir, 'src')
  fs.mkdirSync(srcDir, { recursive: true })
  fs.writeFileSync(path.join(srcDir, 'safe.txt'), 'hello')

  const tarBuf = buildTarBuffer(srcDir, [path.join(srcDir, 'safe.txt')])
  tarBuf.write('../../evil.txt\0', 0, 100, 'utf8')

  await assert.rejects(() => extractTarBufferSafely(tarBuf, path.join(tmpDir, 'out')), /path traversal/)
})

test('extractTarBufferSafely rejects negative sizes and non-regular entry types', async (t) => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skinforge-tar-corrupt-'))
  t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }))
  const srcDir = path.join(tmpDir, 'src')
  fs.mkdirSync(srcDir, { recursive: true })
  fs.writeFileSync(path.join(srcDir, 'safe.txt'), 'hello')

  const negSizeBuf = buildTarBuffer(srcDir, [path.join(srcDir, 'safe.txt')])
  negSizeBuf.write('-0000001000\0', 124, 12, 'utf8')
  await assert.rejects(() => extractTarBufferSafely(negSizeBuf, path.join(tmpDir, 'out1')), /invalid octal size/)

  const symlinkBuf = buildTarBuffer(srcDir, [path.join(srcDir, 'safe.txt')])
  symlinkBuf.write('2', 156, 1, 'utf8')
  await assert.rejects(() => extractTarBufferSafely(symlinkBuf, path.join(tmpDir, 'out2')), /Unsupported TAR entry type/)
})
