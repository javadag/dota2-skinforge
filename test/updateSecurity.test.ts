import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'
import {
  isNewerVersion,
  parseChecksums,
  validateUpdateInstallPath,
  verifyFileSha256,
  parseReleaseInfo
} from '../src/main/services/app/updateService'

test('isNewerVersion accurately handles semver comparison and prereleases', () => {
  assert.equal(isNewerVersion('1.3.0', '1.4.0'), true)
  assert.equal(isNewerVersion('v1.3.1', 'v1.3.2'), true)
  assert.equal(isNewerVersion('1.4.0', '1.3.9'), false)
  assert.equal(isNewerVersion('1.4.0', '1.4.0'), false)
  // Prerelease comparison: stable release is newer than prerelease of same version
  assert.equal(isNewerVersion('1.4.0-beta.1', '1.4.0'), true)
})

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

test('verifyFileSha256 validates file matches expected hash', async (t) => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sf-hash-test-'))
  t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }))
  const testFile = path.join(tmpDir, 'test.bin')
  const content = Buffer.from('SkinForge Update Payload 12345')
  fs.writeFileSync(testFile, content)

  const expectedSha = crypto.createHash('sha256').update(content).digest('hex')
  const match = await verifyFileSha256(testFile, expectedSha)
  assert.equal(match, true)

  const wrongSha = '0000000000000000000000000000000000000000000000000000000000000000'
  const mismatch = await verifyFileSha256(testFile, wrongSha)
  assert.equal(mismatch, false)
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

test('installUpdate rejects path traversal or files outside updates directory', async (t) => {
  const { installUpdate } = await import('../src/main/services/app/updateService')
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sf-install-test-'))
  t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }))
  const evilFile = path.join(tmpDir, 'evil.bat')
  fs.writeFileSync(evilFile, 'echo evil')

  const res = await installUpdate(evilFile, undefined, { updatesDir: tmpDir, skipSpawn: true })
  assert.equal(res.ok, false)
  assert.match(res.error || '', /security violation|extension/i)

  const traversalFile = path.join(tmpDir, '..', 'evil.exe')
  const res2 = await installUpdate(traversalFile, undefined, { updatesDir: tmpDir, skipSpawn: true })
  assert.equal(res2.ok, false)
  assert.match(res2.error || '', /security violation/i)
})

test('installUpdate verifies SHA-256 before launching', async (t) => {
  const { installUpdate } = await import('../src/main/services/app/updateService')
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sf-install-hash-'))
  t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }))
  const updateExe = path.join(tmpDir, 'Dota2SkinForge-Portable.exe')
  fs.writeFileSync(updateExe, Buffer.from('Legit skinforge binary'))

  const wrongSha = '1111111111111111111111111111111111111111111111111111111111111111'
  const failRes = await installUpdate(updateExe, wrongSha, { updatesDir: tmpDir, skipSpawn: true })
  assert.equal(failRes.ok, false)
  assert.match(failRes.error || '', /integrity check failed/i)

  const correctSha = crypto.createHash('sha256').update(Buffer.from('Legit skinforge binary')).digest('hex')
  const passRes = await installUpdate(updateExe, correctSha, { updatesDir: tmpDir, skipSpawn: true })
  assert.equal(passRes.ok, true)
})

