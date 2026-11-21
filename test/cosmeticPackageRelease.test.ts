import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { checkPackageEntries, inspectPackageSource, verifyPublishedPackage } from '../scripts/lib/cosmeticPackages'
import { fetchPackageManifest } from '../src/main/services/assets/assetDeliveryService'
import { APP_CONFIG } from '../src/shared/constants/appConfig'
import type { AssetPackageEntry } from '../src/shared/types/assetPackages'

test('source checks catch same-size asset edits and missing overlay files', (t) => {
  const group = fs.mkdtempSync(path.join(os.tmpdir(), 'skinforge-package-source-'))
  t.after(() => fs.rmSync(group, { recursive: true, force: true }))
  const file = path.join(group, 'items_patch.txt')
  const expected = ['items_patch.txt']
  fs.writeFileSync(file, 'old')
  const before = inspectPackageSource(group, expected)
  fs.utimesSync(file, 0, 0)
  assert.deepEqual(inspectPackageSource(group, expected), before)
  fs.writeFileSync(file, 'new')
  assert.notEqual(inspectPackageSource(group, expected).sha256, before.sha256)
  assert.throws(() => inspectPackageSource(group, ['missing.vmdl_c']), /missing files referenced by the overlay/)
})

const payload = Buffer.from('archive bytes')
const sha256 = crypto.createHash('sha256').update(payload).digest('hex')
const archive: AssetPackageEntry = { file: `_global-${sha256}.tar.br`, sha256, sourceSha256: sha256, size: payload.length, version: '1' }

test('release checks reject missing groups, mutable names, and missing or changed CDN objects', async () => {
  const groups = new Map([['_global', new Set<string>()]])
  const manifest = { version: 2, generatedAt: '', packages: { _global: archive } }
  checkPackageEntries(manifest, groups)
  assert.throws(() => checkPackageEntries({ ...manifest, packages: {} }, groups), /Missing: _global/)
  assert.throws(
    () => checkPackageEntries({ ...manifest, packages: { _global: { ...archive, file: '_global.tar.br' } } }, groups),
    /versioned/
  )
  await verifyPublishedPackage(archive, async () => new Response(new Uint8Array(payload)))
  await assert.rejects(
    verifyPublishedPackage(archive, async () => new Response(null, { status: 404 })),
    /HTTP 404/
  )
  await assert.rejects(
    verifyPublishedPackage(archive, async () => new Response('changed bytes')),
    /SHA-256/
  )
})

test('prepared builds use their bundled package manifest without fetching the legacy manifest', async (t) => {
  const resources = fs.mkdtempSync(path.join(os.tmpdir(), 'skinforge-package-resources-'))
  const original = Object.getOwnPropertyDescriptor(process, 'resourcesPath')
  t.after(() => {
    if (original) Object.defineProperty(process, 'resourcesPath', original)
    else Reflect.deleteProperty(process, 'resourcesPath')
    fs.rmSync(resources, { recursive: true, force: true })
  })
  Object.defineProperty(process, 'resourcesPath', { configurable: true, value: resources })
  const manifest = { version: 2, generatedAt: '', appVersion: APP_CONFIG.version, packages: { _global: archive } }
  fs.mkdirSync(path.join(resources, 'data'))
  fs.writeFileSync(path.join(resources, 'data', 'cosmetic-packages.json'), JSON.stringify(manifest))
  const network = t.mock.fn(async () => new Response(null, { status: 404 }))
  assert.deepEqual(await fetchPackageManifest(network), manifest)
  assert.equal(network.mock.callCount(), 0)
})
