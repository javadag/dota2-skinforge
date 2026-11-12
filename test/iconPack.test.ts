import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { collectIconKeys, normalizeIconPath } from '../src/shared/armory/iconKeys'
import { createTarBrotliFromDir, extractTarBrotliSafely } from '../src/main/services/tarUtils'

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

test('every referenced data icon resolves to itself as a pack key', () => {
  const root = path.resolve(__dirname, '..')
  const keys = new Set<string>()
  for (const file of ['heroes_armory.json', 'other_armory.json', 'itemStyles.json']) {
    collectIconKeys(JSON.parse(fs.readFileSync(path.join(root, 'data', file), 'utf8')), keys)
  }
  assert.ok(keys.size > 10000, `expected a large icon set, got ${keys.size}`)
  for (const key of keys) {
    assert.equal(normalizeIconPath(`skinforge-icon://${key}.webp`), `${key}.webp`, `pack key mismatch for ${key}`)
  }
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
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true })
  }
})
