import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'
import { parseChecksums, validateUpdateInstallPath, verifyFileSha256, parseReleaseInfo } from '../src/main/services/updateService'

test('parseChecksums parses standard sha256sum output format', () => {
  const manifest = `
# Checksums for Release v1.3.3
e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855  Dota2SkinForge-Portable.exe
A1B2C3D4E5F678901234567890ABCDEF1234567890ABCDEF1234567890ABCDEF *Dota2SkinForge-Setup-v1.3.3.exe
`
  const map = parseChecksums(manifest)
  assert.equal(map['Dota2SkinForge-Portable.exe'], 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855')
  assert.equal(map['Dota2SkinForge-Setup-v1.3.3.exe'], 'a1b2c3d4e5f678901234567890abcdef1234567890abcdef1234567890abcdef')
})

test('validateUpdateInstallPath prevents path traversal and non-exe files', () => {
  const tmpDir = path.resolve(os.tmpdir(), 'skinforge-updates-test')
  const validFile = path.join(tmpDir, 'Dota2SkinForge-Portable.exe')

  assert.equal(validateUpdateInstallPath(validFile, tmpDir), true)

  // Disallow path traversal
  const traversal = path.join(tmpDir, '..', 'cmd.exe')
  assert.equal(validateUpdateInstallPath(traversal, tmpDir), false)

  // Disallow files outside updates dir
  assert.equal(validateUpdateInstallPath('C:\\Windows\\System32\\cmd.exe', tmpDir), false)

  // Disallow non-exe extensions
  const badExt = path.join(tmpDir, 'script.bat')
  assert.equal(validateUpdateInstallPath(badExt, tmpDir), false)
})

test('verifyFileSha256 validates file matches expected hash', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sf-hash-test-'))
  const testFile = path.join(tmpDir, 'test.bin')
  const content = Buffer.from('SkinForge Update Payload 12345')
  fs.writeFileSync(testFile, content)

  const expectedSha = crypto.createHash('sha256').update(content).digest('hex')
  const match = await verifyFileSha256(testFile, expectedSha)
  assert.equal(match, true)

  const wrongSha = '0000000000000000000000000000000000000000000000000000000000000000'
  const mismatch = await verifyFileSha256(testFile, wrongSha)
  assert.equal(mismatch, false)

  fs.rmSync(tmpDir, { recursive: true, force: true })
})

test('parseReleaseInfo associates checksums when SHA256SUMS asset exists or body has checksums', () => {
  const fakeRelease = {
    tag_name: 'v1.4.0',
    body: `### Release notes
SHA256:
e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855  Dota2SkinForge-Portable.exe`,
    assets: [
      {
        name: 'Dota2SkinForge-Portable.exe',
        size: 50000000,
        browser_download_url: 'https://example.com/Dota2SkinForge-Portable.exe'
      },
      {
        name: 'SHA256SUMS.txt',
        size: 200,
        browser_download_url: 'https://example.com/SHA256SUMS.txt'
      }
    ]
  }

  const info = parseReleaseInfo(fakeRelease, '1.3.2')
  assert.equal(info.updateAvailable, true)
  assert.ok(info.checksumsAsset)
  assert.equal(info.checksumsAsset.name, 'SHA256SUMS.txt')
  assert.equal(info.portableAsset?.sha256, 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855')
})

test('installUpdate rejects path traversal or files outside updates directory', async () => {
  const { installUpdate } = await import('../src/main/services/updateService')
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sf-install-test-'))
  const evilFile = path.join(tmpDir, 'evil.bat')
  fs.writeFileSync(evilFile, 'echo evil')

  const res = await installUpdate(evilFile, undefined, { updatesDir: tmpDir, skipSpawn: true })
  assert.equal(res.ok, false)
  assert.match(res.error || '', /security violation|extension/i)

  const traversalFile = path.join(tmpDir, '..', 'evil.exe')
  const res2 = await installUpdate(traversalFile, undefined, { updatesDir: tmpDir, skipSpawn: true })
  assert.equal(res2.ok, false)
  assert.match(res2.error || '', /security violation/i)

  fs.rmSync(tmpDir, { recursive: true, force: true })
})

test('installUpdate verifies SHA-256 before launching', async () => {
  const { installUpdate } = await import('../src/main/services/updateService')
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sf-install-hash-'))
  const updateExe = path.join(tmpDir, 'Dota2SkinForge-Portable.exe')
  fs.writeFileSync(updateExe, Buffer.from('Legit skinforge binary'))

  const wrongSha = '1111111111111111111111111111111111111111111111111111111111111111'
  const failRes = await installUpdate(updateExe, wrongSha, { updatesDir: tmpDir, skipSpawn: true })
  assert.equal(failRes.ok, false)
  assert.match(failRes.error || '', /integrity check failed/i)

  const correctSha = crypto.createHash('sha256').update(Buffer.from('Legit skinforge binary')).digest('hex')
  const passRes = await installUpdate(updateExe, correctSha, { updatesDir: tmpDir, skipSpawn: true })
  assert.equal(passRes.ok, true)

  fs.rmSync(tmpDir, { recursive: true, force: true })
})

test('downloadUpdate rejects corrupted payload when SHA mismatch occurs', async () => {
  const http = await import('node:http')
  const { downloadUpdate } = await import('../src/main/services/updateService')

  const server = http.createServer((_req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/octet-stream' })
    res.end('corrupted file content')
  })

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const addr = server.address()
  const port = typeof addr === 'object' && addr ? addr.port : 0
  const downloadUrl = `http://127.0.0.1:${port}/update.exe`

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sf-dl-test-'))
  const expectedSha = 'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff'
  const result = await downloadUpdate(downloadUrl, 'test-download.exe', undefined, expectedSha, {
    updatesDir: tmpDir
  })

  server.close()
  fs.rmSync(tmpDir, { recursive: true, force: true })

  assert.equal(result.ok, false)
  assert.match(result.error || '', /integrity check failed/i)
})
