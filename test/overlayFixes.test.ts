import assert from 'node:assert/strict'
import { test } from 'node:test'
import { getRawHeroEntry } from '../src/shared/armory/armoryCatalog'
import type { CosmeticAssetsManifest } from '../src/main/services/assets/cosmeticAssets'
import type { AppliedPatch } from '../src/main/services/modifier/compile'
import { getString, parseVdf } from '../src/main/services/modifier/vdf'
import { applyItemBlocks, readItemsSection } from '../src/main/services/pipeline/itemsGamePatcher'
import { sameSetOverlaySlots, stripReplacedBodyWearableModel } from '../src/main/services/pipeline/passes/overlayCleanup'

function makeSchema(blocks: Record<string, string>): string {
  const entries = Object.entries(blocks)
    .map(([id, body]) => `\t\t"${id}"\n\t\t{\n${body}\n\t\t}`)
    .join('\n')
  return `"items_game"\n{\n\t"items"\n\t{\n${entries}\n\t}\n}\n`
}

test('stripReplacedBodyWearableModel removes model_player when overlay replaces root body without a patch', () => {
  const schema = makeSchema({
    '639':
      '\t\t\t"name"\t\t"Io\'s Head"\n\t\t\t"model_player"\t\t"models/items/io/io_calavera/io_calavera.vmdl"\n\t\t\t"visuals"\n\t\t\t{\n\t\t\t\t"skip_model_combine"\t\t"1"\n\t\t\t}'
  })
  const applied: AppliedPatch[] = [{ hero: 'wisp', slot: 'head', itemName: 'Altar Ball', targetId: '639', reason: 'requested', style: 0 }]
  const manifest: CosmeticAssetsManifest = {
    items: {
      '23768': {
        name: 'Altar Ball',
        hero: 'wisp',
        group: 'wisp',
        files: [],
        valveCopies: [{ src: 'models/items/io/io_calavera/io_calavera.vmdl_c', dst: 'models/heroes/wisp/wisp.vmdl_c' }]
      }
    }
  }
  const staged = new Map([['models/heroes/wisp/wisp.vmdl_c', { vpkPath: 'models/heroes/wisp/wisp.vmdl_c', source: Buffer.alloc(4) }]])
  const res = stripReplacedBodyWearableModel(schema, applied, [{ hero: 'wisp', slot: 'head', id: 23768 }], manifest, staged)
  assert.deepEqual(res.targets, ['639'])
  const span = readItemsSection(res.content).blocks.get('639')!
  const root = parseVdf(res.content.slice(span.start, span.end)).root
  assert.equal(getString(root, 'model_player'), undefined)
})

test('sameSetOverlaySlots includes same-bundle companion pieces and excludes unrelated picks', () => {
  const manifest: CosmeticAssetsManifest = {
    items: {
      '7756': { name: 'Feast of Abscession', hero: 'pudge', group: 'pudge', patch: 'items_patch.txt', files: [] },
      '9662': { name: 'Phantom Advent', hero: 'spectre', group: 'spectre', patch: 'items_patch.txt', files: [] }
    }
  }
  const slots = sameSetOverlaySlots(
    [
      { hero: 'pudge', slot: 'hero_base', id: 7756 },
      { hero: 'spectre', slot: 'head', id: 9662 }
    ],
    [
      { hero: 'pudge', slot: 'hero_base', id: 7756 },
      { hero: 'pudge', slot: 'back', id: 29687 },
      { hero: 'pudge', slot: 'weapon', id: 4007 },
      { hero: 'spectre', slot: 'head', id: 9662 },
      { hero: 'spectre', slot: 'belt', id: 12314 },
      { hero: 'spectre', slot: 'shoulder', id: 9663 },
      { hero: 'spectre', slot: 'weapon', id: 12312 }
    ],
    manifest
  )
  assert.equal(slots.has('pudge/back'), true)
  assert.equal(slots.has('pudge/weapon'), false)
  assert.equal(slots.has('spectre/belt'), true)
  assert.equal(slots.has('spectre/shoulder'), true)
  assert.equal(slots.has('spectre/weapon'), true)
})

test('sameSetOverlaySlots resolves canonical hero names for aliased armory entries', () => {
  const windrunnerSet = getRawHeroEntry('windrunner')?.sets?.find((s) => s.items.length >= 2)
  assert.ok(windrunnerSet, 'expected a multi-piece windrunner set')
  const [primary, companion] = windrunnerSet.items
  const manifest: CosmeticAssetsManifest = {
    items: {
      [String(primary.id)]: { name: windrunnerSet.name, hero: 'windrunner', group: 'windrunner', patch: 'items_patch.txt', files: [] }
    }
  }
  const slots = sameSetOverlaySlots(
    [{ hero: 'windrunner', slot: primary.slot, id: primary.id }],
    [
      { hero: 'windrunner', slot: primary.slot, id: primary.id },
      { hero: 'windrunner', slot: companion.slot, id: companion.id }
    ],
    manifest
  )
  assert.equal(slots.has(`windrunner/${companion.slot}`), true)
})

test('applyItemBlocks emits valid keyed VDF for newly added item IDs and deduplicates inputs', () => {
  const base = makeSchema({
    '100': '\t\t\t"name"\t\t"Existing"'
  })
  const { text, stats } = applyItemBlocks(
    base,
    [
      ['100', '{\n\t\t\t"name"\t\t"First"\n\t\t}'],
      ['100', '{\n\t\t\t"name"\t\t"Updated"\n\t\t}'],
      ['99999', '{\n\t\t\t"name"\t\t"Brand New"\n\t\t}']
    ],
    { sanitize: false }
  )
  assert.deepEqual(stats.applied, ['100'])
  assert.deepEqual(stats.added, ['99999'])
  const section = readItemsSection(text)
  const existingSpan = section.blocks.get('100')!
  const addedSpan = section.blocks.get('99999')!
  assert.equal(getString(parseVdf(text.slice(existingSpan.start, existingSpan.end)).root, 'name'), 'Updated')
  assert.equal(getString(parseVdf(text.slice(addedSpan.start, addedSpan.end)).root, 'name'), 'Brand New')
})
