/**
 * Audit the overlay bundles we ship against Valve's own files.
 *
 * For every file in every bundle, decide what it actually is:
 *
 *   duplicate    Valve has the exact same bytes at the exact same path — shipping it is waste
 *   valve-copy   same bytes as one of the item's own Valve files, just renamed onto a slot
 *                path — we could pull it from the player's game instead of shipping it
 *   custom       the modder's own bytes — this is the part that has to be shipped
 *   new          a path Valve does not have at all
 *
 *   tsx scripts/bundle_audit.ts [--json]
 */

import crypto from 'crypto'
import fs from 'fs'
import path from 'path'

import { loadIndex, readEntry, type VpkIndex } from '../src/main/services/vpkIndex'
import { buildSchema } from '../src/main/services/modifier/schema'
import { materializeDeep, getNode, getString, isNode } from '../src/main/services/modifier/vdf'
import { assetModifiers } from '../src/main/services/modifier/visuals'

const VPK = 'D:/SteamLibrary/steamapps/common/dota 2 beta/game/dota/pak01_dir.vpk'
const md5 = (b: Buffer): string => crypto.createHash('md5').update(b).digest('hex')

const manifest = JSON.parse(fs.readFileSync('data/cosmetic-assets.json', 'utf-8')) as {
  sourceDir: string
  items: Record<string, { name: string; hero: string; group: string; files: string[] }>
}

const index: VpkIndex = loadIndex(VPK)
const schemaText = readEntry(index, 'scripts/items/items_game.txt')!.toString('utf-8')
const schema = buildSchema(schemaText)

/** md5 -> label, for the Valve files a given item legitimately uses. */
function valveHashesFor(itemId: string): Map<string, string> {
  const out = new Map<string, string>()
  const item = schema.items.get(itemId)
  if (!item) return out
  const node = item.entry.value
  if (typeof node === 'string') return out
  materializeDeep(schemaText, node)

  const add = (rel: string): void => {
    const bytes = readEntry(index, rel.endsWith('_c') ? rel : `${rel}_c`)
    if (bytes) out.set(md5(bytes), rel)
  }
  if (item.model) add(item.model)
  const visuals = getNode(node, 'visuals')
  if (visuals && !visuals.opaque) {
    for (const entry of assetModifiers(visuals)) {
      if (!isNode(entry.value)) continue
      const modifier = getString(entry.value, 'modifier')
      if (modifier && /\.(vmdl|vpcf|vmat|vsnd|vsndevts)$/.test(modifier)) add(modifier)
      const asset = getString(entry.value, 'asset')
      if (asset && /\.(vmdl|vpcf|vmat|vsnd|vsndevts)$/.test(asset)) add(asset)
    }
  }
  return out
}

const totals = { files: 0, bytes: 0, duplicate: 0, duplicateBytes: 0, valveCopy: 0, valveCopyBytes: 0, custom: 0, customBytes: 0 }
const rows: string[] = []

for (const [id, entry] of Object.entries(manifest.items)) {
  const known = valveHashesFor(id)
  let files = 0
  let bytes = 0
  let dup = 0
  let dupBytes = 0
  let renamed = 0
  let renamedBytes = 0
  let customBytes = 0

  for (const rel of entry.files) {
    const local = path.join(manifest.sourceDir, entry.group, rel.replace(/\//g, path.sep))
    if (!fs.existsSync(local)) continue
    const data = fs.readFileSync(local)
    const hash = md5(data)
    files++
    bytes += data.length

    const samePath = readEntry(index, rel)
    if (samePath && md5(samePath) === hash) {
      dup++
      dupBytes += data.length
      continue
    }
    if (known.has(hash)) {
      renamed++
      renamedBytes += data.length
      continue
    }
    customBytes += data.length
  }

  totals.files += files
  totals.bytes += bytes
  totals.duplicate += dup
  totals.duplicateBytes += dupBytes
  totals.valveCopy += renamed
  totals.valveCopyBytes += renamedBytes
  totals.custom += files - dup - renamed
  totals.customBytes += customBytes

  rows.push(
    `${entry.name.padEnd(40)} ${String(files).padStart(4)} files ${String(Math.round(bytes / 1024)).padStart(7)} KB   ` +
      `dup ${String(dup).padStart(4)} (${String(Math.round(dupBytes / 1024)).padStart(6)} KB)   ` +
      `valve-copy ${String(renamed).padStart(4)} (${String(Math.round(renamedBytes / 1024)).padStart(6)} KB)   ` +
      `custom ${String(Math.round(customBytes / 1024)).padStart(6)} KB`
  )
}

console.log(rows.join('\n'))
const kb = (n: number): string => `${Math.round(n / 1024).toLocaleString()} KB`
console.log('\n--- totals ---')
console.log(`files            ${totals.files}`)
console.log(`bytes            ${kb(totals.bytes)}`)
console.log(`duplicate        ${totals.duplicate} files, ${kb(totals.duplicateBytes)}`)
console.log(`valve copy       ${totals.valveCopy} files, ${kb(totals.valveCopyBytes)}`)
console.log(`genuinely custom ${totals.custom} files, ${kb(totals.customBytes)}`)
