/**
 * Generates `data/itemStyles.json` from the game's own schema.
 *
 * Replaces the hand-maintained `ARCANA_REGISTRY`, which had already drifted from the
 * game (it called Bladeform Legacy's first style "Bladeform Legacy" where the game says
 * "Legacy", and Vengeful Spirit's "Resurrection of Shen" where the game says
 * "Sovereigns of Skywrath").
 *
 * Entries are keyed the way the armory names things, because that is the string the
 * install pipeline looks styles up by (`getStyleOptionsByName(pick.item)`):
 *
 *   - only items the armory actually lists get an entry, so taunts and treasures — which
 *     have styles in the schema but no slot in the app — drop out, and `loadscreen` slots
 *     are skipped explicitly on top of that (clean:other drops the whole loadscreens
 *     category today; the skip keeps them out if it ever comes back);
 *   - each style carries its `alternate_icons` icon path, the same source the armory's
 *     style-variant rows use, so the UI can show per-style art;
 *   - the key is that armory row's name, not the schema's, so dataset-named rows
 *     ("Terrain - Desert" vs the schema's "Desert Terrain") resolve;
 *   - an id's first row is its base name and carries the entry; sibling rows of the same
 *     id are recovered from it at runtime (the ` - <style>` suffix match in plan.ts), so
 *     only siblings the runtime cannot reach — names with no separator — get their own;
 *   - styles that localize to one label (Valve's King of Vipers vote styles) collapse to
 *     a single entry, matching the single row the armory keeps for them.
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
  styles: Array<StyleOption & { model?: string; img?: string }>
}

/**
 * Schema item id -> every name the armory lists it under. An id can appear as several
 * rows (style variants, dataset aliases), and a lookup arrives with whichever name the
 * picker showed, so all of them need an entry. Within a row the first name is the base.
 */
function armoryNamesById(): Map<string, string[]> {
  const names = new Map<string, string[]>()
  for (const file of ['heroes_armory.json', 'other_armory.json']) {
    const armory = JSON.parse(fs.readFileSync(dataPath(file), 'utf-8')) as Record<
      string,
      { slots?: Array<{ slot?: string; mods?: Array<{ id?: number; name?: string }> }> }
    >
    for (const entry of Object.values(armory)) {
      for (const slot of entry.slots ?? []) {
        // Loading screens get no style UI in this app: clean:other drops the whole
        // loadscreens category today, and this keeps them out if it ever comes back.
        if (slot.slot === 'loadscreen') continue
        for (const mod of slot.mods ?? []) {
          if (mod.id == null || !mod.name) continue
          const key = String(mod.id)
          const list = names.get(key)
          if (!list) names.set(key, [mod.name])
          else if (!list.includes(mod.name)) list.push(mod.name)
        }
      }
    }
  }
  return names
}

async function main(): Promise<void> {
  const files = await resolveSchemaFiles()
  const { schema, text } = loadSchema(files)

  const doc = parseVdf(text, { opaque: isOpaqueBlock })
  const itemsNode = getNode(doc.root, 'items')
  if (!itemsNode || itemsNode.opaque) throw new Error('items_game.txt has no "items" block')

  const armoryNames = armoryNamesById()
  const out: Record<string, StylesEntry> = {}
  let skipped = 0
  let renamed = 0
  let collapsed = 0
  let contested = 0

  for (const entry of itemsNode.entries) {
    if (!isNode(entry.value)) continue
    const visuals = getNode(entry.value, 'visuals')
    if (!visuals) continue
    materializeDeep(text, visuals)

    const styles = styleOptions(schema, visuals)
    if (styles.length === 0) continue

    const item = schema.items.get(entry.key)
    if (!item) continue

    const armoryNamesForId = armoryNames.get(item.id)
    if (!armoryNamesForId) {
      skipped++
      continue
    }

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

    // Valve gives some styles one label and one skin for every index; the armory shows a
    // single row for those, so the catalog keeps a single entry — the first index wins.
    const alternateIcons = getNode(visuals, 'alternate_icons')
    const seen = new Set<string>()
    const deduped: StylesEntry['styles'] = []
    for (const style of styles) {
      if (seen.has(style.name)) {
        collapsed++
        continue
      }
      seen.add(style.name)
      // Per-style art from the shop's style picker (`alternate_icons.<index>.icon_path`),
      // extracted exactly like armory.ts does for its style-variant rows.
      const icon = alternateIcons && !alternateIcons.opaque ? getNode(alternateIcons, String(style.index)) : undefined
      const iconPath = icon ? getString(icon, 'icon_path') : undefined
      deduped.push({ ...style, model: models.get(style.index), img: iconPath })
    }

    const styled: StylesEntry = {
      hero: item.heroes[0] ?? '',
      slot: item.resolvedSlot,
      styles: deduped
    }

    for (const [index, armoryName] of armoryNamesForId.entries()) {
      // The first row is the id's base name. Sibling rows are reachable from it at
      // runtime by suffix, except the ones with no separator to strip.
      if (index > 0 && armoryName.includes(' - ')) continue
      if (out[armoryName]) {
        contested++
        continue
      }
      if (armoryName !== item.name) renamed++
      out[armoryName] = styled
    }
  }

  const payload = {
    generatedFrom: 'items_game.txt',
    source: files.itemsGame.split(/[\\/]/).pop() ?? 'items_game.txt',
    items: Object.fromEntries(Object.entries(out).sort(([a], [b]) => a.localeCompare(b)))
  }

  const target = dataPath('itemStyles.json')
  fs.writeFileSync(target, JSON.stringify(payload, null, 2), 'utf-8')
  console.log(`Wrote ${target}`)
  console.log(`  ${Object.keys(out).length} items indexed`)
  console.log(`  ${skipped} skipped (no armory row: taunts, treasures, screens)`)
  console.log(`  ${renamed} keyed under the armory's name instead of the schema's`)
  console.log(`  ${collapsed} duplicate style labels collapsed, ${contested} id collisions`)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
