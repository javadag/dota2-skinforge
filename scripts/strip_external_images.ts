/**
 * Replace externally hosted catalog images with local/Valve sources.
 *
 * - `data/heroes_armory.json`   drops `portrait`, `taunt`, `gamesets` (taunts come from the
 *                               generated `taunt` slot; sets are unused)
 * - `data/other_armory.json`    rewrites each mod's `img` to its Valve `image_inventory`
 *                               (an R2 icon key) and drops slot `empty_img`
 *
 *   npm run build:strip-images
 */

import fs from 'fs'

import { dataPath, hasFlag, loadSchema, resolveSchemaFiles, stringifyLikeFile } from './lib/schemaSource'

function rewrite(file: string, mutate: (value: unknown) => void): void {
  const path = dataPath(file)
  const raw = fs.readFileSync(path, 'utf-8')
  const value = JSON.parse(raw)
  mutate(value)
  const next = stringifyLikeFile(raw, value, file, { allowRewrite: true })
  if (hasFlag('--dry-run')) {
    console.log(`would write ${file} (${raw.length} -> ${next.length} chars)`)
    return
  }
  fs.writeFileSync(path, next, 'utf-8')
  console.log(`wrote ${file}`)
}

async function main(): Promise<void> {
  const files = await resolveSchemaFiles()
  const { schema } = loadSchema(files)

  rewrite('heroes_armory.json', (value) => {
    for (const entry of Object.values(value as Record<string, Record<string, unknown>>)) {
      delete entry.portrait
      delete entry.taunt
      delete entry.gamesets
      for (const slot of (entry.slots as Array<Record<string, unknown>>) ?? []) {
        delete slot.empty_img
      }
    }
  })

  let rewritten = 0
  let dropped = 0
  rewrite('other_armory.json', (value) => {
    for (const entry of Object.values(value as Record<string, Record<string, unknown>>)) {
      for (const slot of (entry.slots as Array<Record<string, unknown>>) ?? []) {
        delete slot.empty_img
        for (const mod of (slot.mods as Array<Record<string, unknown>>) ?? []) {
          const id = typeof mod.id === 'number' ? String(mod.id) : null
          const item = id ? schema.items.get(id) : undefined
          if (item?.image) {
            mod.img = item.image
            rewritten++
          } else {
            delete mod.img
            dropped++
          }
        }
      }
    }
  })

  console.log(`other_armory images: ${rewritten} -> Valve icon, ${dropped} dropped (no image_inventory)`)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
