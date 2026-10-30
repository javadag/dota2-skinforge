/**
 * Selection pipeline test: compile slot picks into an items_game-only pack.
 *
 *   npx tsx scripts/build_selection_test.ts --pick "legion commander|head|Baneful Devotion"
 *   npx tsx scripts/build_selection_test.ts --pick "zeus|head|Arc of the Sovereign Head" --install
 */

import fs from 'fs'
import path from 'path'

import { detectDotaPath } from '../src/main/services/dotaPathService'
import * as pipeline from '../src/main/services/pipelineService'
import * as packService from '../src/main/services/packService'
import * as vpk from '../src/main/services/vpkService'

function arg(name: string, fallback?: string): string | undefined {
  const index = process.argv.indexOf(name)
  if (index !== -1 && process.argv[index + 1] && !process.argv[index + 1].startsWith('--')) {
    return process.argv[index + 1]
  }
  return fallback
}

function argAll(name: string): string[] {
  const out: string[] = []
  for (let i = 0; i < process.argv.length; i++) {
    if (process.argv[i] === name && process.argv[i + 1]) out.push(process.argv[i + 1])
  }
  return out
}

const mb = (bytes: number): string => `${(bytes / 1e6).toFixed(2)} MB`

async function main(): Promise<void> {
  const dotaDir = arg('--dota') ?? detectDotaPath()
  if (!dotaDir) throw new Error('Could not detect the Dota 2 install; pass --dota <dir>.')
  const outDir = path.resolve(arg('--out', 'scratch/test_selection')!)
  const install = process.argv.includes('--install')

  const picks = argAll('--pick').map((raw) => {
    const [hero, slot, item] = raw.split('|')
    if (!hero || !slot || !item) throw new Error(`--pick needs "hero|slot|item", got "${raw}"`)
    return { hero: hero.trim(), slot: slot.trim(), item: item.trim() }
  })
  if (!picks.length) throw new Error('Pass at least one --pick "hero|slot|item".')

  console.log(`dota   ${dotaDir}`)
  console.log(`out    ${outDir}`)
  console.log(`picks  ${picks.length}`)

  const started = Date.now()
  const pack = await pipeline.buildSelectionPack({ dotaGameDir: dotaDir, picks, outDir }, (p) =>
    console.log(`  [${p.step}/${p.total}] ${p.message}`)
  )

  console.log('')
  for (const a of pack.report.applied) {
    console.log(`  ${a.hero}/${a.slot}: ${a.itemName} -> item ${a.targetId} (${a.reason})`)
  }
  for (const s of pack.report.skipped) console.log(`  skipped ${s.hero}/${s.slot}: ${s.reason}`)
  for (const w of pack.report.warnings) console.log(`  warning ${w}`)
  for (const o of pack.report.overlays) {
    console.log(`  overlay ${o.name} (${o.id}) -> ${o.hero}`)
  }

  console.log('')
  console.log(`items  ${pack.patchBlocks} overrides, ${pack.report.itemsTouched} items touched, ${mb(pack.itemsGameBytes)}`)
  if (pack.report.modelOverrides) console.log(`models ${pack.report.modelOverrides} arcana/persona root models copied`)
  if (pack.report.overlayFiles) {
    console.log(`assets ${pack.report.overlayFiles} files / ${mb(pack.report.overlayBytes)} from arcana overlays`)
  }
  console.log(`vpk    ${pack.dirVpk}`)
  console.log(`       ${mb(pack.packBytes)}`)

  const listing = (await vpk.list(pack.dirVpk)) as unknown as { ok?: boolean; count?: number; totalBytes?: number }
  if (!listing || listing.ok === false) throw new Error('Built VPK is not readable by vpktool.')
  console.log(`verify ${listing.count} entries / ${mb(listing.totalBytes ?? 0)}`)

  const out = path.resolve('scratch', 'selection_items_game.txt')
  await vpk.extract(pack.dirVpk, 'scripts/items/items_game.txt', out)
  const packedText = fs.readFileSync(out, 'utf-8')

  const basePath = path.resolve('scratch', 'valve_items_game.txt')
  const problems: string[] = []
  if (fs.existsSync(basePath)) {
    const baseText = fs.readFileSync(basePath, 'utf-8')
    const baseBlocks = packService.readItemsSection(baseText).blocks
    const packedBlocks = packService.readItemsSection(packedText).blocks
    let changed = 0
    for (const [id] of packedBlocks) {
      const a = baseBlocks.get(id)
      const b = packedBlocks.get(id)
      if (!a || !b) continue
      const same = baseText.slice(a.start, a.end) === packedText.slice(b.start, b.end)
      if (!same) changed++
    }
    console.log(`verify ${changed} item blocks differ from Valve`)
    if (changed > pack.patchBlocks) problems.push(`${changed} blocks changed but only ${pack.patchBlocks} overrides`)
  }

  const appliedTargets = new Set(pack.report.applied.map((a) => a.targetId))
  for (const id of appliedTargets) {
    if (!packedText.includes(`"${id}"`)) problems.push(`target ${id} missing from packed schema`)
  }

  console.log(`elapsed ${((Date.now() - started) / 1000).toFixed(1)}s`)

  if (problems.length) {
    console.error('\nFAILED:')
    for (const p of problems) console.error(`  - ${p}`)
    process.exit(1)
  }
  console.log('\nOK')

  if (install) {
    console.log('\ninstalling...')
    const result = await pipeline.installPack(dotaDir, pack, (p) => console.log(`  [${p.step}/${p.total}] ${p.message}`))
    if (!result.success) {
      console.error(`install failed: ${result.error}`)
      process.exit(1)
    }
    console.log(`installed ${result.patchedCount} overrides -> ${pipeline.MOD_FOLDER_NAME}`)
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
