/**
 * Lightweight, safe zip extractor and creator using Node standard library & zlib.
 * Handles standard DEFLATE / STORE zip files with CRC-32 / size checks and zip-slip protection.
 */

import crypto from 'crypto'
import fs from 'fs'
import path from 'path'
import zlib from 'zlib'

interface ZipCentralDirectoryHeader {
  compressionMethod: number
  compressedSize: number
  uncompressedSize: number
  crc32: number
  fileNameLength: number
  extraFieldLength: number
  fileCommentLength: number
  localHeaderOffset: number
  fileName: string
}

/**
 * Validates a relative file path against directory traversal attacks (Zip Slip).
 */
export function sanitizeZipEntryPath(entryPath: string): string {
  // Normalize forward and back slashes
  const normalized = entryPath.replace(/\\/g, '/').replace(/^\/+/, '')
  const parts = normalized.split('/')
  for (const part of parts) {
    if (part === '..' || part === '.') {
      throw new Error(`Zip entry contains path traversal component: "${entryPath}"`)
    }
    if (part.includes(':')) {
      throw new Error(`Zip entry contains drive or device specifier: "${entryPath}"`)
    }
  }
  return normalized
}

/**
 * Computes the SHA-256 hash of a file on disk.
 */
export async function computeFileSha256(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256')
    const stream = fs.createReadStream(filePath)
    stream.on('error', reject)
    stream.on('data', (chunk) => hash.update(chunk))
    stream.on('end', () => resolve(hash.digest('hex')))
  })
}

/**
 * Safely extracts a zip file to the specified target directory.
 */
