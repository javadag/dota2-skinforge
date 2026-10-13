/**
 * CLI: validate `data/valveHeroCatalog.json` against the game's own schema and repair drift.
 *
 * Usage:
 *   npm run check:catalog        # report drift; exits non-zero when found
 *   npm run fix:catalog          # repair the safe findings in place
 *   ... -- --items-game <path> --localization <path>   # use explicit schema files
 *
 * Run it after every Dota patch: it is what turns "the UI is offering two of the same weapon"
 * into a one-command repair instead of a hunt through a 2.9 MB generated file.
 */

import fs from 'fs'
import { dataPath, hasFlag, loadSchema, resolveSchemaFiles, stringifyLikeFile } from './lib/schemaSource'
import { catalogEntryCount, collectCatalogFindings, type Catalog } from './lib/heroCatalogCheck'

const CATALOG_FILE = 'valveHeroCatalog.json'

async function main(): Promise<void> {
  const files = await resolveSchemaFiles()
  const { schema } = loadSchema(files)
  const path = dataPath(CATALOG_FILE)
  const raw = fs.readFileSync(path, 'utf-8')
  const cat = JSON.parse(raw) as Catalog

  console.log(`schema:  ${schema.items.size} items, ${schema.sets.size} sets, ${schema.defaults.size} owners`)
  console.log(`catalog: ${Object.keys(cat).length} owners, ${catalogEntryCount(cat)} entries`)

  const findings = collectCatalogFindings(cat, schema)
  const errors = findings.filter((finding) => finding.level === 'error')
  const infos = findings.filter((finding) => finding.level === 'info')

  if (errors.length > 0) {
    console.log(`\n${errors.length} problem${errors.length === 1 ? '' : 's'}:`)
    for (const finding of errors) console.log(`  ERROR ${finding.where}\n        ${finding.message}`)
  }
  if (infos.length > 0) {
    console.log(`\n${infos.length} informational note${infos.length === 1 ? '' : 's'} (never modified):`)
    for (const finding of infos) console.log(`  note  ${finding.where}: ${finding.message}`)
  }

  if (hasFlag('--fix')) {
    const repairable = errors.filter((finding) => finding.repair)
    if (repairable.length === 0) {
      console.log('\nNothing repairable to do.')
      return
    }
    for (const finding of repairable) finding.repair?.()
    fs.writeFileSync(path, stringifyLikeFile(raw, cat, CATALOG_FILE), 'utf-8')
    console.log(`\nRepaired ${repairable.length} finding(s); wrote ${path}`)

    const remaining = collectCatalogFindings(JSON.parse(fs.readFileSync(path, 'utf-8')) as Catalog, schema).filter(
      (finding) => finding.level === 'error'
    )
    console.log(`Re-check: ${remaining.length} problem(s) remaining.`)
    for (const finding of remaining) console.log(`  ERROR ${finding.where}: ${finding.message}`)
    process.exitCode = remaining.length > 0 ? 1 : 0
    return
  }

  if (errors.length > 0) {
    console.log('\nRun `npm run fix:catalog` to repair these.')
    process.exitCode = 1
  } else {
    console.log('\nCatalog matches the schema.')
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
