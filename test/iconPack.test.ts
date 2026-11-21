import test from 'node:test'
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { collectIconKeys, getIconFallback, normalizeIconPath } from '../src/shared/armory/iconKeys'
import { createTarBrotliFromDir, extractTarBrotliSafely } from '../src/main/services/assets/archiveUtils'
import { installIconPack, readIconPackManifest } from '../src/main/services/assets/iconPackService'

test('collectIconKeys collects only icon paths the protocol serves', () => {
  const keys = collectIconKeys({
    heroes: {
      antimage: {
        items: { weapon: [{ img: 'econ/items/antimage/weapon' }] },
        slots: [{ slot: 'weapon', empty_img: 'econ/heroes/antimage/weapon' }],
        sets: [{ img: 'loadingscreens/set_screen' }],
        categories: [{ img: '../assets/categories/wards.svg' }]
      }
    }
  })
  assert.deepEqual([...keys].sort(), ['econ/heroes/antimage/weapon', 'econ/items/antimage/weapon', 'loadingscreens/set_screen'])
})

test('collectIconKeys dedupes and preserves case', () => {
  const keys = collectIconKeys([
    { img: 'econ/huds/hud_Dreamleague' },
    { img: 'econ/huds/hud_Dreamleague' },
    { img: 'econ/huds/hud_Dreamleague.png' }
  ])
  assert.equal(keys.size, 1)
  assert.ok(keys.has('econ/huds/hud_Dreamleague'))
})

test('the bundled archive covers the icon catalog with files or deliberate local fallbacks', async (t) => {
  const root = path.resolve(__dirname, '..')
  const keys = new Set<string>()
  for (const file of ['heroes_armory.json', 'other_armory.json', 'itemStyles.json']) {
    collectIconKeys(JSON.parse(fs.readFileSync(path.join(root, 'data', file), 'utf8')), keys)
  }
  assert.ok(keys.size > 10000, `expected a large icon set, got ${keys.size}`)
  const manifest = readIconPackManifest(path.join(root, 'assets', 'icon-pack.json'))
  const hash = crypto
    .createHash('sha256')
    .update([...keys].sort().join('\n'))
    .digest('hex')
  assert.equal(hash, manifest.catalogHash)

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sf-bundled-icons-'))
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true }))
  const target = path.join(tmp, 'icon_pack')
  await installIconPack(path.join(root, 'assets', 'icon-pack.tar.br'), target, manifest)
  for (const key of keys) {
    assert.equal(normalizeIconPath(`skinforge-icon://${key}.webp`), `${key}.webp`, `pack key mismatch for ${key}`)
    if (fs.existsSync(path.join(target, `${key}.webp`))) continue
    const fallback = getIconFallback(key)
    assert.notEqual(fallback, undefined, `uncovered icon: ${key}`)
    if (fallback) assert.ok(fs.existsSync(path.join(target, `${fallback}.webp`)), `missing fallback for ${key}`)
  }
})

test('the icon protocol accepts only local icon keys', () => {
  assert.equal(normalizeIconPath('skinforge-icon://econ/items/icon.PNG?version=1'), 'econ/items/icon.webp')
  assert.equal(normalizeIconPath('skinforge-icon://econ/items/../icon.webp'), null)
  assert.equal(normalizeIconPath('skinforge-icon://econ/items/%2e%2e/icon.webp'), null)
  assert.equal(normalizeIconPath('skinforge-icon://econ/items\\icon.webp'), null)
  assert.equal(normalizeIconPath('skinforge-icon://econ/C:/icon.webp'), null)
  assert.equal(normalizeIconPath('skinforge-icon://econ/items/CON.webp'), null)
  assert.equal(normalizeIconPath('https://econ/items/icon.webp'), null)
})

test('icon pack survives a tar.br round trip', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sf-icon-pack-'))
  try {
    const source = path.join(tmp, 'source')
    const target = path.join(tmp, 'target')
    const key = 'econ/items/antimage/weapon.webp'
    fs.mkdirSync(path.dirname(path.join(source, key)), { recursive: true })
    const payload = Buffer.from('fake-webp-bytes')
    fs.writeFileSync(path.join(source, key), payload)

    const pack = path.join(tmp, 'icon-pack.tar.br')
    const { fileCount } = await createTarBrotliFromDir(source, pack, 4)
    assert.equal(fileCount, 1)

    const { fileCount: extracted } = await extractTarBrotliSafely(pack, target)
    assert.equal(extracted, 1)
    assert.deepEqual(fs.readFileSync(path.join(target, key)), payload)

    const sha256 = crypto.createHash('sha256').update(fs.readFileSync(pack)).digest('hex')
    const manifest = { sha256, catalogHash: sha256, count: 1, bytes: payload.length, px: 192, quality: 78 }
    const installed = path.join(tmp, 'installed')
    await assert.rejects(installIconPack(pack, installed, { ...manifest, sha256: '0'.repeat(64) }), /checksum mismatch/)
    await assert.rejects(installIconPack(pack, installed, { ...manifest, bytes: 1 }), /Incomplete/)
    assert.equal(fs.existsSync(installed), false)
    await installIconPack(pack, installed, manifest)
    assert.deepEqual(fs.readFileSync(path.join(installed, key)), payload)
    assert.equal(fs.readFileSync(path.join(installed, '.version'), 'utf8'), sha256)
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true })
  }
})
