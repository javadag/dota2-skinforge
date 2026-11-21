/**
 * Safe, zero-dependency Archive & Checksum Utilities (.tar.br + SHA-256).
 * Uses Node.js standard library and zlib with Zip-Slip path traversal protection,
 * GNU LongLink support for arbitrary file path lengths, and memoized directory creation.
 */

import crypto from 'crypto'
import fs from 'fs'
import path from 'path'
import { promisify } from 'util'
import zlib from 'zlib'

const brotliDecompressAsync = promisify(zlib.brotliDecompress)

/**
 * Computes the SHA-256 hex digest of a file on disk.
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
 * Validates a relative archive entry path against directory traversal and drive specifiers.
 */
export function sanitizeArchiveEntryPath(entryPath: string): string {
  const normalized = entryPath.replace(/\\/g, '/').replace(/^\/+/, '').replace(/\/+$/, '')
  if (!normalized) {
    throw new Error('Archive entry contains an empty path')
  }
  for (const part of normalized.split('/')) {
    if (!part || part === '..' || part === '.') {
      throw new Error(`Archive entry contains path traversal component: "${entryPath}"`)
    }
    if (part.includes(':')) {
      throw new Error(`Archive entry contains drive or device specifier: "${entryPath}"`)
    }
  }
  return normalized
}

function writeOctal(buf: Buffer, val: number, offset: number, length: number): void {
  const str = val.toString(8).padStart(length - 1, '0') + ' '
  buf.write(str, offset, length, 'utf8')
}

function createTarHeader(name: string, size: number, mode = 0o644, mtime = Math.floor(Date.now() / 1000), typeFlag = '0'): Buffer {
  const header = Buffer.alloc(512)
  header.write(name.slice(0, 100), 0, 100, 'utf8')
  writeOctal(header, mode, 100, 8)
  writeOctal(header, 0, 108, 8)
  writeOctal(header, 0, 116, 8)
  writeOctal(header, size, 124, 12)
  writeOctal(header, mtime, 136, 12)
  header.fill(32, 148, 156)
  header.write(typeFlag, 156, 1, 'utf8')
  header.write('ustar\0', 257, 6, 'utf8')
  header.write('00', 263, 2, 'utf8')

  let chk = 0
  for (let i = 0; i < 512; i++) chk += header[i]
  header.write(chk.toString(8).padStart(6, '0') + '\0 ', 148, 8, 'utf8')
  return header
}

/**
 * Creates an uncompressed TAR Buffer from a list of local files relative to baseDir.
 */
export function buildTarBuffer(baseDir: string, files: string[]): Buffer {
  const chunks: Buffer[] = []

  for (const fullPath of files) {
    const rel = path.relative(baseDir, fullPath).replace(/\\/g, '/')
    const stat = fs.statSync(fullPath)
    const content = fs.readFileSync(fullPath)

    if (Buffer.byteLength(rel, 'utf8') > 100) {
      const nameBuf = Buffer.from(rel, 'utf8')
      chunks.push(createTarHeader('././@LongLink', nameBuf.length + 1, 0o644, 0, 'L'))
      const paddedName = Buffer.alloc(Math.ceil((nameBuf.length + 1) / 512) * 512)
      nameBuf.copy(paddedName, 0)
      chunks.push(paddedName)
    }

    chunks.push(createTarHeader(rel, content.length, stat.mode & 0o777, Math.floor(stat.mtimeMs / 1000), '0'))
    chunks.push(content)

    const pad = (512 - (content.length % 512)) % 512
    if (pad > 0) chunks.push(Buffer.alloc(pad))
  }

  chunks.push(Buffer.alloc(1024))
  return Buffer.concat(chunks)
}

/**
 * Creates a `.tar.br` (Tar compressed with Brotli) archive from a local directory.
 */
export async function createTarBrotliFromDir(
  sourceDir: string,
  outTarBrPath: string,
  brotliQuality = 9
): Promise<{ size: number; fileCount: number }> {
  const entries = fs.readdirSync(sourceDir, { recursive: true, withFileTypes: true })
  const files = entries
    .filter((item) => item.isFile())
    .map((item) => path.join(item.parentPath, item.name))
    .sort((a, b) => {
      const relA = path.relative(sourceDir, a).replace(/\\/g, '/')
      const relB = path.relative(sourceDir, b).replace(/\\/g, '/')
      return relA.localeCompare(relB)
    })

  const tarBuffer = buildTarBuffer(sourceDir, files)
  const compressed = zlib.brotliCompressSync(tarBuffer, {
    params: {
      [zlib.constants.BROTLI_PARAM_QUALITY]: brotliQuality,
      [zlib.constants.BROTLI_PARAM_SIZE_HINT]: tarBuffer.length
    }
  })

  await fs.promises.mkdir(path.dirname(outTarBrPath), { recursive: true })
  await fs.promises.writeFile(outTarBrPath, compressed)
  return { size: compressed.length, fileCount: files.length }
}

