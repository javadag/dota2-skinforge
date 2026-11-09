import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createZipFromDir, extractZipSafely, sanitizeZipEntryPath, computeFileSha256 } from '../src/main/services/zipUtils'

test('sanitizeZipEntryPath prevents path traversal and drive letters', () => {
  assert.equal(sanitizeZipEntryPath('models/hero.vmdl_c'), 'models/hero.vmdl_c')
  assert.equal(sanitizeZipEntryPath('models\\hero.vmdl_c'), 'models/hero.vmdl_c')
  assert.equal(sanitizeZipEntryPath('/models/hero.vmdl_c'), 'models/hero.vmdl_c')

  assert.throws(() => sanitizeZipEntryPath('../etc/passwd'), /path traversal/)
  assert.throws(() => sanitizeZipEntryPath('models/../../hero.vmdl_c'), /path traversal/)
  assert.throws(() => sanitizeZipEntryPath('C:/Windows/system32'), /drive or device/)
})

test('createZipFromDir and extractZipSafely roundtrip cleanly', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skinforge-zip-test-'))
  const srcDir = path.join(tmpDir, 'source')
  const outZip = path.join(tmpDir, 'test.zip')
  const extractDir = path.join(tmpDir, 'extracted')

  fs.mkdirSync(path.join(srcDir, 'sub', 'folder'), { recursive: true })
  fs.writeFileSync(path.join(srcDir, 'test1.txt'), 'Hello World!')
  fs.writeFileSync(path.join(srcDir, 'sub', 'folder', 'test2.bin'), Buffer.from([1, 2, 3, 4, 5, 6, 7, 8]))

  const zipResult = await createZipFromDir(srcDir, outZip)
  assert.equal(zipResult.fileCount, 2)
  assert.ok(fs.existsSync(outZip))

  const sha = await computeFileSha256(outZip)
  assert.equal(typeof sha, 'string')
  assert.equal(sha.length, 64)

  const extractResult = await extractZipSafely(outZip, extractDir)
  assert.equal(extractResult.fileCount, 2)

  assert.equal(fs.readFileSync(path.join(extractDir, 'test1.txt'), 'utf8'), 'Hello World!')
  assert.deepEqual(fs.readFileSync(path.join(extractDir, 'sub', 'folder', 'test2.bin')), Buffer.from([1, 2, 3, 4, 5, 6, 7, 8]))

  fs.rmSync(tmpDir, { recursive: true, force: true })
})
