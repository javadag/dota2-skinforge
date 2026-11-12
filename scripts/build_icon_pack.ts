/**
 * Dota 2 SkinForge — Bundled Icon Pack Builder
 *
 * Resizes every icon referenced by the armory/style data to the size the UI
 * actually renders and packs them into a single `assets/icon-pack.tar.br`.
 * The app extracts that pack once per version instead of asking R2 for each
 * icon individually.
 *
 * Usage: npm run build:icon-pack
 */

import crypto from 'crypto'
import fs from 'fs'
import path from 'path'
import sharp from 'sharp'
import { collectIconKeys } from '../src/shared/armory/iconKeys'
import { createTarBrotliFromDir } from '../src/main/services/tarUtils'

const ROOT = process.cwd()
const SOURCE_DIR = path.join(ROOT, '.staging_icons', 'webp')
const STAGING_DIR = path.join(ROOT, '.staging_icons', 'pack')
const OUT_PACK = path.join(ROOT, 'assets', 'icon-pack.tar.br')
const OUT_MANIFEST = path.join(ROOT, 'assets', 'icon-pack.json')
const DATA_FILES = ['heroes_armory.json', 'other_armory.json', 'itemStyles.json']

// Item cards render at ~176px; 192px keeps them sharp at 100% scaling.
const ICON_PX = 192
const WEBP_QUALITY = 78
const CONCURRENCY = 8

function collectAllKeys(): string[] {
  const keys = new Set<string>()
  for (const file of DATA_FILES) {
    const full = path.join(ROOT, 'data', file)
    if (!fs.existsSync(full)) throw new Error(`Missing data file: ${full}`)
    collectIconKeys(JSON.parse(fs.readFileSync(full, 'utf8')), keys)
  }
  return [...keys].sort()
}

async function main(): Promise<void> {
  if (!fs.existsSync(SOURCE_DIR)) {
    // CI and fresh clones have no Dota 2 extraction; they ship the committed pack.
    if (fs.existsSync(OUT_PACK) && fs.existsSync(OUT_MANIFEST)) {
      console.log(`[Icon Pack] ${path.relative(ROOT, SOURCE_DIR)} not present; reusing the committed pack.`)
      return
    }
    throw new Error(`Missing ${SOURCE_DIR}. Run "npm run sync:icons -- --dry-run" first to populate it.`)
  }

  const keys = collectAllKeys()

  // Collect sources first so the pack version reflects both the icon list and the
  // source textures. Without the sizes, a re-extracted game build would never rebuild.
  const missing: string[] = []
  const sources: string[] = []
  const sourceSizes: number[] = []
  for (const key of keys) {
    const src = path.join(SOURCE_DIR, `${key}.webp`)
    const stat = fs.statSync(src, { throwIfNoEntry: false })
    if (!stat) {
      missing.push(key)
      continue
    }
    sources.push(src)
    sourceSizes.push(stat.size)
  }

  const version = crypto
    .createHash('sha1')
    .update(keys.join('\n'))
    .update(`|${ICON_PX}|${WEBP_QUALITY}|${sourceSizes.join(',')}`)
    .digest('hex')
    .slice(0, 12)

  // The pack is committed, so skip the 90s rebuild when nothing actually changed.
  if (!process.argv.includes('--force') && fs.existsSync(OUT_PACK) && readManifestVersion() === version) {
    console.log(`[Icon Pack] Up to date (version ${version}); pass --force to rebuild.`)
    return
  }

  console.log(`[Icon Pack] ${keys.length} icons referenced by data`)

  fs.rmSync(STAGING_DIR, { recursive: true, force: true })

  let done = 0
  let bytes = 0
  let next = 0

  async function worker(): Promise<void> {
    while (next < sources.length) {
      const src = sources[next++]
      const key = path
        .relative(SOURCE_DIR, src)
        .replace(/\\/g, '/')
        .replace(/\.webp$/i, '')
      const dest = path.join(STAGING_DIR, `${key}.webp`)
      await fs.promises.mkdir(path.dirname(dest), { recursive: true })
      const buf = await sharp(src)
        .resize(ICON_PX, ICON_PX, { fit: 'inside', withoutEnlargement: true })
        .webp({ quality: WEBP_QUALITY, effort: 4 })
        .toBuffer()
      await fs.promises.writeFile(dest, buf)
      bytes += buf.length
      done++
      if (done % 2000 === 0) console.log(`[Icon Pack] ${done}/${sources.length} (${(bytes / 1048576).toFixed(1)} MB)`)
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()))

  if (missing.length) {
    console.warn(`[Icon Pack] ${missing.length} referenced icons have no source file and were skipped:`)
    for (const key of missing) console.warn(`  - ${key}`)
  }
  if (done === 0) throw new Error('No icons were packed. Is .staging_icons/webp populated?')

  const { size, fileCount } = await createTarBrotliFromDir(STAGING_DIR, OUT_PACK, 4)

  fs.writeFileSync(OUT_MANIFEST, JSON.stringify({ version, count: fileCount, bytes, px: ICON_PX, quality: WEBP_QUALITY }, null, 2) + '\n')

  fs.rmSync(STAGING_DIR, { recursive: true, force: true })

  console.log(`[Icon Pack] Wrote ${fileCount} icons, ${(size / 1048576).toFixed(1)} MB`)
  console.log(`[Icon Pack] ${path.relative(ROOT, OUT_PACK)}  (version ${version})`)
}

function readManifestVersion(): string | null {
  try {
    return String(JSON.parse(fs.readFileSync(OUT_MANIFEST, 'utf8')).version ?? '')
  } catch {
    return null
  }
}

main().catch((err) => {
  console.error('[Icon Pack] Failed:', err instanceof Error ? err.message : err)
  process.exit(1)
})
