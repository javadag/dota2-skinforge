import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import sharp from 'sharp'
import { computeFileSha256, createTarBrotliFromDir } from '../src/main/services/assets/archiveUtils'
import { detectDotaPath } from '../src/main/services/dota/dotaService'
import { getOrLoadVpkIndex } from '../src/main/services/dota/vpkService'
import { getIconKey } from '../src/shared/armory/iconKeys'

async function main() {
  const dota = detectDotaPath()
  if (!dota) throw new Error('Dota 2 must be installed to build the ability icon pack.')
  const viewer = process.argv[2] ?? path.resolve('tools', 'Source2Viewer-CLI.exe')
  const vpk = path.join(dota, 'dota/pak01_dir.vpk')
  const supported = /^panorama\/images\/(spellicons\/.+)_png\.vtex_c$/
  const expected = new Set(
    [...getOrLoadVpkIndex(vpk).entries.keys()].flatMap((file) => {
      const match = supported.exec(file)
      const key = match && getIconKey(match[1])
      return key ? [key] : []
    })
  )
  const temp = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'skinforge-ability-icons-'))
  try {
    const extracted = path.join(temp, 'extracted')
    const prefix = 'panorama/images/spellicons'
    execFileSync(viewer, ['-i', vpk, '-f', `${prefix}/`, '-d', '-o', extracted, '--threads', '8'], {
      maxBuffer: 16 * 1024 * 1024
    })
    const root = path.join(extracted, 'panorama/images')
    const files = await fs.promises.readdir(path.join(root, 'spellicons'), { recursive: true, withFileTypes: true })
    const staging = path.join(temp, 'webp')
    const keys = new Set<string>()
    let bytes = 0
    const px = 96
    const quality = 84
    for (const file of files) {
      if (!file.isFile() || !/_(?:png|svg)\.(?:png|svg)$/i.test(file.name)) continue
      const source = path.join(file.parentPath, file.name)
      const key = getIconKey(
        path
          .relative(root, source)
          .replaceAll('\\', '/')
          .replace(/_(?:png|svg)\.(?:png|svg)$/i, '')
      )
      if (!key || keys.has(key)) continue
      const target = path.join(staging, `${key}.webp`)
      await fs.promises.mkdir(path.dirname(target), { recursive: true })
      const info = await sharp(source).resize(px, px, { fit: 'inside' }).webp({ quality }).toFile(target)
      keys.add(key)
      bytes += info.size
    }
    // A handful of legacy textures export to alternate filenames. A failed decoder
    // can also return a partial tree without a nonzero exit status.
    if (!expected.size || [...keys].filter((key) => expected.has(key)).length < expected.size * 0.99) {
      throw new Error('Ability icon extraction is incomplete. Use a current Source 2 Viewer CLI with texture decoding support.')
    }
    const archive = path.join('assets', 'ability-icons.tar.br')
    await createTarBrotliFromDir(staging, archive, 4)
    const sha256 = await computeFileSha256(archive)
    const icons = [...keys].sort()
    await fs.promises.writeFile(
      'assets/ability-icons.json',
      JSON.stringify({ sha256, count: icons.length, bytes, px, quality, icons }) + '\n'
    )
    console.log(`Packed ${icons.length} ability icons.`)
  } finally {
    await fs.promises.rm(temp, { recursive: true, force: true })
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
