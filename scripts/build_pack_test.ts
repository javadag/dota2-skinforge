/**
 * Pipeline smoke test: build a mod pack from a bundle folder without touching the game.
 *
 *   npx tsx scripts/build_pack_test.ts --bundle D:\changer_changed --heroes zeus,nerubian_assassin
 *   npx tsx scripts/build_pack_test.ts --bundle D:\changer_changed --extract-valve --heroes zeus
 *   npx tsx scripts/build_pack_test.ts --bundle D:\changer_changed --install
 *
 * Exit code is non-zero when the pack fails verification.
 */

import fs from 'fs'
import path from 'path'

import { detectDotaPath } from '../src/main/services/dotaPathService'
import * as packService from '../src/main/services/packService'
import * as pipeline from '../src/main/services/pipelineService'
import * as vpk from '../src/main/services/vpkService'

function arg(name: string, fallback?: string): string | undefined {
  const index = process.argv.indexOf(name)
  if (index !== -1 && process.argv[index + 1] && !process.argv[index + 1].startsWith('--')) {
    return process.argv[index + 1]
  }
  return fallback
}

function flag(name: string): boolean {
  return process.argv.includes(name)
}

const mb = (bytes: number): string => `${(bytes / 1e6).toFixed(2)} MB`

function blockText(text: string, id: string): string | null {
  const section = packService.readItemsSection(text)
  const span = section.blocks.get(id)
  return span ? text.slice(span.start, span.end) : null
}

async function extractValveItemsGame(dotaDir: string): Promise<string> {
  const out = path.resolve('scratch', 'valve_items_game.txt')
  fs.mkdirSync(path.dirname(out), { recursive: true })
  const dotaVpk = path.join(dotaDir, 'dota', 'pak01_dir.vpk')
  if (!fs.existsSync(dotaVpk)) throw new Error(`Valve pak01_dir.vpk not found at ${dotaVpk}`)
  console.log(`extracting ${path.basename(dotaVpk)} -> ${out}`)
  const result = await vpk.extract(dotaVpk, 'scripts/items/items_game.txt', out)
  if (typeof result === 'object' && 'ok' in result && !result.ok) {
    throw new Error(`vpktool extract failed: ${JSON.stringify(result)}`)
  }
  console.log(`  ${mb(fs.statSync(out).size)}`)
  return out
}

async function main(): Promise<void> {
  const dotaDir = arg('--dota') ?? detectDotaPath()
  const bundleDir = arg('--bundle', 'D:\\changer_changed')!
  const outDir = path.resolve(arg('--out', 'scratch/test_pack')!)
  const heroesArg = arg('--heroes')
  const heroes = heroesArg
    ? heroesArg
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
    : undefined
  const install = flag('--install')

  if (!dotaDir) throw new Error('Could not detect the Dota 2 install; pass --dota <dir>.')
  console.log(`dota      ${dotaDir}`)
  console.log(`bundle    ${bundleDir}`)
  console.log(`out       ${outDir}`)
  if (heroes) console.log(`groups    ${heroes.join(', ')}`)

  // A subset must be merged onto a clean Valve schema, otherwise it inherits every
  // override the bundle's own items_game.txt carries.
  let baseItemsGame = arg('--base-items')
  if (!baseItemsGame && (flag('--extract-valve') || heroes)) {
    baseItemsGame = await extractValveItemsGame(dotaDir)
  }
  if (baseItemsGame) console.log(`base      ${baseItemsGame}`)
  else console.log('base      bundle items_game.txt')

  const started = Date.now()
  const pack = await pipeline.buildPack({ bundleDir, includeGroups: heroes, outDir, baseItemsGame }, (p) =>
    console.log(`  [${p.step}/${p.total}] ${p.message}`)
  )

  console.log('')
  console.log(`staged    ${pack.files} files / ${mb(pack.bytes)}`)
  console.log(`items     ${pack.patchBlocks} blocks patched, items_game ${mb(pack.itemsGameBytes)}`)
  console.log(`watermark ${pack.merge.removedWatermark} removed, advert ${pack.merge.removedAdvert} removed`)
  if (pack.referencedBranding) {
    console.log(`branding  ${pack.referencedBranding} file(s) pulled in because the schema references them`)
  }
  console.log(`vpk       ${pack.dirVpk}`)
  console.log(`          ${mb(pack.packBytes)} total`)

  // --- verification -----------------------------------------------------------
  const listing = (await vpk.list(pack.dirVpk)) as unknown as {
    ok?: boolean
    count?: number
    totalBytes?: number
    entries?: Array<{ path: string; len: number }>
  }
  if (!listing || listing.ok === false) throw new Error('Built VPK is not readable by vpktool.')
  console.log(`verify    vpktool lists ${listing.count} entries / ${mb(listing.totalBytes ?? 0)}`)

  const expectedEntries = pack.files + 1 // assets + merged items_game.txt
  if (listing.count !== expectedEntries) {
    console.log(`  note: expected ${expectedEntries} entries (${pack.files} assets + items_game)`)
  }
  const packed = new Set((listing.entries ?? []).map((e) => e.path.toLowerCase()))

  const unpacked = path.resolve('scratch', 'packed_items_game.txt')
  await vpk.extract(pack.dirVpk, 'scripts/items/items_game.txt', unpacked)
  fs.mkdirSync(path.dirname(unpacked), { recursive: true })
  const packedText = fs.readFileSync(unpacked, 'utf-8')

  const problems: string[] = []
  if (/aghebati/i.test(packedText)) problems.push('account watermark still present')
  if (packedText.length < 1_000_000) problems.push('items_game looks truncated')

  if (baseItemsGame) {
    const baseText = fs.readFileSync(baseItemsGame, 'utf-8')
    const bundle = packService.readBundle(bundleDir)
    const selected = heroes ? bundle.groups.filter((g) => heroes.includes(g.name)) : bundle.groups
    let checked = 0
    for (const group of selected) {
      for (const id of group.itemIds) {
        const after = blockText(packedText, id)
        if (!after) {
          problems.push(`item ${id} (${group.name}) missing from packed items_game`)
          continue
        }
        const before = blockText(baseText, id)
        if (before === after) problems.push(`item ${id} (${group.name}) was not changed`)
        checked++
      }
    }
    console.log(`verify    ${checked} item blocks differ from the base schema`)

    // Assets the patched blocks ask for but the pack does not contain.
    const ids = new Set(selected.flatMap((g) => g.itemIds))
    const dangling: string[] = []
    const external: string[] = []
    for (const id of ids) {
      const block = blockText(packedText, id)
      if (!block) continue
      for (const match of block.matchAll(/"model_player"\s+"([^"]+)"/g)) {
        const ref = match[1]
        if (packed.has(`${ref}_c`.toLowerCase()) || packed.has(ref.toLowerCase())) continue
        if (/^(kisilev_ind|dota2changer_com|materials1)\//i.test(ref)) dangling.push(`${id}: ${ref}`)
        else external.push(ref)
      }
    }
    if (dangling.length) {
      console.log(`  dangling bundle-owned refs (${dangling.length}):`)
      for (const d of dangling.slice(0, 10)) console.log(`    - ${d}`)
    }
    if (external.length) console.log(`  ${external.length} model refs resolved from Valve, not from the pack`)
  }

  console.log(`elapsed   ${((Date.now() - started) / 1000).toFixed(1)}s`)

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
    console.log(`installed ${result.patchedCount} blocks -> ${pipeline.MOD_FOLDER_NAME}`)
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
