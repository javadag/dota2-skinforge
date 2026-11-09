/**
 * Append one item block from Valve's items_game into a bundle group's items_patch.txt.
 *
 *   npx tsx scripts/add_item_patch.ts --group techies --id 35989
 *
 * Valve's file is written as one line of tab-separated tokens; the patch files are
 * indented, so the block is reflowed to match.
 */

import fs from 'fs'
import path from 'path'

import { loadIndex, readEntry } from '../src/main/services/vpkIndex'

const VPK = 'D:/SteamLibrary/steamapps/common/dota 2 beta/game/dota/pak01_dir.vpk'

function arg(name: string, fallback?: string): string | undefined {
  const i = process.argv.indexOf(name)
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback
}

/** Raw `"<id>" { ... }` slice out of items_game.txt. */
function extractBlock(text: string, id: string): string | undefined {
  const re = new RegExp(`"${id}"\\s*\\{`, 'g')
  let m: RegExpExecArray | null
  while ((m = re.exec(text))) {
    const start = m.index
    const brace = text.indexOf('{', start)
    let depth = 0
    for (let i = brace; i < text.length; i++) {
      if (text[i] === '{') depth++
      else if (text[i] === '}') {
        depth--
        if (depth === 0) return text.slice(start, i + 1)
      }
    }
  }
  return undefined
}

/** Reflow `"id" { "k" "v" ... }` into indented lines, matching the patch files. */
function reflow(block: string, baseIndent: number): string {
  const tokens = block
    .split('\t')
    .map((t) => t.trim())
    .filter(Boolean)
  const lines: string[] = []
  let indent = baseIndent
  let i = 0
  const pad = (n: number): string => '\t'.repeat(n)

  while (i < tokens.length) {
    const tok = tokens[i]
    if (tok === '{') {
      lines.push(pad(indent) + '{')
      indent++
      i++
      continue
    }
    // the root id sits on its own line, above its brace
    if (i === 0) {
      lines.push(pad(indent) + tok)
      i++
      continue
    }
    if (tok === '}') {
      indent--
      lines.push(pad(indent) + '}')
      i++
      continue
    }
    const next = tokens[i + 1]
    if (next === '{') {
      lines.push(`${pad(indent)}${tok} {`)
      indent++
      i += 2
      continue
    }
    lines.push(`${pad(indent)}${tok}\t${next ?? ''}`)
    i += 2
  }
  return lines.join('\n')
}

function main(): void {
  const group = arg('--group')
  const id = arg('--id')
  if (!group || !id) throw new Error('usage: --group <group> --id <item id>')

  const bundle = path.resolve(arg('--bundle', 'D:\\skinforge_raw')!)
  const patchPath = path.join(bundle, group, 'items_patch.txt')
  if (!fs.existsSync(patchPath)) throw new Error(`no patch file: ${patchPath}`)

  const patch = fs.readFileSync(patchPath, 'utf-8')
  if (new RegExp(`^\\t\\t"${id}"$`, 'm').test(patch)) {
    console.log(`${id} already present in ${group}/items_patch.txt`)
    return
  }

  const index = loadIndex(VPK)
  const schema = readEntry(index, 'scripts/items/items_game.txt')!.toString('utf-8')
  const block = extractBlock(schema, id)
  if (!block) throw new Error(`item ${id} not found in items_game`)

  const body = reflow(block, 2)
  const tail = '\n\t}\n}\n'
  if (!patch.endsWith(tail)) throw new Error('unexpected patch tail')

  const next = patch.slice(0, -tail.length) + '\n' + body + tail
  fs.writeFileSync(patchPath, next, 'utf-8')

  const name = /"name"\t+"([^"]*)"/.exec(reflow(block, 2).replace(/\t+/g, '\t'))?.[1]
  console.log(`added ${id} to ${group}/items_patch.txt  (${block.length} bytes${name ? `, "${name}"` : ''})`)
}

main()
