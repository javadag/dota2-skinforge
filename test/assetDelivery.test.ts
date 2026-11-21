import test from 'node:test'
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createTarBrotliFromDir } from '../src/main/services/assets/archiveUtils'
import { downloadAndInstallPackage, isPackageReadyLocally } from '../src/main/services/assets/assetDeliveryService'
import type { AssetPackageEntry } from '../src/shared/types/assetPackages'

test('downloadAndInstallPackage streams .tar.br, checks sha256, and extracts cleanly', async (t) => {
  const tmpBase = fs.mkdtempSync(path.join(os.tmpdir(), 'skinforge-delivery-test-'))
  const prevCache = process.env.SKINFORGE_ASSET_CACHE
  const prevSource = process.env.SKINFORGE_ASSET_SOURCE
  process.env.SKINFORGE_ASSET_CACHE = tmpBase
  delete process.env.SKINFORGE_ASSET_SOURCE
  t.after(() => {
    if (prevCache === undefined) delete process.env.SKINFORGE_ASSET_CACHE
    else process.env.SKINFORGE_ASSET_CACHE = prevCache
    if (prevSource === undefined) delete process.env.SKINFORGE_ASSET_SOURCE
    else process.env.SKINFORGE_ASSET_SOURCE = prevSource
    fs.rmSync(tmpBase, { recursive: true, force: true })
  })

  const pkgDir = path.join(tmpBase, 'pkg_src')
  fs.mkdirSync(path.join(pkgDir, 'models'), { recursive: true })
  fs.writeFileSync(path.join(pkgDir, 'models', 'hero.vmdl_c'), 'MOCK_HERO_MODEL')
  fs.writeFileSync(path.join(pkgDir, 'items_patch.txt'), '"patch" { "key" "val" }')

  const tarBrPath = path.join(tmpBase, 'antimage.tar.br')
  await createTarBrotliFromDir(pkgDir, tarBrPath)
  const tarBrBytes = fs.readFileSync(tarBrPath)
  const validSha = crypto.createHash('sha256').update(tarBrBytes).digest('hex')

  const mockEntry: AssetPackageEntry = {
    file: 'antimage.tar.br',
    version: '1.0.0',
    sha256: validSha,
    size: tarBrBytes.length
  }

  const mockFetch = (async () => {
    return new Response(new Uint8Array(tarBrBytes), {
      status: 200,
      headers: { 'content-length': String(tarBrBytes.length) }
    })
  }) as unknown as typeof fetch

  const installedDir = await downloadAndInstallPackage('antimage', mockEntry, undefined, mockFetch)
  assert.ok(fs.existsSync(installedDir))
  assert.equal(fs.readFileSync(path.join(installedDir, 'models', 'hero.vmdl_c'), 'utf8'), 'MOCK_HERO_MODEL')
  assert.ok(fs.existsSync(path.join(installedDir, '.package_state.json')))
  assert.equal(isPackageReadyLocally('antimage', mockEntry), true)

  const badEntry: AssetPackageEntry = {
    ...mockEntry,
    sha256: '0000000000000000000000000000000000000000000000000000000000000000'
  }
  await assert.rejects(() => downloadAndInstallPackage('antimage', badEntry, undefined, mockFetch), /Integrity check failed/)
})

test('downloadAndInstallPackage retries transient network errors and surfaces underlying cause', async (t) => {
  const tmpBase = fs.mkdtempSync(path.join(os.tmpdir(), 'skinforge-delivery-retry-'))
  const prevCache = process.env.SKINFORGE_ASSET_CACHE
  const prevSource = process.env.SKINFORGE_ASSET_SOURCE
  process.env.SKINFORGE_ASSET_CACHE = tmpBase
  delete process.env.SKINFORGE_ASSET_SOURCE
  t.after(() => {
    if (prevCache === undefined) delete process.env.SKINFORGE_ASSET_CACHE
    else process.env.SKINFORGE_ASSET_CACHE = prevCache
    if (prevSource === undefined) delete process.env.SKINFORGE_ASSET_SOURCE
    else process.env.SKINFORGE_ASSET_SOURCE = prevSource
    fs.rmSync(tmpBase, { recursive: true, force: true })
  })

  const pkgDir = path.join(tmpBase, 'pkg_src')
  fs.mkdirSync(pkgDir, { recursive: true })
  fs.writeFileSync(path.join(pkgDir, 'items_patch.txt'), '"patch" { "key" "val" }')
  const tarBrPath = path.join(tmpBase, 'axe.tar.br')
  await createTarBrotliFromDir(pkgDir, tarBrPath)
  const tarBrBytes = fs.readFileSync(tarBrPath)
  const validSha = crypto.createHash('sha256').update(tarBrBytes).digest('hex')
  const entry: AssetPackageEntry = { file: 'axe.tar.br', version: '1.0.0', sha256: validSha, size: tarBrBytes.length }

  let calls = 0
  const flakyFetch = (async () => {
    calls++
    if (calls < 2) {
      const cause = Object.assign(new Error('getaddrinfo EAI_AGAIN dota2skinforge.space'), { code: 'EAI_AGAIN' })
      throw new TypeError('fetch failed', { cause })
    }
    return new Response(new Uint8Array(tarBrBytes), { status: 200, headers: { 'content-length': String(tarBrBytes.length) } })
  }) as unknown as typeof fetch

  const dir = await downloadAndInstallPackage('axe', entry, undefined, flakyFetch)
  assert.ok(fs.existsSync(dir))
  assert.equal(calls, 2)

  const alwaysFailFetch = (async () => {
    const cause = Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' })
    throw new TypeError('fetch failed', { cause })
  }) as unknown as typeof fetch

  await assert.rejects(() => downloadAndInstallPackage('axe_fail', entry, undefined, alwaysFailFetch), /ECONNREFUSED/)
})
