import crypto from 'crypto'
import fs from 'fs'
import path from 'path'
import sharp from 'sharp'
import { getIconFallback } from '../src/shared/armory/iconKeys'
import { computeFileSha256, createTarBrotliFromDir } from '../src/main/services/assets/archiveUtils'
import { readIconPackManifest, type IconPackManifest } from '../src/main/services/assets/iconPackService'
import { readIconCatalog } from './lib/iconCatalog'

const ROOT = process.cwd()
const SOURCE_DIR = path.join(ROOT, '.staging_icons', 'webp')
const OUT_PACK = path.join(ROOT, 'assets', 'icon-pack.tar.br')
const OUT_MANIFEST = path.join(ROOT, 'assets', 'icon-pack.json')
// Item cards render at ~176px. Allow room for scaling while keeping the pack small.
const ICON_PX = 192
const WEBP_QUALITY = 78
const CONCURRENCY = 8

async function checkPack(catalogHash: string): Promise<IconPackManifest> {
  const manifest = readIconPackManifest(OUT_MANIFEST)
  if (manifest.catalogHash !== catalogHash) throw new Error('The bundled icon pack is out of date with the catalog.')
  if ((await computeFileSha256(OUT_PACK)) !== manifest.sha256) throw new Error('The bundled icon pack checksum does not match.')
  return manifest
}

async function main(): Promise<void> {
  const keys = readIconCatalog()
  const catalogHash = crypto.createHash('sha256').update(keys.join('\n')).digest('hex')
  const check = process.argv.includes('--check')
  const force = process.argv.includes('--force')
  if (check || !fs.existsSync(SOURCE_DIR)) {
    if (force && !check) throw new Error(`Missing ${SOURCE_DIR}. Run "npm run extract:icons" first.`)
    const manifest = await checkPack(catalogHash)
    console.log(`[Icon Pack] Verified ${manifest.count} bundled icons.`)
    return
  }

  const missing: string[] = []
  const sources = new Map<string, string>()
  const inputHash = crypto.createHash('sha256').update(`${ICON_PX}|${WEBP_QUALITY}|`)
  for (const key of keys) {
    const src = path.join(SOURCE_DIR, `${key}.webp`)
    const stat = fs.statSync(src, { throwIfNoEntry: false })
    if (!stat?.isFile() || !stat.size) {
      missing.push(key)
      continue
    }
    sources.set(key, src)
    inputHash
      .update(key)
      .update('\0')
      .update(crypto.createHash('sha256').update(fs.readFileSync(src)).digest())
  }

  const uncovered = missing.filter((key) => {
    const fallback = getIconFallback(key)
    return fallback === undefined || (fallback !== null && !sources.has(fallback))
  })
  if (uncovered.length) {
    throw new Error(
      `${uncovered.length} catalog icons are missing. Run "npm run extract:icons" first.\n${uncovered.slice(0, 20).join('\n')}`
    )
  }
  if (!sources.size) throw new Error('No icons to pack.')
  const sourceHash = inputHash.digest('hex')
  if (!force) {
    const committed = await checkPack(catalogHash).catch(() => null)
    if (committed?.sourceHash === sourceHash) {
      console.log('[Icon Pack] Up to date.')
      return
    }
  }

  const tempDir = fs.mkdtempSync(path.join(path.dirname(SOURCE_DIR), 'pack-'))
  const staging = path.join(tempDir, 'icons')
  const entries = [...sources]
  let done = 0
  let bytes = 0
  let next = 0

  async function worker(): Promise<void> {
    while (next < entries.length) {
      const [key, src] = entries[next++]
      const dest = path.join(staging, `${key}.webp`)
      await fs.promises.mkdir(path.dirname(dest), { recursive: true })
      const buf = await sharp(src)
        .resize(ICON_PX, ICON_PX, { fit: 'inside', withoutEnlargement: true })
        .webp({ quality: WEBP_QUALITY, effort: 4 })
        .toBuffer()
      await fs.promises.writeFile(dest, buf)
      bytes += buf.length
      done++
      if (done % 2000 === 0) console.log(`[Icon Pack] ${done}/${entries.length} (${(bytes / 1048576).toFixed(1)} MB)`)
    }
  }

  try {
    const workers = await Promise.allSettled(Array.from({ length: CONCURRENCY }, () => worker()))
    for (const result of workers) if (result.status === 'rejected') throw result.reason

    const archive = path.join(tempDir, 'icon-pack.tar.br')
    const manifestPath = path.join(tempDir, 'icon-pack.json')
    const { size, fileCount } = await createTarBrotliFromDir(staging, archive, 4)
    const sha256 = await computeFileSha256(archive)
    const manifest: IconPackManifest = { sha256, catalogHash, sourceHash, count: fileCount, bytes, px: ICON_PX, quality: WEBP_QUALITY }
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n')
    fs.renameSync(archive, OUT_PACK)
    fs.renameSync(manifestPath, OUT_MANIFEST)
    console.log(`[Icon Pack] Wrote ${fileCount} icons, ${(size / 1048576).toFixed(1)} MB. ${missing.length} paths use local fallbacks.`)
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true })
  }
}

main().catch((err) => {
  console.error('[Icon Pack] Failed:', err instanceof Error ? err.message : err)
  process.exitCode = 1
})
