/**
 * Valve Source 2 VPK v2 Index Reader, Header Verifier, and Multi-Chunk Packer
 */

import crypto from 'crypto'
import fs from 'fs'
import path from 'path'
import { crc32 } from './crc32'

export interface VpkEntry {
  archive: number
  offset: number
  length: number
  preload: Buffer
}

export interface VpkIndex {
  entries: Map<string, VpkEntry>
  dir: string
  prefix?: string
}

export interface VpkExtractResult {
  ok: boolean
  files: string[]
}

export interface VpkListResult {
  ok: boolean
  count: number
  totalBytes: number
  entries: Array<{ path: string; len: number }>
}

export interface VpkPackEntry {
  /** Relative path inside the VPK, e.g. 'scripts/items/items_game.txt' or 'models/heroes/axe/axe.vmdl_c' */
  vpkPath: string
  /** Source of data: absolute file path on disk, or Buffer in memory */
  source: string | Buffer
}

export interface VpkPackResult {
  ok: boolean
  filesCount: number
  dirVpk: string
  chunkVpk: string
}

const VPK_MAGIC = 0x55aa1234

function readCString(buf: Buffer, pos: number): { value: string; next: number } {
  let end = pos
  while (end < buf.length && buf[end] !== 0) end++
  return { value: buf.toString('utf8', pos, end), next: end + 1 }
}

/** Verify that a packed `pak01_dir.vpk` carries a valid VPK v2 header. */
export function assertDirVpk(dirVpk: string): void {
  const header = Buffer.alloc(12)
  const fd = fs.openSync(dirVpk, 'r')
  let bytesRead: number
  try {
    bytesRead = fs.readSync(fd, header, 0, 12, 0)
  } finally {
    fs.closeSync(fd)
  }
  if (bytesRead < 12 || header.readUInt32LE(0) !== VPK_MAGIC || header.readUInt32LE(4) !== 2) {
    throw new Error(`Packed dir VPK failed its header check: ${dirVpk}`)
  }
}

/** Parse `pak01_dir.vpk` (index only). Prefer `getOrLoadVpkIndex` for repeated lookups. */
export function loadIndex(dirVpk: string): VpkIndex {
  const buf = fs.readFileSync(dirVpk)
  if (buf.length < 28) throw new Error(`truncated VPK header: ${dirVpk}`)
  if (buf.readUInt32LE(0) !== VPK_MAGIC) throw new Error(`not a VPK: ${dirVpk}`)
  const version = buf.readUInt32LE(4)
  if (version !== 2) throw new Error(`unsupported VPK version ${version}`)
  const treeSize = buf.readUInt32LE(8)
  // Valve's v2 header carries 12 extra bytes between the fixed header and the tree.
  const treeStart = 28
  const treeEnd = treeStart + treeSize
  if (treeEnd > buf.length) throw new Error(`truncated VPK directory tree: ${dirVpk}`)

  const entries = new Map<string, VpkEntry>()
  let pos = treeStart
  while (pos < treeEnd) {
    const ext = readCString(buf, pos)
    pos = ext.next
    if (ext.value === '') break
    while (pos < treeEnd) {
      const dir = readCString(buf, pos)
      pos = dir.next
      if (dir.value === '') break
      while (pos < treeEnd) {
        const file = readCString(buf, pos)
        pos = file.next
        if (file.value === '') break
        if (pos + 4 > treeEnd) throw new Error(`truncated VPK entry at ${pos}`)
        const crc = buf.readUInt32LE(pos)
        if (crc === 0xffffffff) {
          pos += 4
          continue
        }
        if (pos + 18 > treeEnd) throw new Error(`truncated VPK entry metadata at ${pos}`)
        const preloadBytes = buf.readUInt16LE(pos + 4)
        const archive = buf.readUInt16LE(pos + 6)
        const offset = buf.readUInt32LE(pos + 8)
        const length = buf.readUInt32LE(pos + 12)
        const terminator = buf.readUInt16LE(pos + 16)
        pos += 18
        if (terminator !== 0xffff) throw new Error(`bad entry terminator at ${pos - 2}`)
        if (pos + preloadBytes > treeEnd) throw new Error(`truncated VPK preload data at ${pos}`)
        const preload = Buffer.from(buf.subarray(pos, pos + preloadBytes))
        pos += preloadBytes
        const baseName = ext.value === ' ' ? file.value : `${file.value}.${ext.value}`
        const name = dir.value === ' ' ? baseName : `${dir.value}/${baseName}`
        entries.set(name, { archive, offset, length, preload })
      }
    }
  }

  const prefix = path.basename(dirVpk).replace(/_dir\.vpk$/i, '') || 'pak01'
  return { entries, dir: path.dirname(dirVpk), prefix }
}

