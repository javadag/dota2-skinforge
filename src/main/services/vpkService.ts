/**
 * Valve Source 2 VPK Packing & Extraction Service
 */

import { execFile } from 'child_process'
import crypto from 'crypto'
import fs from 'fs'
import path from 'path'
import { crc32 } from '../../shared/utils/crc32'
import { getToolsPath } from './appPathService'
import { loadIndex, readEntry, type VpkIndex } from './vpkIndex'

export const VPKTOOL_PATH = getToolsPath('vpktool.exe')

export interface VpkToolResult {
  ok: boolean
  error?: string
  files?: string[]
  [key: string]: unknown
}

export interface VpkPackEntry {
  /** Relative path inside the VPK, e.g. 'scripts/items/items_game.txt' or 'models/heroes/axe/axe.vmdl_c' */
  vpkPath: string
  /** Source of data: absolute file path on disk, or Buffer in memory */
  source: string | Buffer
}

const indexCache = new Map<string, { mtime: number; index: VpkIndex }>()

/** Get or load a cached VpkIndex for in-process lookups. */
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

/** Clear cached VpkIndex instances if files change. */
export function clearVpkIndexCache(): void {
  indexCache.clear()
}

function runVpkTool(args: string[]): Promise<VpkToolResult | string> {
  return new Promise((resolve, reject) => {
    execFile(VPKTOOL_PATH, args, { maxBuffer: 1024 * 1024 * 32 }, (error, stdout, stderr) => {
      if (error && !stdout) {
        return reject(new Error(stderr || error.message))
      }
      try {
        const parsed = JSON.parse(stdout.trim()) as VpkToolResult
        if (!parsed.ok) {
          return reject(new Error(parsed.error || 'VPK tool error'))
        }
        resolve(parsed)
      } catch {
        if (error) return reject(error)
        resolve(stdout)
      }
    })
  })
}

export async function list(vpkPath: string): Promise<VpkToolResult | string> {
  return await runVpkTool(['list', path.resolve(vpkPath)])
}

/**
 * Extract a single file from a VPK. Uses the in-process pure TypeScript reader first
 * for 0.5ms extraction, falling back to vpktool.exe if needed.
 */
export async function extract(vpkPath: string, internalPath: string, outFilePath: string): Promise<VpkToolResult | string> {
  const resolvedOut = path.resolve(outFilePath)
  const outDir = path.dirname(resolvedOut)
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true })
  }

  try {
    const index = getOrLoadVpkIndex(vpkPath)
    const clean = internalPath.replace(/\\/g, '/').replace(/^\//, '')
    const bytes = readEntry(index, clean) ?? (clean.endsWith('_c') ? null : readEntry(index, `${clean}_c`))
    if (bytes) {
      fs.writeFileSync(resolvedOut, bytes)
      return { ok: true, files: [resolvedOut] }
    }
  } catch {
    // Pure TypeScript reader fallback to vpktool.exe
  }

  return await runVpkTool(['extract', path.resolve(vpkPath), internalPath, resolvedOut])
}

