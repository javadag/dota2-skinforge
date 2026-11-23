import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import sharp from 'sharp'
import { computeFileSha256, createTarBrotliFromDir } from '../src/main/services/assets/archiveUtils'
import { detectDotaPath } from '../src/main/services/dota/dotaService'
import { getOrLoadVpkIndex, readEntry, type VpkIndex } from '../src/main/services/dota/vpkService'
import { getIconKey } from '../src/shared/armory/iconKeys'

function parseVtexBlocks(buf: Buffer): Map<string, { off: number; len: number }> {
  const blocks = new Map<string, { off: number; len: number }>()
  if (buf.length < 16) return blocks
  const tableStart = 8 + buf.readUInt32LE(8)
  const count = buf.readUInt32LE(12)
  for (let i = 0; i < count; i++) {
    const pos = tableStart + i * 12
    if (pos + 12 > buf.length) break
    const tag = buf.subarray(pos, pos + 4).toString('ascii')
    const off = pos + 4 + buf.readUInt32LE(pos + 4)
    const len = buf.readUInt32LE(pos + 8)
    blocks.set(tag, { off, len })
  }
  return blocks
}

function patchVtexRed2(src: Buffer, donorRed2: Buffer): Buffer | null {
  const data = parseVtexBlocks(src).get('DATA')
  if (!data || data.off + data.len > src.length) return null
  const hdr = Buffer.alloc(40)
  const red2Off = hdr.length
  const dataOff = red2Off + donorRed2.length
  hdr.writeUInt32LE(dataOff + data.len, 0)
  hdr.writeUInt32LE(src.readUInt32LE(4), 4)
  hdr.writeUInt32LE(8, 8)
  hdr.writeUInt32LE(2, 12)
  hdr.write('RED2', 16)
  hdr.writeUInt32LE(red2Off - 20, 20)
  hdr.writeUInt32LE(donorRed2.length, 24)
  hdr.write('DATA', 28)
  hdr.writeUInt32LE(dataOff - 32, 32)
  hdr.writeUInt32LE(data.len, 36)
  return Buffer.concat([hdr, donorRed2, src.subarray(data.off)])
}

function findDonorRed2(vpkIndex: VpkIndex, decodedKeys: ReadonlySet<string>): Buffer | null {
  for (const key of decodedKeys) {
    const bytes = readEntry(vpkIndex, `panorama/images/${key}_png.vtex_c`)
    if (!bytes) continue
    const red2 = parseVtexBlocks(bytes).get('RED2')
    if (red2 && red2.off + red2.len <= bytes.length) {
      return bytes.subarray(red2.off, red2.off + red2.len)
    }
  }
  return null
}

function viewerEnv(): NodeJS.ProcessEnv {
  const s2vCache = path.join(os.tmpdir(), '.net', 'Source2Viewer')
  if (!fs.existsSync(s2vCache)) return process.env
  for (const entry of fs.readdirSync(s2vCache, { withFileTypes: true })) {
    if (entry.isDirectory() && fs.existsSync(path.join(s2vCache, entry.name, 'libSkiaSharp.dll'))) {
      return { ...process.env, PATH: `${path.join(s2vCache, entry.name)}${path.delimiter}${process.env.PATH ?? ''}` }
    }
  }
  return process.env
}

async function main() {
  const dota = detectDotaPath()
  if (!dota) throw new Error('Dota 2 must be installed to build the ability icon pack.')
  const viewer = process.argv[2] ?? path.resolve('tools', 'Source2Viewer-CLI.exe')
  const vpk = path.join(dota, 'dota/pak01_dir.vpk')
  const vpkIndex = getOrLoadVpkIndex(vpk)
  const supported = /^panorama\/images\/(spellicons\/.+)_png\.vtex_c$/
  const expected = new Set(
    [...vpkIndex.entries.keys()].flatMap((file) => {
      const match = supported.exec(file)
      const key = match && getIconKey(match[1])
      return key ? [key] : []
    })
  )
  const temp = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'skinforge-ability-icons-'))
  try {
    const extracted = path.join(temp, 'extracted')
    const prefix = 'panorama/images/spellicons'
    const env = viewerEnv()
    execFileSync(viewer, ['-i', vpk, '-f', `${prefix}/`, '-d', '-o', extracted, '--threads', '8'], {
      maxBuffer: 16 * 1024 * 1024,
      env
    })
    const root = path.join(extracted, 'panorama/images')
    const files = await fs.promises.readdir(path.join(root, 'spellicons'), { recursive: true, withFileTypes: true })
    const staging = path.join(temp, 'webp')
    const keys = new Set<string>()
    let bytes = 0
    const px = 96
    const quality = 84

    const addWebp = async (source: string, key: string): Promise<void> => {
      if (!key || keys.has(key)) return
      const target = path.join(staging, `${key}.webp`)
      await fs.promises.mkdir(path.dirname(target), { recursive: true })
      const info = await sharp(source).resize(px, px, { fit: 'inside' }).webp({ quality }).toFile(target)
      keys.add(key)
      bytes += info.size
    }

    for (const file of files) {
      if (!file.isFile() || !/_(?:png|svg)\.(?:png|svg)$/i.test(file.name)) continue
      const source = path.join(file.parentPath, file.name)
      const key = getIconKey(
        path
          .relative(root, source)
          .replaceAll('\\', '/')
          .replace(/_(?:png|svg)\.(?:png|svg)$/i, '')
      )
      if (key) await addWebp(source, key)
    }

    // Retry any icons skipped by Source2Viewer-CLI due to newer RED2 KV3 metadata types.
    const missing = [...expected].filter((key) => !keys.has(key))
    if (missing.length) {
      const donorRed2 = findDonorRed2(vpkIndex, keys)
      if (donorRed2) {
        const patchedDir = path.join(temp, 'patched')
        const fallbackOut = path.join(temp, 'fallback-out')
        await fs.promises.mkdir(fallbackOut, { recursive: true })
        for (const key of missing) {
          const raw = readEntry(vpkIndex, `panorama/images/${key}_png.vtex_c`)
          const patched = raw && patchVtexRed2(raw, donorRed2)
          if (!patched) continue
          const vtexPath = path.join(patchedDir, `${key}_png.vtex_c`)
          await fs.promises.mkdir(path.dirname(vtexPath), { recursive: true })
          await fs.promises.writeFile(vtexPath, patched)
          const pngOut = path.join(fallbackOut, `${key}_png.png`)
          await fs.promises.mkdir(path.dirname(pngOut), { recursive: true })
          try {
            execFileSync(viewer, ['-i', vtexPath, '-o', pngOut, '-d'], { env, stdio: 'ignore' })
            if (fs.existsSync(pngOut)) await addWebp(pngOut, key)
          } catch {
            // Skip individual files that still fail to decode.
          }
        }
      }
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
