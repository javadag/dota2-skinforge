/**
 * Item asset receipt (CLI).
 *
 *   tsx scripts/item_assets.ts --item 7247        one item, file by file
 *   tsx scripts/item_assets.ts --item 7247 --json
 *   tsx scripts/item_assets.ts --all              every overlay cosmetic, totals
 *   tsx scripts/item_assets.ts --scan             every catalog item, what it carries
 *
 * The walk itself lives in `src/main/services/assetReceipt.ts` so the app and this script
 * always agree on what an item needs.
 */

import fs from 'fs'
import path from 'path'

import { detectDotaPath } from '../src/main/services/dotaPathService'
import { receiptFor, type AssetReceipt } from '../src/main/services/assetReceipt'
import { readItemsSection } from '../src/main/services/packService'
import { buildSchema } from '../src/main/services/modifier/schema'
import { baseModelForHero } from '../src/main/services/modifier/heroBaseModels'
import { loadIndex, readEntry } from '../src/main/services/vpkIndex'

function arg(name: string, fallback?: string): string | undefined {
  const i = process.argv.indexOf(name)
  if (i !== -1 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--')) return process.argv[i + 1]
  return fallback
}
const flag = (name: string): boolean => process.argv.includes(name)

const dotaDir = arg('--dota') ?? detectDotaPath()
if (!dotaDir) throw new Error('Dota 2 not detected; pass --dota <dir>.')
const vpk = arg('--vpk') ?? path.join(dotaDir, 'dota', 'pak01_dir.vpk')

const index = loadIndex(vpk)
const cache = new Map<string, Buffer | null>()
const options = { index, cache }

function printReceipt(r: AssetReceipt): void {
  console.log(`\n${r.item.id}  ${r.item.name}   (${r.item.hero} / ${r.item.slot})`)
  console.log(`   delivery: ${r.kind}`)
  if (r.kind === 'prepared') {
    console.log('   NOTE: swaps the hero body. A copied file will not animate — this needs an')
    console.log('         authored model (mesh merged onto the hero skeleton, own animations).')
  }
  console.log(`   lands on block ${r.target.id} "${r.target.name}"`)
  console.log(`   ${r.files.length} files`)
  for (const f of r.files) {
    const status = f.source ? 'ok     ' : 'MISSING'
    const dest = f.dest === f.source ? f.dest : `${f.dest}  <-  ${f.source ?? '(not found)'}`
    console.log(`   ${status} ${f.kind.padEnd(9)} ${dest}`)
  }
  if (r.spawns.length) {
    console.log(`   spawns (no vanilla file to replace): ${r.spawns.length}`)
    for (const s of r.spawns) console.log(`      ${s.present ? 'ok     ' : 'MISSING'} ${s.modifier}`)
  }
  if (r.missing.length) console.log(`   ${r.missing.length} unresolved`)
}

/**
 * Walk every catalog item once and count what it actually carries: a model, particles,
 * spawns, sounds, model rewrites. Text only — no file reads — so it finishes in seconds.
 */
function scanCatalog(schemaText: string): void {
  const spans = readItemsSection(schemaText).blocks
  const ids = new Set<string>()
  for (const file of ['heroes_armory.json', 'other_armory.json']) {
    const catalog = JSON.parse(fs.readFileSync(path.join('data', file), 'utf-8')) as Record<
      string,
      { slots?: Array<{ mods?: Array<{ id?: number }> }> }
    >
    for (const entry of Object.values(catalog)) {
      for (const slot of entry.slots ?? []) for (const mod of slot.mods ?? []) if (mod.id) ids.add(String(mod.id))
    }
  }

  const PARTICLE = new Set(['particle', 'particle_create', 'particle_combined', 'particle_control_point', 'particle_snapshot'])
  const REWRITE = new Set(['model', 'entity_model', 'model_skin', 'hero_model_change'])

  const totals: Record<string, number> = {}
  let items = 0
  let withModel = 0
  let modelOnly = 0
  let withParticles = 0
  let withSpawns = 0
  let withSounds = 0
  let withRewrites = 0
  const spawnExamples: string[] = []

  for (const id of ids) {
    const span = spans.get(id)
    if (!span) continue
    const block = schemaText.slice(span.start, span.end)
    items++
    const types = [...block.matchAll(/"type"\s+"([^"]+)"/g)].map((m) => m[1])
    const name = block.match(/"name"\s+"([^"]*)"/)?.[1] ?? id
    const hasModel = /"model_player"/.test(block)
    if (hasModel) withModel++

    const particles = types.filter((t) => PARTICLE.has(t))
    const rewrites = types.filter((t) => REWRITE.has(t))
    const sounds = types.filter((t) => t === 'sound')

    for (const t of types) totals[t] = (totals[t] ?? 0) + 1
    if (particles.length) withParticles++
    if (particles.includes('particle_create')) {
      withSpawns++
      if (spawnExamples.length < 5) spawnExamples.push(`${id} ${name}`)
    }
    if (sounds.length) withSounds++
    if (rewrites.length) withRewrites++
    if (hasModel && particles.length === 0 && sounds.length === 0 && rewrites.length === 0) modelOnly++
  }

  console.log(`catalog items found in items_game: ${items}`)
  console.log(`  plain model, nothing else : ${modelOnly}  (${Math.round((modelOnly / items) * 100)}%)`)
  console.log(`  carries particles         : ${withParticles}`)
  console.log(`  carries a spawn effect    : ${withSpawns}`)
  console.log(`  carries sounds            : ${withSounds}`)
  console.log(`  rewrites a model          : ${withRewrites}`)
  console.log(`  has no model at all       : ${items - withModel}`)
  console.log('\ntop entry kinds:')
  for (const [t, n] of Object.entries(totals)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 14)) {
    console.log(`  ${t.padEnd(28)} ${n}`)
  }
  console.log('\nexamples carrying a spawn effect:')
  for (const e of spawnExamples) console.log('  ' + e)
}