/**
 * Parses and extracts a raw TAR buffer safely into targetDir, memoizing parent `mkdir` calls.
 */
export async function extractTarBufferSafely(
  tarBuffer: Buffer,
  targetDir: string,
  concurrency = 1
): Promise<{ fileCount: number; bytesExtracted: number }> {
  await fs.promises.mkdir(targetDir, { recursive: true })

  const dirPromises = new Map<string, Promise<unknown>>([[targetDir, Promise.resolve()]])
  const ensureDir = (dir: string): Promise<unknown> => {
    let existing = dirPromises.get(dir)
    if (!existing) {
      existing = fs.promises.mkdir(dir, { recursive: true })
      dirPromises.set(dir, existing)
    }
    return existing
  }

  let offset = 0
  let pendingLongLinkName: string | null = null
  let fileCount = 0
  let bytesExtracted = 0
  let sawEofZeroBlock = false
  const pendingWrites: Promise<void>[] = []
  let writeError: unknown

  try {
    while (offset + 512 <= tarBuffer.length) {
      const header = tarBuffer.subarray(offset, offset + 512)

      let isZero = true
      for (let i = 0; i < 512; i++) {
        if (header[i] !== 0) {
          isZero = false
          break
        }
      }
      if (isZero) {
        sawEofZeroBlock = true
        break
      }

      const sizeStr = header.toString('utf8', 124, 136).replace(/\0.*$/, '').trim()
      if (!/^[0-7]*$/.test(sizeStr)) {
        throw new Error(`Corrupted TAR archive: invalid octal size "${sizeStr}"`)
      }
      const size = sizeStr ? parseInt(sizeStr, 8) : 0
      if (!Number.isSafeInteger(size) || size < 0) {
        throw new Error(`Corrupted TAR archive: out-of-range size "${sizeStr}"`)
      }
      const typeFlag = String.fromCharCode(header[156] || 48)
      if (typeFlag !== '0' && typeFlag !== '5' && typeFlag !== 'L') {
        throw new Error(`Unsupported TAR entry type "${typeFlag}"`)
      }

      let entryName: string
      if (pendingLongLinkName) {
        entryName = pendingLongLinkName
        pendingLongLinkName = null
      } else {
        let nullIdx = 0
        while (nullIdx < 100 && header[nullIdx] !== 0) nullIdx++
        entryName = header.toString('utf8', 0, nullIdx)
      }

      offset += 512
      const blockCount = Math.ceil(size / 512)
      const dataEnd = offset + size
      const nextOffset = offset + blockCount * 512

      if (dataEnd > tarBuffer.length) {
        throw new Error(`Corrupted TAR archive: entry "${entryName}" extends beyond buffer`)
      }

      if (typeFlag === 'L') {
        const longNameBuf = tarBuffer.subarray(offset, dataEnd)
        let endIdx = 0
        while (endIdx < longNameBuf.length && longNameBuf[endIdx] !== 0) endIdx++
        pendingLongLinkName = longNameBuf.toString('utf8', 0, endIdx)
        offset = nextOffset
        continue
      }

      if (typeFlag === '5' || entryName.endsWith('/')) {
        const safeRel = sanitizeArchiveEntryPath(entryName)
        await ensureDir(path.join(targetDir, safeRel.replace(/\//g, path.sep)))
        offset = nextOffset
        continue
      }

      const safeRel = sanitizeArchiveEntryPath(entryName)
      const destPath = path.join(targetDir, safeRel.replace(/\//g, path.sep))
      const fileData = tarBuffer.subarray(offset, dataEnd)

      pendingWrites.push(
        ensureDir(path.dirname(destPath))
          .then(() => fs.promises.writeFile(destPath, fileData))
          .catch((error) => {
            writeError ??= error
          })
      )
      if (pendingWrites.length >= concurrency) {
        await pendingWrites.shift()
        if (writeError) break
      }

      fileCount++
      bytesExtracted += fileData.length
      offset = nextOffset
    }

    if (!writeError && !sawEofZeroBlock && offset < tarBuffer.length) {
      throw new Error('Corrupted TAR archive: truncated trailing header')
    }
  } finally {
    await Promise.allSettled(pendingWrites)
  }

  if (writeError) throw writeError

  return { fileCount, bytesExtracted }
}

/**
 * Safely extracts a `.tar.br` archive to targetDir with path traversal checks.
 */
export async function extractTarBrotliSafely(
  tarBrPath: string,
  targetDir: string,
  concurrency = 1
): Promise<{ fileCount: number; bytesExtracted: number }> {
  const compressed = await fs.promises.readFile(tarBrPath)
  const tarBuffer = await brotliDecompressAsync(compressed, { maxOutputLength: 512 * 1024 * 1024 })
  return extractTarBufferSafely(tarBuffer, targetDir, concurrency)
}