test('downloadUpdate rejects corrupted payload when SHA mismatch occurs', async (t) => {
  const http = await import('node:http')
  const { downloadUpdate } = await import('../src/main/services/app/updateService')

  const server = http.createServer((_req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/octet-stream' })
    res.end('corrupted file content')
  })

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sf-dl-test-'))
  t.after(() => {
    server.close()
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  const addr = server.address()
  const port = typeof addr === 'object' && addr ? addr.port : 0
  const downloadUrl = `http://127.0.0.1:${port}/update.exe`

  const expectedSha = 'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff'
  const blockedLoopback = await downloadUpdate(downloadUrl, 'test-download.exe', undefined, expectedSha, {
    updatesDir: tmpDir
  })
  assert.equal(blockedLoopback.ok, false)
  assert.match(blockedLoopback.error || '', /untrusted update download URL/i)

  const result = await downloadUpdate(downloadUrl, 'test-download.exe', undefined, expectedSha, {
    updatesDir: tmpDir,
    allowLoopbackHttp: true
  })

  assert.equal(result.ok, false)
  assert.match(result.error || '', /integrity check failed/i)
})

test('downloadUpdate and installUpdate reject missing SHA-256 and untrusted download URLs', async () => {
  const { downloadUpdate, installUpdate } = await import('../src/main/services/app/updateService')

  const untrustedUrlRes = await downloadUpdate('http://evil.example.com/update.exe', 'update.exe', undefined, 'a'.repeat(64))
  assert.equal(untrustedUrlRes.ok, false)
  assert.match(untrustedUrlRes.error || '', /untrusted update download URL/i)

  const foreignRepoRes = await downloadUpdate(
    'https://github.com/attacker/evil-repo/releases/download/v1.0.0/setup.exe',
    'setup.exe',
    undefined,
    'a'.repeat(64)
  )
  assert.equal(foreignRepoRes.ok, false)
  assert.match(foreignRepoRes.error || '', /untrusted update download URL/i)

  const missingShaDownload = await downloadUpdate(
    'https://github.com/javadag/dota2-skinforge/releases/download/v1.0.0/setup.exe',
    'setup.exe'
  )
  assert.equal(missingShaDownload.ok, false)
  assert.match(missingShaDownload.error || '', /missing release SHA-256/i)

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sf-inst-test-'))
  try {
    const exePath = path.join(tmpDir, 'setup.exe')
    fs.writeFileSync(exePath, 'dummy')
    const missingShaInstall = await installUpdate(exePath, undefined, { updatesDir: tmpDir })
    assert.equal(missingShaInstall.ok, false)
    assert.match(missingShaInstall.error || '', /missing release SHA-256/i)
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  }
})

test('portable replace script builds safe batch move/relaunch and stale updates are cleaned up', async () => {
  const { buildPortableReplaceScript, cleanupStaleUpdates } = await import('../src/main/services/app/updateService')
  const script = buildPortableReplaceScript(
    'C:\\Users\\Test\\updates\\Dota2SkinForge-Portable.exe',
    'D:\\Games (100%)\\Dota2SkinForge-Portable.exe'
  )
  assert.match(script, /chcp 65001 >nul/)
  assert.match(script, /set "DST=D:\\Games \(100%%\)\\Dota2SkinForge-Portable\.exe"/)
  assert.match(script, /move \/Y "%SRC%" "%DST%"/)
  assert.match(script, /start "" \/D "%DST_DIR%" "%DST%"/)
  assert.match(script, /start "" \/D "%SRC_DIR%" "%SRC%"/)
  assert.match(script, /del \/F \/Q "%~f0"/)

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sf-cleanup-test-'))
  try {
    const staleExe = path.join(tmpDir, 'old-portable.exe')
    const staleCmd = path.join(tmpDir, 'portable-update.cmd')
    const keepTxt = path.join(tmpDir, 'notes.txt')
    fs.writeFileSync(staleExe, 'exe')
    fs.writeFileSync(staleCmd, '@echo off')
    fs.writeFileSync(keepTxt, 'keep')
    cleanupStaleUpdates(tmpDir)
    assert.equal(fs.existsSync(staleExe), false)
    assert.equal(fs.existsSync(staleCmd), false)
    assert.equal(fs.existsSync(keepTxt), true)
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  }
})

test('portable replace script executes detached on Windows and replaces target file', { skip: process.platform !== 'win32' }, async (t) => {
  const { spawn } = await import('node:child_process')
  const { buildPortableReplaceScript } = await import('../src/main/services/app/updateService')

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sf-portable-replace-'))
  t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }))

  const src = path.join(tmpDir, 'new-portable.exe')
  const dst = path.join(tmpDir, 'Dota2SkinForge-Portable.exe')
  const scriptPath = path.join(tmpDir, 'portable-update.cmd')

  fs.writeFileSync(src, 'NEW_PORTABLE_BINARY')
  fs.writeFileSync(dst, 'OLD_PORTABLE_BINARY')
  fs.writeFileSync(scriptPath, buildPortableReplaceScript(src, dst, { launchAfterReplace: false, maxAttempts: 10 }), 'utf8')

  const child = spawn(process.env.ComSpec || 'cmd.exe', ['/d', '/c', scriptPath], {
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
    cwd: os.tmpdir()
  })
  await new Promise<void>((resolve, reject) => {
    child.once('error', reject)
    child.once('spawn', () => {
      child.unref()
      resolve()
    })
  })

  // Poll up to 5s for the detached script to move src -> dst and self-delete.
  const deadline = Date.now() + 5000
  while (Date.now() < deadline && (fs.existsSync(src) || fs.existsSync(scriptPath))) {
    await new Promise((r) => setTimeout(r, 100))
  }

  assert.equal(fs.existsSync(src), false, 'source update file should be moved')
  assert.equal(fs.readFileSync(dst, 'utf8'), 'NEW_PORTABLE_BINARY', 'target portable exe should be replaced')
  assert.equal(fs.existsSync(scriptPath), false, 'helper script should self-delete')
})
