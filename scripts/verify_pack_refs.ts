/**
 * Verify every model / particle / material referenced by a pack's changed
 * items_game blocks actually exists in Valve's VPK.
 *
 * A dangling model reference renders fine on first spawn but fails on a full
 * reload — the classic first-load-OK / reconnect-ERROR pattern. This finds it
 * before the pack ever reaches the game.
 *
 *   npx tsx scripts/verify_pack_refs.ts --items <packed items_game> [--base <valve items_game>] [--vpk <valve pak>]
 */

import fs from 'fs'
import path from 'path'
import { execFileSync } from 'child_process'

import { detectDotaPath } from '../src/main/services/dotaPathService'
import { readItemsSection } from '../src/main/services/packService'

function arg(name: string, fallback?: string): string | undefined {
  const i = process.argv.indexOf(name)
  if (i !== -1 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--')) return process.argv[i + 1]
  return fallback
}

const KNOWN_EXT = ['.vmdl', '.vpcf', '.vmat', '.vtex', '.vsnd', '.vsndevts']

function refsIn(block: string): string[] {
  const out = new Set<string>()
  for (const m of block.matchAll(/"(?:model_player|modifier|asset)"\s+"([^"]+)"/g)) {
    const v = m[1].trim()
    if (!v || v.startsWith('#') || v.startsWith('econ/')) continue
    if (KNOWN_EXT.some((e) => v.endsWith(e))) out.add(v)
  }
  return [...out]
}

function existsInVpk(vpk: string, ref: string): boolean {
  const candidates = [ref, `${ref}_c`]
  for (const c of candidates) {
    try {
      const out = execFileSync(path.resolve('tools/vpktool.exe'), ['list', vpk, '-f', c], { encoding: 'utf-8', timeout: 60000 })
      const parsed = JSON.parse(out)
      if (parsed?.ok && parsed.count > 0) return true
    } catch {
      // try next candidate
    }
  }
  return false
}

async function main(): Promise<void> {
  const itemsPath = arg('--items')
  if (!itemsPath) throw new Error('Pass --items <packed items_game.txt>.')
  const basePath = arg('--base')
  const dotaDir = arg('--dota') ?? detectDotaPath()
  if (!dotaDir) throw new Error('Dota 2 not detected; pass --dota <dir>.')
  const vpk = arg('--vpk') ?? path.join(dotaDir, 'dota', 'pak01_dir.vpk')

  const text = fs.readFileSync(itemsPath, 'utf-8')
  const section = readItemsSection(text)

  let base: Map<string, { start: number; end: number }> | null = null
  let baseText = ''
  if (basePath) {
    baseText = fs.readFileSync(basePath, 'utf-8')
    base = readItemsSection(baseText).blocks
  }

  const refs = new Map<string, string[]>() // ref -> [item ids]
  for (const [id, span] of section.blocks) {
    const block = text.slice(span.start, span.end)
    if (base) {
      const b = base.get(id)
      if (b && baseText.slice(b.start, b.end) === block) continue
    }
    for (const r of refsIn(block)) {
      const list = refs.get(r) ?? []
      if (!list.includes(id)) list.push(id)
      refs.set(r, list)
    }
  }

  console.log(`checking ${refs.size} referenced assets against Valve VPK...`)
  const missing: Array<[string, string[]]> = []
  let i = 0
  for (const [ref, ids] of refs) {
    i++
    if (i % 25 === 0) console.log(`  ${i}/${refs.size}...`)
    if (!existsInVpk(vpk, ref)) missing.push([ref, ids])
  }

  if (!missing.length) {
    console.log(`OK: all ${refs.size} refs resolve in Valve.`)
    return
  }
  console.log(`\nMISSING from Valve (${missing.length}):`)
  for (const [ref, ids] of missing) console.log(`  - ${ref}   (items: ${ids.join(', ')})`)
  process.exitCode = 1
}

main().catch((error) => {
  console.error('FATAL:', error instanceof Error ? (error.stack ?? error.message) : error)
  process.exit(1)
})
process.on('unhandledRejection', (e) => {
  console.error('UNHANDLED:', e)
  process.exit(1)
})