const indexCache = new Map<string, { mtime: number; index: VpkIndex }>()

/** Get or load a cached `VpkIndex` invalidated by `mtimeMs`. */
export function getOrLoadVpkIndex(vpkPath: string): VpkIndex {
  const resolved = path.resolve(vpkPath)
  const stat = fs.statSync(resolved)
  const cached = indexCache.get(resolved)
  if (cached && cached.mtime === stat.mtimeMs) {
    return cached.index
  }
  const index = loadIndex(resolved)
  indexCache.set(resolved, { mtime: stat.mtimeMs, index })
  return index
}

/** Exact file bytes from a `VpkIndex`, or `null` when absent. */
export function readEntry(index: VpkIndex, name: string): Buffer | null {
  const entry = index.entries.get(name)
  if (!entry) return null
  if (entry.archive === 0x7fff) return Buffer.from(entry.preload)
  const prefix = index.prefix || 'pak01'
  const chunk = path.join(index.dir, `${prefix}_${String(entry.archive).padStart(3, '0')}.vpk`)
  const fd = fs.openSync(chunk, 'r')
  try {
    const out = Buffer.alloc(entry.preload.length + entry.length)
    entry.preload.copy(out, 0)
    let readTotal = 0
    while (readTotal < entry.length) {
      const n = fs.readSync(fd, out, entry.preload.length + readTotal, entry.length - readTotal, entry.offset + readTotal)
      if (n === 0) throw new Error(`Truncated VPK chunk "${chunk}" while reading "${name}"`)
      readTotal += n
    }
    return out
  } finally {
    fs.closeSync(fd)
  }
}

