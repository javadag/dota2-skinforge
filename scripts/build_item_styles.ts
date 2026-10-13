/**
 * Generates `data/itemStyles.json` from the game's own schema.
 *
 * Replaces the hand-maintained `ARCANA_REGISTRY`, which had already drifted from the
 * game (it called Bladeform Legacy's first style "Bladeform Legacy" where the game says
 * "Legacy", and Vengeful Spirit's "Resurrection of Shen" where the game says
 * "Sovereigns of Skywrath").
 *
 * Usage:
 *   npm run build:styles
 *   npm run build:styles -- --items-game <path> --localization <path>
 *
 * Without explicit paths it extracts both files from the installed Dota 2 client.
 */

import fs from 'fs'
import { dataPath, loadSchema, resolveSchemaFiles } from './lib/schemaSource'
import { isOpaqueBlock } from '../src/main/services/modifier'
import { assetModifiers, styleOptions, type StyleOption } from '../src/main/services/modifier/visuals'
import { getNode, getString, isNode, materializeDeep, parseVdf } from '../src/main/services/modifier/vdf'

interface StylesEntry {
  hero: string
  slot: string
  styles: Array<StyleOption & { model?: string }>
}

async function main(): Promise<void> {
  const files = await resolveSchemaFiles()
  const { schema, text } = loadSchema(files)

  const doc = parseVdf(text, { opaque: isOpaqueBlock })
  const itemsNode = getNode(doc.root, 'items')
  if (!itemsNode || itemsNode.opaque) throw new Error('items_game.txt has no "items" block')

  const out: Record<string, StylesEntry> = {}
  let scanned = 0

  for (const entry of itemsNode.entries) {
    if (!isNode(entry.value)) continue
    const visuals = getNode(entry.value, 'visuals')
    if (!visuals) continue
    materializeDeep(text, visuals)

    const styles = styleOptions(schema, visuals)
    if (styles.length === 0) continue

    const item = schema.items.get(entry.key)
    if (!item) continue
    scanned++

    // Style-specific models live in `entity_model` modifiers tagged with a style index.
    const models = new Map<number, string>()
    for (const modifier of assetModifiers(visuals)) {
      if (!isNode(modifier.value)) continue
      if (getString(modifier.value, 'type') !== 'entity_model') continue
      const styleRaw = getString(modifier.value, 'style')
      const modifierPath = getString(modifier.value, 'modifier')
      if (styleRaw === undefined || !modifierPath) continue
      const style = Number.parseInt(styleRaw, 10)
      if (Number.isFinite(style)) models.set(style, modifierPath)
    }

    out[item.name] = {
      hero: item.heroes[0] ?? '',
      slot: item.resolvedSlot,
      styles: styles.map((style) => ({ ...style, model: models.get(style.index) }))
    }
  }

  const payload = {
    generatedFrom: 'items_game.txt',
    source: files.itemsGame.split(/[\\/]/).pop() ?? 'items_game.txt',
    itemCount: Object.keys(out).length,
    items: Object.fromEntries(Object.entries(out).sort(([a], [b]) => a.localeCompare(b)))
  }

  const target = dataPath('itemStyles.json')
  fs.writeFileSync(target, JSON.stringify(payload, null, 2), 'utf-8')
  console.log(`Wrote ${target}`)
  console.log(`  ${scanned} items with styles, ${Object.keys(out).length} indexed`)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