/**
 * Every catalog item that swaps the hero's whole body, i.e. the ones that need an authored
 * model rather than a copied file. Text-only pass — same rule the receipt uses, but it does
 * not walk any files, so it can cover the whole catalog in a second.
 */
function listPrepared(schemaText: string): void {
  const spans = readItemsSection(schemaText).blocks
  const ids = new Map<string, string>()
  for (const file of ['heroes_armory.json', 'other_armory.json']) {
    const catalog = JSON.parse(fs.readFileSync(path.join('data', file), 'utf-8')) as Record<
      string,
      { slots?: Array<{ mods?: Array<{ id?: number; name?: string }> }> }
    >
    for (const entry of Object.values(catalog)) {
      for (const slot of entry.slots ?? []) for (const mod of slot.mods ?? []) if (mod.id) ids.set(String(mod.id), mod.name ?? '')
    }
  }

  const rows: string[] = []
  let swap = 0
  let data = 0
  for (const [id, name] of ids) {
    const span = spans.get(id)
    if (!span) continue
    const block = schemaText.slice(span.start, span.end)
    const hero = block.match(/"used_by_heroes"\s*\{[^}]*?"npc_dota_hero_([a-z_]+)"/)?.[1]
    const model = block.match(/"model_player"\s+"([^"]+)"/)?.[1]
    const slot = block.match(/"item_slot"\s+"([^"]+)"/)?.[1]
    const body = hero
      ? [...block.matchAll(/"type"\s+"entity_model"\s*\n?\s*"asset"\s+"([^"]+)"[\s\S]{0,200}?"modifier"\s+"([^"]+)"/g)]
          .filter((m) => m[1] === `npc_dota_hero_${hero}`)
          .map((m) => m[2])
          .find((m) => m !== baseModelForHero(hero))
      : undefined
    // A `hero_base` item that switches a model skin still needs an authored model: the skin
    // picks a mesh variant, but the arcana's animations and weapon are not in the game's
    // base model.
    const baseSkin = slot === 'hero_base' && /"type"\s+"model_skin"/.test(block)

    if (body || baseSkin)
      rows.push(`${id.padEnd(6)} ${(hero ?? '').padEnd(16)} ${name.padEnd(44)} ${body ?? '(model skin on the base model)'}`)
    else if (model) swap++
    else data++
  }

  console.log(`catalog: ${swap} swap, ${rows.length} prepared, ${data} data-only\n`)
  console.log('needs an authored model (body swap):')
  for (const line of rows.sort((a, b) => a.slice(7, 23).localeCompare(b.slice(7, 23)))) console.log('  ' + line)
}

function main(): void {
  const schemaBytes = readEntry(index, 'scripts/items/items_game.txt')
  if (!schemaBytes) throw new Error('items_game.txt not found in the archive')
  const schemaText = schemaBytes.toString('utf-8')
  const schema = buildSchema(schemaText)

  if (flag('--scan')) {
    scanCatalog(schemaText)
    return
  }

  if (flag('--prepared')) {
    listPrepared(schemaText)
    return
  }

  const one = arg('--item')
  if (one) {
    const r = receiptFor(schemaText, one, options, schema)
    if (!r) throw new Error(`item ${one} not in items_game`)
    if (flag('--json')) console.log(JSON.stringify(r, null, 2))
    else printReceipt(r)
    return
  }

  if (!flag('--all')) throw new Error('Pass --item <id>, --all or --scan.')

  const catalog = JSON.parse(fs.readFileSync(path.join('data', 'cosmetic-assets.json'), 'utf-8')) as {
    items: Record<string, { name: string }>
  }
  let checked = 0
  let totalFiles = 0
  let totalMissing = 0
  let totalSpawns = 0
  const bad: string[] = []

  for (const id of Object.keys(catalog.items)) {
    const r = receiptFor(schemaText, id, options, schema)
    if (!r) continue
    checked++
    totalFiles += r.files.length
    totalMissing += r.missing.length
    totalSpawns += r.spawns.length
    if (r.missing.length) bad.push(`${r.item.name}: ${r.missing.slice(0, 3).join(', ')}${r.missing.length > 3 ? ' ...' : ''}`)
  }

  console.log(`checked ${checked} cosmetics`)
  console.log(`  files they actually need : ${totalFiles}`)
  console.log(`  spawn effects (no vanilla file to replace) : ${totalSpawns}`)
  console.log(`  unresolved files : ${totalMissing}`)
  if (bad.length) {
    console.log('\nitems with unresolved files:')
    for (const line of bad) console.log('  ' + line)
  }
}

main()
