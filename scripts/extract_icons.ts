import { execFileSync } from 'child_process'
import fs from 'fs'
import os from 'os'
import path from 'path'
import sharp from 'sharp'
import { detectDotaPath } from '../src/main/services/dota/dotaService'
import { readIconCatalog } from './lib/iconCatalog'
import { argValue, hasFlag } from './lib/schemaSource'

async function main(): Promise<void> {
  const root = path.resolve(argValue('--out-dir') ?? '.staging_icons')
  const extracted = path.join(root, 'extracted')
  const webp = path.join(root, 'webp')
  const keys = readIconCatalog()

  if (!hasFlag('--skip-extract')) {
    let vpk = argValue('--vpk')
    if (!vpk) {
      const game = detectDotaPath()
      if (game) vpk = path.join(game, 'dota', 'pak01_dir.vpk')
    }
    if (!vpk || !fs.existsSync(vpk)) throw new Error('Dota VPK missing. Pass --vpk <path to pak01_dir.vpk>.')
    const viewer = path.resolve('tools', 'Source2Viewer-CLI.exe')
    if (!fs.existsSync(viewer)) throw new Error(`Source2Viewer CLI missing at ${viewer}`)
    const threads = String(Math.max(2, Math.min(16, os.cpus().length - 1)))
    const prefixes = new Set(keys.map((key) => key.split('/')[0]))
    for (const prefix of prefixes) {
      execFileSync(viewer, ['-i', vpk, '-f', `panorama/images/${prefix}/`, '-d', '-o', extracted, '--threads', threads], {
        maxBuffer: 64 * 1024 * 1024
      })
    }
  }

  const imageRoot = path.join(extracted, 'panorama', 'images')
  if (!fs.existsSync(imageRoot)) throw new Error(`No extracted textures at ${imageRoot}`)
  const files = new Map<string, string>()
  for (const file of fs.readdirSync(imageRoot, { recursive: true, withFileTypes: true })) {
    if (!file.isFile() || !file.name.toLowerCase().endsWith('.png')) continue
    const full = path.join(file.parentPath, file.name)
    const key = path
      .relative(imageRoot, full)
      .replace(/\\/g, '/')
      .replace(/(_png)?\.png$/i, '')
      .toLowerCase()
    files.set(key, full)
  }

  let converted = 0
  for (const key of keys) {
    const source = files.get(key.toLowerCase())
    if (!source) continue
    const dest = path.join(webp, `${key}.webp`)
    await fs.promises.mkdir(path.dirname(dest), { recursive: true })
    await sharp(source).webp({ quality: 85, effort: 4 }).toFile(dest)
    converted++
    if (converted % 1000 === 0) console.log(`[Icons] ${converted}/${keys.length} textures staged`)
  }
  if (converted === 0) throw new Error('No catalog icons were found among the extracted textures.')
  console.log(`[Icons] Staged ${converted}/${keys.length} catalog icons in ${webp}`)
}

main().catch((error) => {
  console.error('[Icons]', error instanceof Error ? error.message : error)
  process.exitCode = 1
})