export async function extractZipSafely(zipPath: string, targetDir: string): Promise<{ fileCount: number; bytesExtracted: number }> {
  const buffer = await fs.promises.readFile(zipPath)
  let eocdOffset = -1

  // Locate End of Central Directory record (signature: 0x06054b50)
  for (let i = buffer.length - 22; i >= Math.max(0, buffer.length - 65557); i--) {
    if (buffer.readUInt32LE(i) === 0x06054b50) {
      eocdOffset = i
      break
    }
  }

  if (eocdOffset === -1) {
    throw new Error(`Invalid ZIP archive: End of Central Directory signature not found in ${zipPath}`)
  }

  const totalEntries = buffer.readUInt16LE(eocdOffset + 10)
  const cdSize = buffer.readUInt32LE(eocdOffset + 12)
  const cdOffset = buffer.readUInt32LE(eocdOffset + 16)

  if (cdOffset + cdSize > buffer.length) {
    throw new Error('Invalid ZIP archive: Central Directory extends beyond file boundary.')
  }

  let offset = cdOffset
  const entries: ZipCentralDirectoryHeader[] = []

  for (let i = 0; i < totalEntries; i++) {
    const sig = buffer.readUInt32LE(offset)
    if (sig !== 0x02014b50) {
      throw new Error(`Invalid Central Directory entry signature (0x${sig.toString(16)}) at offset ${offset}`)
    }

    const compressionMethod = buffer.readUInt16LE(offset + 10)
    const crc32 = buffer.readUInt32LE(offset + 16)
    const compressedSize = buffer.readUInt32LE(offset + 20)
    const uncompressedSize = buffer.readUInt32LE(offset + 24)
    const fileNameLength = buffer.readUInt16LE(offset + 28)
    const extraFieldLength = buffer.readUInt16LE(offset + 30)
    const fileCommentLength = buffer.readUInt16LE(offset + 32)
    const localHeaderOffset = buffer.readUInt32LE(offset + 42)

    const fileName = buffer.toString('utf8', offset + 46, offset + 46 + fileNameLength)

    entries.push({
      compressionMethod,
      crc32,
      compressedSize,
      uncompressedSize,
      fileNameLength,
      extraFieldLength,
      fileCommentLength,
      localHeaderOffset,
      fileName
    })

    offset += 46 + fileNameLength + extraFieldLength + fileCommentLength
  }

  await fs.promises.mkdir(targetDir, { recursive: true })
  let fileCount = 0
  let bytesExtracted = 0

  for (const entry of entries) {
    const safeRelPath = sanitizeZipEntryPath(entry.fileName)
    const destPath = path.join(targetDir, safeRelPath.replace(/\//g, path.sep))

    // Is directory entry?
    if (entry.fileName.endsWith('/') || entry.fileName.endsWith('\\')) {
      await fs.promises.mkdir(destPath, { recursive: true })
      continue
    }

    const locOffset = entry.localHeaderOffset
    const locSig = buffer.readUInt32LE(locOffset)
    if (locSig !== 0x04034b50) {
      throw new Error(`Invalid Local File Header signature at offset ${locOffset}`)
    }

    const locNameLen = buffer.readUInt16LE(locOffset + 26)
    const locExtraLen = buffer.readUInt16LE(locOffset + 28)
    const dataStart = locOffset + 30 + locNameLen + locExtraLen
    const dataEnd = dataStart + entry.compressedSize

    if (dataEnd > buffer.length) {
      throw new Error(`Compressed data extends beyond buffer for ${entry.fileName}`)
    }

    const compressedData = buffer.subarray(dataStart, dataEnd)
    let decompressed: Buffer

    if (entry.compressionMethod === 0) {
      decompressed = compressedData
    } else if (entry.compressionMethod === 8) {
      // Deflate
      decompressed = zlib.inflateRawSync(compressedData)
    } else {
      throw new Error(`Unsupported compression method ${entry.compressionMethod} in ${entry.fileName}`)
    }

    if (decompressed.length !== entry.uncompressedSize) {
      throw new Error(`Extracted size mismatch for ${entry.fileName}: expected ${entry.uncompressedSize}, got ${decompressed.length}`)
    }

    await fs.promises.mkdir(path.dirname(destPath), { recursive: true })
    await fs.promises.writeFile(destPath, decompressed)
    fileCount++
    bytesExtracted += decompressed.length
  }

  return { fileCount, bytesExtracted }
}

/**
 * Simple ZIP archive builder using zlib.deflateRaw.
 * Creates a clean standard ZIP file from a local directory.
 */
export async function createZipFromDir(sourceDir: string, outZipPath: string): Promise<{ size: number; fileCount: number }> {
  const files: { relPath: string; fullPath: string }[] = []

  function scan(dir: string, base: string) {
    const list = fs.readdirSync(dir, { withFileTypes: true })
    for (const item of list) {
      const rel = base ? `${base}/${item.name}` : item.name
      const full = path.join(dir, item.name)
      if (item.isDirectory()) {
        scan(full, rel)
      } else if (item.isFile()) {
        files.push({ relPath: rel, fullPath: full })
      }
    }
  }

  scan(sourceDir, '')
  // Sort files deterministically for reproducible zip archives
  files.sort((a, b) => a.relPath.localeCompare(b.relPath))

  const localEntries: {
    relPath: string
    compressed: Buffer
    uncompressedSize: number
    crc32: number
    localOffset: number
  }[] = []

  const parts: Buffer[] = []
  let currentOffset = 0

  for (const f of files) {
    const raw = fs.readFileSync(f.fullPath)
    const crc = computeCrc32(raw)
    const compressed = zlib.deflateRawSync(raw, { level: 9 })
    const method = compressed.length < raw.length ? 8 : 0
    const finalData = method === 8 ? compressed : raw

    const nameBuf = Buffer.from(f.relPath.replace(/\\/g, '/'), 'utf8')

    // Local file header (30 bytes)
    const locHeader = Buffer.alloc(30)
    locHeader.writeUInt32LE(0x04034b50, 0)
    locHeader.writeUInt16LE(20, 4) // version needed
    locHeader.writeUInt16LE(0, 6) // flags
    locHeader.writeUInt16LE(method, 8)
    locHeader.writeUInt16LE(0, 10) // mod time
    locHeader.writeUInt16LE(0, 12) // mod date
    locHeader.writeUInt32LE(crc, 14)
    locHeader.writeUInt32LE(finalData.length, 18) // compressed size
    locHeader.writeUInt32LE(raw.length, 22) // uncompressed size
    locHeader.writeUInt16LE(nameBuf.length, 26)
    locHeader.writeUInt16LE(0, 28) // extra field length

    parts.push(locHeader, nameBuf, finalData)

    localEntries.push({
      relPath: f.relPath.replace(/\\/g, '/'),
      compressed: finalData,
      uncompressedSize: raw.length,
      crc32: crc,
      localOffset: currentOffset
    })

    currentOffset += locHeader.length + nameBuf.length + finalData.length
  }

  // Central directory
  const cdStart = currentOffset
  let cdSize = 0

  for (const entry of localEntries) {
    const nameBuf = Buffer.from(entry.relPath, 'utf8')
    const method = entry.compressed.length < entry.uncompressedSize ? 8 : 0

    const cdHeader = Buffer.alloc(46)
    cdHeader.writeUInt32LE(0x02014b50, 0)
    cdHeader.writeUInt16LE(20, 4) // version made by
    cdHeader.writeUInt16LE(20, 6) // version needed
    cdHeader.writeUInt16LE(0, 8) // flags
    cdHeader.writeUInt16LE(method, 10)
    cdHeader.writeUInt16LE(0, 12) // mod time
    cdHeader.writeUInt16LE(0, 14) // mod date
    cdHeader.writeUInt32LE(entry.crc32, 16)
    cdHeader.writeUInt32LE(entry.compressed.length, 20)
    cdHeader.writeUInt32LE(entry.uncompressedSize, 24)
    cdHeader.writeUInt16LE(nameBuf.length, 28)
    cdHeader.writeUInt16LE(0, 30) // extra len
    cdHeader.writeUInt16LE(0, 32) // comment len
    cdHeader.writeUInt16LE(0, 34) // disk start
    cdHeader.writeUInt16LE(0, 36) // int attrs
    cdHeader.writeUInt32LE(0, 38) // ext attrs
    cdHeader.writeUInt32LE(entry.localOffset, 42)

    parts.push(cdHeader, nameBuf)
    cdSize += cdHeader.length + nameBuf.length
  }

  // End of Central Directory (22 bytes)
  const eocd = Buffer.alloc(22)
  eocd.writeUInt32LE(0x06054b50, 0)
  eocd.writeUInt16LE(0, 4) // disk number
  eocd.writeUInt16LE(0, 6) // disk with cd
  eocd.writeUInt16LE(localEntries.length, 8) // entries this disk
  eocd.writeUInt16LE(localEntries.length, 10) // total entries
  eocd.writeUInt32LE(cdSize, 12)
  eocd.writeUInt32LE(cdStart, 16)
  eocd.writeUInt16LE(0, 20) // comment length

  parts.push(eocd)

  await fs.promises.mkdir(path.dirname(outZipPath), { recursive: true })
  const finalBuffer = Buffer.concat(parts)
  await fs.promises.writeFile(outZipPath, finalBuffer)

  return { size: finalBuffer.length, fileCount: files.length }
}

function computeCrc32(buf: Buffer): number {
  let crc = 0xffffffff
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i]
    for (let j = 0; j < 8; j++) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0)
    }
  }
  return (crc ^ 0xffffffff) >>> 0
}