export async function unpack(vpkPath: string, outDir: string): Promise<VpkToolResult | string> {
  const resolvedOutDir = path.resolve(outDir)
  if (!fs.existsSync(resolvedOutDir)) {
    fs.mkdirSync(resolvedOutDir, { recursive: true })
  }
  return await runVpkTool(['unpack', path.resolve(vpkPath), resolvedOutDir])
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

export interface PackMultiChunkResult {
  ok: boolean
  filesCount: number
  dirVpk: string
  chunkVpk: string
}

/**
 * Source 2 multi-chunk VPK packer (pak01_dir.vpk + pak01_000.vpk).
 * Supports both directory walking and direct in-memory Virtual VPK entry arrays.
 */
export function packMultiChunk(src: string | VpkPackEntry[], outDirVpkPath: string): PackMultiChunkResult {
  const resolvedDirVpk = path.resolve(outDirVpkPath)
  const vpkDir = path.dirname(resolvedDirVpk)
  if (!fs.existsSync(vpkDir)) {
    fs.mkdirSync(vpkDir, { recursive: true })
  }

  const basePrefix = path.basename(resolvedDirVpk).replace(/_dir\.vpk$/i, '')
  const outChunkVpkPath = path.join(vpkDir, `${basePrefix}_000.vpk`)

  // 1. Gather all files
  const fileEntries: FileEntry[] = []

  if (typeof src === 'string') {
    function walk(currentDir: string, relDir: string): void {
      const listFiles = fs.readdirSync(currentDir)
      for (const item of listFiles) {
        const full = path.join(currentDir, item)
        const rel = relDir ? `${relDir}/${item}` : item
        const stat = fs.statSync(full)
        if (stat.isDirectory()) {
          walk(full, rel)
        } else {
          const ext = path.extname(item).replace(/^\./, '').toLowerCase()
          const base = path.basename(item, path.extname(item))
          const dir = relDir ? relDir.replace(/\\/g, '/').toLowerCase() : ' '
          fileEntries.push({
            ext,
            dir,
            base,
            size: stat.size,
            source: full
          })
        }
      }
    }
    walk(src, '')
  } else {
    for (const entry of src) {
      const cleanPath = entry.vpkPath.replace(/\\/g, '/').replace(/^\//, '')
      const ext = path.extname(cleanPath).replace(/^\./, '').toLowerCase()
      const base = path.basename(cleanPath, path.extname(cleanPath))
      const dirName = path.dirname(cleanPath).replace(/\\/g, '/').toLowerCase()
      const dir = dirName === '.' ? ' ' : dirName
      const size = Buffer.isBuffer(entry.source) ? entry.source.length : fs.statSync(entry.source).size

      fileEntries.push({
        ext,
        dir,
        base,
        size,
        source: entry.source
      })
    }
  }

  // 2. Sort by ext -> dir -> base
  fileEntries.sort((a, b) => {
    if (a.ext !== b.ext) return a.ext.localeCompare(b.ext)
    if (a.dir !== b.dir) return a.dir.localeCompare(b.dir)
    return a.base.localeCompare(b.base)
  })

  // 3. Write data chunk (pak01_000.vpk)
  const chunkFd = fs.openSync(outChunkVpkPath, 'w')
  let currentOffset = 0
  for (const entry of fileEntries) {
    const buf = Buffer.isBuffer(entry.source) ? entry.source : fs.readFileSync(entry.source)
    entry.crc = crc32(buf)
    entry.offset = currentOffset
    fs.writeSync(chunkFd, buf, 0, buf.length, currentOffset)
    currentOffset += buf.length
  }
  fs.closeSync(chunkFd)

  // 4. Build Tree
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
        entryBuf.writeUInt32LE(f.crc || 0, 0) // CRC32
        entryBuf.writeUInt16LE(0, 4) // PreloadBytes = 0
        entryBuf.writeUInt16LE(0, 6) // ArchiveIndex = 0 (pak01_000.vpk)
        entryBuf.writeUInt32LE(f.offset || 0, 8) // EntryOffset
        entryBuf.writeUInt32LE(f.size, 12) // EntryLength
        entryBuf.writeUInt16LE(0xffff, 16) // Terminator
        treeChunks.push(entryBuf)
      }
      treeChunks.push(Buffer.from([0])) // End of files for dir
    }
    treeChunks.push(Buffer.from([0])) // End of dirs for ext
  }
  treeChunks.push(Buffer.from([0])) // End of extensions

  const treeBuffer = Buffer.concat(treeChunks)

  // 5. Build Header
  const header = Buffer.alloc(28)
  header.writeUInt32LE(0x55aa1234, 0) // Signature
  header.writeUInt32LE(2, 4) // Version 2
  header.writeUInt32LE(treeBuffer.length, 8) // TreeSize
  header.writeUInt32LE(0, 12) // FileDataSectionSize = 0 (data is in 000.vpk)
  header.writeUInt32LE(0, 16) // ArchiveMD5SectionSize
  header.writeUInt32LE(48, 20) // OtherMD5SectionSize
  header.writeUInt32LE(0, 24) // SignatureSectionSize

  // 6. Build Footer (Other MD5 Section)
  const treeMD5 = crypto.createHash('md5').update(treeBuffer).digest()
  const archiveMD5 = crypto.createHash('md5').update(Buffer.alloc(0)).digest()
  const partialBuf = Buffer.concat([header, treeBuffer, treeMD5, archiveMD5])
  const wholeMD5 = crypto.createHash('md5').update(partialBuf).digest()
  const footer = Buffer.concat([treeMD5, archiveMD5, wholeMD5])

  // 7. Write pak01_dir.vpk
  fs.writeFileSync(resolvedDirVpk, Buffer.concat([header, treeBuffer, footer]))

  return {
    ok: true,
    filesCount: fileEntries.length,
    dirVpk: resolvedDirVpk,
    chunkVpk: outChunkVpkPath
  }
}

export async function pack(src: string | VpkPackEntry[], outVpkPath: string): Promise<PackMultiChunkResult | VpkToolResult | string> {
  const resolvedOutVpk = path.resolve(outVpkPath)
  if (Array.isArray(src) || resolvedOutVpk.toLowerCase().endsWith('_dir.vpk')) {
    return packMultiChunk(src, resolvedOutVpk)
  }
  return await runVpkTool(['pack', path.resolve(src), resolvedOutVpk])
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    list,
    extract,
    unpack,
    pack,
    packMultiChunk,
    getOrLoadVpkIndex,
    clearVpkIndexCache,
    VPKTOOL_PATH
  }
}
