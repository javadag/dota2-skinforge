/**
 * Minimal VPK v2 reader.
 *
 * `vpktool list` truncates its output, and one `extract` per file costs ~0.3 s, which makes
 * "does this asset exist" the slowest thing in the pipeline. The index is a plain structure
 * at the top of `pak01_dir.vpk`, so reading it directly gives every path at once and lets
 * us pull file bytes straight out of the archive chunks.
 */
import fs from 'fs'
import path from 'path'

export interface VpkEntry {
  archive: number
  offset: number
  length: number
  preload: Buffer
}

export interface VpkIndex {
  entries: Map<string, VpkEntry>
  dir: string
}

const MAGIC = 0x55aa1234

function readCString(buf: Buffer, pos: number): { value: string; next: number } {
  let end = pos
  while (end < buf.length && buf[end] !== 0) end++
  return { value: buf.toString('utf8', pos, end), next: end + 1 }
}

/** Parse `pak01_dir.vpk` (index only). */
export function loadIndex(dirVpk: string): VpkIndex {
  const buf = fs.readFileSync(dirVpk)
  if (buf.readUInt32LE(0) !== MAGIC) throw new Error(`not a VPK: ${dirVpk}`)
  const version = buf.readUInt32LE(4)
  if (version !== 2) throw new Error(`unsupported VPK version ${version}`)
  const treeSize = buf.readUInt32LE(8)
  // Valve's v2 header carries 12 extra bytes between the fixed header and the tree
  // (signature-section bookkeeping). Verified against Dota's pak01_dir.vpk.
  const treeStart = 28
  const treeEnd = treeStart + treeSize

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
        // v2 stores exactly one 18-byte entry per file name.
        const crc = buf.readUInt32LE(pos)
        if (crc === 0xffffffff) {
          pos += 4
          continue
        }
        const preloadBytes = buf.readUInt16LE(pos + 4)
        const archive = buf.readUInt16LE(pos + 6)
        const offset = buf.readUInt32LE(pos + 8)
        const length = buf.readUInt32LE(pos + 12)
        const terminator = buf.readUInt16LE(pos + 16)
        pos += 18
        if (terminator !== 0xffff) throw new Error(`bad entry terminator at ${pos - 2}`)
        const preload = Buffer.from(buf.subarray(pos, pos + preloadBytes))
        pos += preloadBytes
        const name = ext.value === ' ' ? `${dir.value}/${file.value}` : `${dir.value}/${file.value}.${ext.value}`
        entries.set(name, { archive, offset, length, preload })
      }
    }
  }

  return { entries, dir: path.dirname(dirVpk) }
}

/** File bytes, or null when the path is not in the archive. */
export function readEntry(index: VpkIndex, name: string): Buffer | null {
  const entry = index.entries.get(name)
  if (!entry) return null
  if (entry.archive === 0x7fff) return Buffer.from(entry.preload)
  const chunk = path.join(index.dir, `pak01_${String(entry.archive).padStart(3, '0')}.vpk`)
  const fd = fs.openSync(chunk, 'r')
  try {
    const out = Buffer.alloc(entry.preload.length + entry.length)
    entry.preload.copy(out, 0)
    if (entry.length > 0) fs.readSync(fd, out, entry.preload.length, entry.length, entry.offset)
    return out
  } finally {
    fs.closeSync(fd)
  }
}
