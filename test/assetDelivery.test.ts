import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { downloadAndInstallPackage, isPackageReadyLocally } from '../src/main/services/assetDeliveryService'
import { createZipFromDir } from '../src/main/services/zipUtils'
import { createTarBrotliFromDir } from '../src/main/services/tarUtils'
import type { AssetPackageEntry } from '../src/shared/types/assetPackages'

test('downloadAndInstallPackage streams, checks sha256, and extracts cleanly', async () => {
  const tmpBase = fs.mkdtempSync(path.join(os.tmpdir(), 'skinforge-delivery-test-'))
  process.env.SKINFORGE_ASSET_CACHE = tmpBase

  // Create mock source package
  const pkgDir = path.join(tmpBase, 'pkg_src')
  fs.mkdirSync(path.join(pkgDir, 'models'), { recursive: true })
  fs.writeFileSync(path.join(pkgDir, 'models', 'hero.vmdl_c'), 'MOCK_HERO_MODEL')
  fs.writeFileSync(path.join(pkgDir, 'items_patch.txt'), '"patch" { "key" "val" }')

  const zipPath = path.join(tmpBase, 'antimage.zip')
  await createZipFromDir(pkgDir, zipPath)
  const zipBytes = fs.readFileSync(zipPath)

  const crypto = await import('crypto')
  const validSha = crypto.createHash('sha256').update(zipBytes).digest('hex')

  const mockEntry: AssetPackageEntry = {
    file: 'antimage.zip',
    version: '1.0.0',
    sha256: validSha,
    size: zipBytes.length
  }

  // Mock fetch that returns our zip
  const mockFetch = (async () => {
    return new Response(zipBytes, {
      status: 200,
      headers: { 'content-length': String(zipBytes.length) }
    })
  }) as unknown as typeof fetch

  const installedDir = await downloadAndInstallPackage('antimage', mockEntry, undefined, mockFetch)
  assert.ok(fs.existsSync(installedDir))
  assert.equal(fs.readFileSync(path.join(installedDir, 'models', 'hero.vmdl_c'), 'utf8'), 'MOCK_HERO_MODEL')
  assert.ok(fs.existsSync(path.join(installedDir, '.package_state.json')))

  // Verify isPackageReadyLocally detects it
  assert.equal(isPackageReadyLocally('antimage', mockEntry), true)

  // Verify corrupted SHA-256 rejects
  const badEntry: AssetPackageEntry = {
    ...mockEntry,
    sha256: '0000000000000000000000000000000000000000000000000000000000000000'
  }
  await assert.rejects(() => downloadAndInstallPackage('antimage', badEntry, undefined, mockFetch), /Integrity check failed/)

  fs.rmSync(tmpBase, { recursive: true, force: true })
})

test('downloadAndInstallPackage handles .tar.br packages transparently', async () => {
  const tmpBase = fs.mkdtempSync(path.join(os.tmpdir(), 'skinforge-delivery-br-test-'))
  process.env.SKINFORGE_ASSET_CACHE = tmpBase

  // Create mock source package
  const pkgDir = path.join(tmpBase, 'pkg_src')
  fs.mkdirSync(path.join(pkgDir, 'models'), { recursive: true })
  fs.writeFileSync(path.join(pkgDir, 'models', 'drow.vmdl_c'), 'MOCK_DROW_MODEL')
  fs.writeFileSync(path.join(pkgDir, 'items_patch.txt'), '"patch" { "key" "val" }')

  const tarBrPath = path.join(tmpBase, 'drow.tar.br')
  await createTarBrotliFromDir(pkgDir, tarBrPath)
  const tarBrBytes = fs.readFileSync(tarBrPath)

  const crypto = await import('crypto')
  const validSha = crypto.createHash('sha256').update(tarBrBytes).digest('hex')

  const mockEntry: AssetPackageEntry = {
    file: 'drow.tar.br',
    version: '1.0.0',
    sha256: validSha,
    size: tarBrBytes.length
  }

  const mockFetch = (async () => {
    return new Response(tarBrBytes, {
      status: 200,
      headers: { 'content-length': String(tarBrBytes.length) }
    })
  }) as unknown as typeof fetch

  const installedDir = await downloadAndInstallPackage('drow', mockEntry, undefined, mockFetch)
  assert.ok(fs.existsSync(installedDir))
  assert.equal(fs.readFileSync(path.join(installedDir, 'models', 'drow.vmdl_c'), 'utf8'), 'MOCK_DROW_MODEL')
  assert.ok(fs.existsSync(path.join(installedDir, '.package_state.json')))

  assert.equal(isPackageReadyLocally('drow', mockEntry), true)

  fs.rmSync(tmpBase, { recursive: true, force: true })
})
