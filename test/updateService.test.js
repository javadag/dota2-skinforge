const assert = require('assert')
const fs = require('fs')
const path = require('path')
const os = require('os')
const { isNewerVersion, parseReleaseInfo, migrateLegacySettings } = require('../src/main/services/updateService')

async function runTests() {
  console.log('Testing isNewerVersion...')
  assert.strictEqual(isNewerVersion('1.3.1', 'v1.3.2'), true)
  assert.strictEqual(isNewerVersion('1.3.1', '1.4.0'), true)
  assert.strictEqual(isNewerVersion('1.3.1', '2.0.0'), true)
  assert.strictEqual(isNewerVersion('1.3.1', 'v1.3.1'), false)
  assert.strictEqual(isNewerVersion('1.3.1', '1.3.0'), false)
  assert.strictEqual(isNewerVersion('1.3.1', '1.2.99'), false)
  assert.strictEqual(isNewerVersion('1.3.1-beta', '1.3.1'), true)

  console.log('Testing parseReleaseInfo...')
  const mockRelease = {
    tag_name: 'v1.4.0',
    name: 'Version 1.4.0 - Major Overhaul',
    body: '## What is changed\n- Fixed something\n- Added auto update',
    html_url: 'https://github.com/javadag/dota2-skinforge/releases/tag/v1.4.0',
    published_at: '2026-10-20T12:00:00Z',
    assets: [
      {
        name: 'Dota2SkinForge-Portable.exe',
        size: 85000000,
        browser_download_url: 'https://github.com/javadag/dota2-skinforge/releases/download/v1.4.0/Dota2SkinForge-Portable.exe'
      },
      {
        name: 'Dota2SkinForge-Setup-v1.4.0.exe',
        size: 90000000,
        browser_download_url: 'https://github.com/javadag/dota2-skinforge/releases/download/v1.4.0/Dota2SkinForge-Setup-v1.4.0.exe'
      }
    ]
  }

  const parsed = parseReleaseInfo(mockRelease, '1.3.1')
  assert.strictEqual(parsed.updateAvailable, true)
  assert.strictEqual(parsed.version, '1.4.0')
  assert.strictEqual(parsed.displayVersion, 'v1.4.0')
  assert.strictEqual(parsed.releaseNotes, mockRelease.body)
  assert.strictEqual(parsed.htmlUrl, mockRelease.html_url)
  assert.strictEqual(parsed.assets.length, 2)
  assert.strictEqual(parsed.portableAsset?.name, 'Dota2SkinForge-Portable.exe')
  assert.strictEqual(parsed.installerAsset?.name, 'Dota2SkinForge-Setup-v1.4.0.exe')

  const parsedSame = parseReleaseInfo(mockRelease, '1.4.0')
  assert.strictEqual(parsedSame.updateAvailable, false)

  console.log('Testing migrateLegacySettings...')
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skinforge-migrate-test-'))
  const legacyDir = path.join(tempDir, 'Electron')
  const targetDir = path.join(tempDir, 'Dota 2 SkinForge')
  fs.mkdirSync(legacyDir, { recursive: true })
  fs.mkdirSync(targetDir, { recursive: true })

  const legacyFile = path.join(legacyDir, 'skinforge_settings.json')
  const targetFile = path.join(targetDir, 'skinforge_settings.json')

  fs.writeFileSync(legacyFile, JSON.stringify({ dotaPath: 'D:\\Steam\\steamapps\\common\\dota 2 beta\\game' }), 'utf8')

  const migrated = migrateLegacySettings(legacyDir, targetDir)
  assert.strictEqual(migrated, true, 'Should successfully migrate legacy file')
  assert.strictEqual(fs.existsSync(targetFile), true, 'Target file should exist')
  const content = JSON.parse(fs.readFileSync(targetFile, 'utf8'))
  assert.strictEqual(content.dotaPath, 'D:\\Steam\\steamapps\\common\\dota 2 beta\\game')

  // Calling again when target exists should NOT overwrite
  const second = migrateLegacySettings(legacyDir, targetDir)
  assert.strictEqual(second, false, 'Should not migrate again if target already exists')

  fs.rmSync(tempDir, { recursive: true, force: true })
  console.log('All updateService tests passed!')
}

runTests().catch((err) => {
  console.error(err)
  process.exit(1)
})
