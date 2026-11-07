import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'fs'
import os from 'os'
import path from 'path'

import { applyOverlay, clearManifestCache, type CosmeticAssetsManifest } from '../src/main/services/cosmeticAssets'
import type { VpkIndex } from '../src/main/services/vpkIndex'

test('applyOverlay stages globalFiles, base files, aliases, valveCopies, and active companion refits', () => {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'skinforge-overlay-test-'))
  const bundleDir = path.join(tmpRoot, 'bundle')
  const stagingDir = path.join(tmpRoot, 'staging')
  const fakeVpkChunk = path.join(tmpRoot, 'pak01_000.vpk')

  try {
    // 1. Create fake Valve VPK chunk containing a known buffer
    const valveBytes = Buffer.from('VALVE_DEFAULT_PERSONA_HAIR')
    fs.writeFileSync(fakeVpkChunk, valveBytes)
    const fakeIndex: VpkIndex = {
      dir: tmpRoot,
      entries: new Map([
        ['models/heroes/antimage_female/hair.vmdl_c', { archive: 0, offset: 0, length: valveBytes.length, preload: Buffer.alloc(0) }]
      ])
    }

    // 2. Create bundle _global and antimage group files
    const logoDir = path.join(bundleDir, '_global', 'kisilev_ind', 'particles', 'logo')
    fs.mkdirSync(logoDir, { recursive: true })
    fs.writeFileSync(path.join(logoDir, 'logo.vpcf_c'), 'NULL_LOGO_PCF')

    const groupDir = path.join(bundleDir, 'antimage')
    fs.mkdirSync(path.join(groupDir, 'models', 'heroes', 'antimage'), { recursive: true })
    fs.writeFileSync(path.join(groupDir, 'models', 'heroes', 'antimage', 'antimage.vmdl_c'), 'BASE_PERSONA_MODEL')

    fs.mkdirSync(path.join(groupDir, 'kisilev_ind', 'models', 'manta'), { recursive: true })
    fs.writeFileSync(path.join(groupDir, 'kisilev_ind', 'models', 'manta', 'manta_l.vmdl_c'), 'REFIT_MANTA_MODEL')

    const patchContent = [
      '"items_game"',
      '{',
      '\t"items"',
      '\t{',
      '\t\t"13784"',
      '\t\t{',
      '\t\t\t"name"\t"Anti-Mage\'s Persona"',
      '\t\t}',
      '\t\t"1"',
      '\t\t{',
      '\t\t\t"name"\t"Anti-Mage\'s Glaive"',
      '\t\t}',
      '\t\t"9999"',
      '\t\t{',
      '\t\t\t"name"\t"Unselected Refit Block"',
      '\t\t}',
      '\t}',
      '}',
      ''
    ].join('\n')
    fs.writeFileSync(path.join(groupDir, 'items_patch.txt'), patchContent, 'utf-8')

    // 3. Configure manifest
    const manifest: CosmeticAssetsManifest = {
      $comment: 'test manifest',
      sourceDir: bundleDir,
      globalFiles: ['kisilev_ind/particles/logo/logo.vpcf_c'],
      items: {
        '13783': {
          name: "The Disciple's Path",
          hero: 'antimage',
          group: 'antimage',
          patch: 'items_patch.txt',
          basePatchIds: ['13784'],
          files: ['models/heroes/antimage/antimage.vmdl_c'],
          aliases: [
            {
              src: 'models/heroes/antimage/antimage.vmdl_c',
              dst: 'models/heroes/antimage/antimage_persona_kisilev_ind/antimage_female_kisilev_ind.vmdl_c'
            }
          ],
          valveCopies: [
            {
              src: 'models/heroes/antimage_female/hair.vmdl_c',
              dst: 'models/heroes/antimage/antimage_head.vmdl_c'
            }
          ],
          refits: {
            '5396': {
              name: 'Arc of Manta',
              slot: 'weapon',
              files: ['kisilev_ind/models/manta/manta_l.vmdl_c'],
              aliases: [
                {
                  src: 'kisilev_ind/models/manta/manta_l.vmdl_c',
                  dst: 'models/heroes/antimage/antimage_weapon.vmdl_c'
                }
              ],
              patchIds: ['1']
            },
            '23780': {
              name: 'Mohawk of the Spectral Hunter',
              slot: 'head',
              files: [],
              patchIds: ['9999']
            }
          }
        }
      }
    }

    // Point SKINFORGE_ASSET_SOURCE at bundleDir and supply manifest override
    process.env.SKINFORGE_ASSET_SOURCE = bundleDir
    clearManifestCache()

    // Case A: Only base Persona picked (13783)
    const resBase = applyOverlay([13783], stagingDir, { manifest, vpkIndex: fakeIndex })
    assert.equal(resBase.missing.length, 0)
    assert.equal(fs.readFileSync(path.join(stagingDir, 'kisilev_ind/particles/logo/logo.vpcf_c'), 'utf-8'), 'NULL_LOGO_PCF')
    assert.equal(fs.readFileSync(path.join(stagingDir, 'models/heroes/antimage/antimage.vmdl_c'), 'utf-8'), 'BASE_PERSONA_MODEL')
    assert.equal(
      fs.readFileSync(
        path.join(stagingDir, 'models/heroes/antimage/antimage_persona_kisilev_ind/antimage_female_kisilev_ind.vmdl_c'),
        'utf-8'
      ),
      'BASE_PERSONA_MODEL'
    )
    assert.equal(
      fs.readFileSync(path.join(stagingDir, 'models/heroes/antimage/antimage_head.vmdl_c'), 'utf-8'),
      'VALVE_DEFAULT_PERSONA_HAIR'
    )
    assert.equal(fs.existsSync(path.join(stagingDir, 'models/heroes/antimage/antimage_weapon.vmdl_c')), false)
    assert.equal(resBase.refitSlots.size, 0)
    assert.deepEqual([...(resBase.patches[0]?.onlyIds ?? [])], ['13784'])

    // Case B: Base Persona (13783) + Companion Refit (5396 Arc of Manta) picked
    const stagingDir2 = path.join(tmpRoot, 'staging2')
    const resRefit = applyOverlay([13783, 5396], stagingDir2, { manifest, vpkIndex: fakeIndex })
    assert.equal(resRefit.missing.length, 0)
    assert.equal(fs.readFileSync(path.join(stagingDir2, 'models/heroes/antimage/antimage_weapon.vmdl_c'), 'utf-8'), 'REFIT_MANTA_MODEL')
    assert.equal(resRefit.refitSlots.has('antimage/weapon'), true)
    assert.deepEqual([...(resRefit.patches[0]?.onlyIds ?? [])].sort(), ['1', '13784'])
  } finally {
    delete process.env.SKINFORGE_ASSET_SOURCE
    clearManifestCache()
    fs.rmSync(tmpRoot, { recursive: true, force: true })
  }
})
