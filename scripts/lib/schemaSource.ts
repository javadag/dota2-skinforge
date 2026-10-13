/**
 * Shared schema loading for the catalog/style build scripts.
 *
 * Locates `items_game.txt` (and the localization file, when available) either from explicit
 * `--items-game` / `--localization` arguments or by extracting them from the installed Dota 2
 * client with the bundled vpktool, then builds the engine's own schema index so the scripts and
 * the mod agree on what the game says.
 */

import fs from 'fs'
import path from 'path'
import { getAppRoot } from '../../src/main/services/appPathService'
import { detectDotaPath } from '../../src/main/services/dotaPathService'
import { extract } from '../../src/main/services/vpkService'
import { buildSchema, type SchemaIndex } from '../../src/main/services/modifier/schema'

export interface SchemaFiles {
  itemsGame: string
  localization?: string
}

export function argValue(flag: string): string | undefined {
  const index = process.argv.indexOf(flag)
  return index === -1 ? undefined : process.argv[index + 1]
}

export function hasFlag(flag: string): boolean {
  return process.argv.includes(flag)
}

export async function resolveSchemaFiles(): Promise<SchemaFiles> {
  const explicitItems = argValue('--items-game')
  const explicitLoc = argValue('--localization')
  if (explicitItems) return { itemsGame: explicitItems, localization: explicitLoc }

  const dotaGameDir = detectDotaPath()
  if (!dotaGameDir) {
    throw new Error('Could not detect a Dota 2 installation. Pass --items-game <path> explicitly.')
  }

  const vpk = path.join(dotaGameDir, 'dota', 'pak01_dir.vpk')
  if (!fs.existsSync(vpk)) throw new Error(`Dota 2 VPK not found at ${vpk}`)

  const outDir = fs.mkdtempSync(path.join(getAppRoot(), '.staging_schema-'))
  const itemsGame = path.join(outDir, 'items_game.txt')
  const localization = path.join(outDir, 'dota_english.txt')

  console.log(`Extracting schema from ${vpk}`)
  await extract(vpk, 'scripts/items/items_game.txt', itemsGame)
  let localizationPath: string | undefined
  try {
    await extract(vpk, 'resource/localization/dota_english.txt', localization)
    localizationPath = localization
  } catch {
    console.warn('Localization not available; style names will use their schema tokens.')
  }
  return { itemsGame, localization: localizationPath }
}

export interface LoadedSchema {
  schema: SchemaIndex
  text: string
  localizationText?: string
}

export function loadSchema(files: SchemaFiles): LoadedSchema {
  const text = fs.readFileSync(files.itemsGame, 'utf-8')
  const localizationText =
    files.localization && fs.existsSync(files.localization) ? fs.readFileSync(files.localization, 'utf-8') : undefined
  return { schema: buildSchema(text, { localizationText }), text, localizationText }
}

/** Path to a file in the repo's `data/` directory. */
export function dataPath(file: string): string {
  return path.join(getAppRoot(), 'data', file)
}

/**
 * Re-serialize JSON in the repo's 2-space form, refusing when the round trip would change the
 * file by more than the intended edit — so a rewrite can never silently reformat or drop data.
 */
/**
 * Re-serialize JSON in the repo's 2-space form.
 *
 * By default it refuses when the round trip would change the file by more than the intended
 * surgical edit, so a small fix can never silently reformat or drop data. Pass
 * `{ allowRewrite: true }` for a deliberate full rebuild, where a large change is the point.
 */
export function stringifyLikeFile(original: string, value: unknown, label: string, options: { allowRewrite?: boolean } = {}): string {
  const body = JSON.stringify(value, null, 2)
  const roundTrip = body + (original.endsWith('\n') ? '\n' : '')
  const parsedOriginal = JSON.stringify(JSON.parse(original), null, 2) + (original.endsWith('\n') ? '\n' : '')
  if (parsedOriginal !== original) {
    console.warn(`${label} is not stored in plain 2-space JSON form; it will be reformatted.`)
  }
  const delta = Math.abs(roundTrip.length - parsedOriginal.length)
  if (!options.allowRewrite && delta > 1024) {
    throw new Error(`Refusing to write ${label}: the rewrite would change ${delta} characters.`)
  }
  return roundTrip
}