/** Read a VPK entry normalizing slashes, optionally falling back to `<path>_c`. */
export function readVpkEntry(index: VpkIndex, internalPath: string, options?: { fallbackCompiled?: boolean }): Buffer | null {
  const clean = internalPath.replace(/\\/g, '/').replace(/^\//, '')
  const exact = readEntry(index, clean)
  if (exact || !options?.fallbackCompiled || clean.endsWith('_c')) return exact
  return readEntry(index, `${clean}_c`)
}

export function extract(vpkPath: string, internalPath: string, outFilePath: string): VpkExtractResult {
  const resolvedOut = path.resolve(outFilePath)
  fs.mkdirSync(path.dirname(resolvedOut), { recursive: true })

  const index = getOrLoadVpkIndex(vpkPath)
  const bytes = readVpkEntry(index, internalPath, { fallbackCompiled: true })
  if (bytes) {
    fs.writeFileSync(resolvedOut, bytes)
    return { ok: true, files: [resolvedOut] }
  }

  throw new Error(`File "${internalPath}" not found in VPK "${vpkPath}"`)
}

export function list(vpkPath: string): VpkListResult {
  const index = getOrLoadVpkIndex(vpkPath)
  const entries: Array<{ path: string; len: number }> = []
  let totalBytes = 0
  for (const [filePath, entry] of index.entries.entries()) {
    entries.push({ path: filePath, len: entry.length })
    totalBytes += entry.length
  }
  return {
    ok: true,
    count: entries.length,
    totalBytes,
    entries
  }
}

interface FileEntry {
  ext: string
  dir: string
  base: string
  size: number
  source: string | Buffer
  crc?: number
  offset?: number
}

/**
 * Source 2 multi-chunk VPK packer (`pak01_dir.vpk` + `pak01_000.vpk`).
 * Supports both directory walking and direct in-memory virtual VPK entry arrays.
 */
export function packVpk(src: string | VpkPackEntry[], outDirVpkPath: string): VpkPackResult {
  const resolvedDirVpk = path.resolve(outDirVpkPath)
  const vpkDir = path.dirname(resolvedDirVpk)
  fs.mkdirSync(vpkDir, { recursive: true })

  const basePrefix = path.basename(resolvedDirVpk).replace(/_dir\.vpk$/i, '')
  const outChunkVpkPath = path.join(vpkDir, `${basePrefix}_000.vpk`)

  const fileEntries: FileEntry[] = []

  if (typeof src === 'string') {
    const items = fs.readdirSync(src, { recursive: true, withFileTypes: true })
    for (const item of items) {
      if (!item.isFile()) continue
      const full = path.join(item.parentPath, item.name)
      const rel = path.relative(src, full).replace(/\\/g, '/')
      const ext = path.extname(item.name).replace(/^\./, '').toLowerCase() || ' '
      const base = path.basename(item.name, path.extname(item.name))
      const dirName = path.dirname(rel).replace(/\\/g, '/').toLowerCase()
      const dir = dirName === '.' ? ' ' : dirName
      fileEntries.push({
        ext,
        dir,
        base,
        size: fs.statSync(full).size,
        source: full
      })
    }
  } else {
    for (const entry of src) {
      const cleanPath = entry.vpkPath.replace(/\\/g, '/').replace(/^\//, '')
      const ext = path.extname(cleanPath).replace(/^\./, '').toLowerCase() || ' '
      const base = path.basename(cleanPath, path.extname(cleanPath))
      const dirName = path.dirname(cleanPath).replace(/\\/g, '/').toLowerCase()
      const dir = dirName === '.' ? ' ' : dirName
      const size = Buffer.isBuffer(entry.source) ? entry.source.length : fs.statSync(entry.source).size
      fileEntries.push({ ext, dir, base, size, source: entry.source })
    }
  }

  fileEntries.sort((a, b) => {
    if (a.ext !== b.ext) return a.ext.localeCompare(b.ext)
    if (a.dir !== b.dir) return a.dir.localeCompare(b.dir)
    return a.base.localeCompare(b.base)
  })

  const chunkFd = fs.openSync(outChunkVpkPath, 'w')
  try {
    let currentOffset = 0
    for (const entry of fileEntries) {
      const buf = Buffer.isBuffer(entry.source) ? entry.source : fs.readFileSync(entry.source)
      entry.size = buf.length
      entry.crc = crc32(buf)
      entry.offset = currentOffset
      fs.writeSync(chunkFd, buf, 0, buf.length, currentOffset)
      currentOffset += buf.length
    }
  } finally {
    fs.closeSync(chunkFd)
  }

  const treeChunks: Buffer[] = []
  const byExt = new Map<string, Map<string, FileEntry[]>>()
  for (const e of fileEntries) {
    if (!byExt.has(e.ext)) byExt.set(e.ext, new Map())
    const byDir = byExt.get(e.ext)!
    if (!byDir.has(e.dir)) byDir.set(e.dir, [])
    byDir.get(e.dir)!.push(e)
  }

  for (const [ext, dirs] of byExt.entries()) {
    treeChunks.push(Buffer.from(ext + '\0', 'utf-8'))
    for (const [dir, files] of dirs.entries()) {
      treeChunks.push(Buffer.from(dir + '\0', 'utf-8'))
      for (const f of files) {
        treeChunks.push(Buffer.from(f.base + '\0', 'utf-8'))
        const entryBuf = Buffer.alloc(18)
        entryBuf.writeUInt32LE(f.crc || 0, 0)
        entryBuf.writeUInt16LE(0, 4)
        entryBuf.writeUInt16LE(0, 6)
        entryBuf.writeUInt32LE(f.offset || 0, 8)
        entryBuf.writeUInt32LE(f.size, 12)
        entryBuf.writeUInt16LE(0xffff, 16)
        treeChunks.push(entryBuf)
      }
      treeChunks.push(Buffer.from([0]))
    }
    treeChunks.push(Buffer.from([0]))
  }
  treeChunks.push(Buffer.from([0]))

  const treeBuffer = Buffer.concat(treeChunks)

  const header = Buffer.alloc(28)
  header.writeUInt32LE(VPK_MAGIC, 0)
  header.writeUInt32LE(2, 4)
  header.writeUInt32LE(treeBuffer.length, 8)
  header.writeUInt32LE(0, 12)
  header.writeUInt32LE(0, 16)
  header.writeUInt32LE(48, 20)
  header.writeUInt32LE(0, 24)

  const treeMD5 = crypto.createHash('md5').update(treeBuffer).digest()
  const archiveMD5 = crypto.createHash('md5').update(Buffer.alloc(0)).digest()
  const partialBuf = Buffer.concat([header, treeBuffer, treeMD5, archiveMD5])
  const wholeMD5 = crypto.createHash('md5').update(partialBuf).digest()
  const footer = Buffer.concat([treeMD5, archiveMD5, wholeMD5])

  fs.writeFileSync(resolvedDirVpk, Buffer.concat([header, treeBuffer, footer]))

  return {
    ok: true,
    filesCount: fileEntries.length,
    dirVpk: resolvedDirVpk,
    chunkVpk: outChunkVpkPath
  }
}
