/**
 * Safe, zero-dependency Tar and Tar+Brotli (.tar.br) creator and extractor.
 * Uses Node.js standard library and zlib with Zip-Slip path traversal protection
 * and GNU LongLink support for arbitrary file path lengths.
 */

import fs from 'fs'
import path from 'path'
import zlib from 'zlib'

/**
 * Validates a relative file path against directory traversal attacks.
 */
export function sanitizeTarEntryPath(entryPath: string): string {
  const normalized = entryPath.replace(/\\/g, '/').replace(/^\/+/, '')
  const parts = normalized.split('/')
  for (const part of parts) {
    if (part === '..' || part === '.') {
      throw new Error(`Tar entry contains path traversal component: "${entryPath}"`)
    }
    if (part.includes(':')) {
      throw new Error(`Tar entry contains drive or device specifier: "${entryPath}"`)
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
  // Name (0..99)
  header.write(name.slice(0, 100), 0, 100, 'utf8')
  // Mode (100..107)
  writeOctal(header, mode, 100, 8)
  // UID (108..115)
  writeOctal(header, 0, 108, 8)
  // GID (116..123)
  writeOctal(header, 0, 116, 8)
  // Size (124..135)
  writeOctal(header, size, 124, 12)
  // Mtime (136..147)
  writeOctal(header, mtime, 136, 12)
  // Checksum placeholder (spaces at 148..155)
  header.fill(32, 148, 156)
  // Typeflag (156)
  header.write(typeFlag, 156, 1, 'utf8')
  // Magic (257..262) & Version (263..264)
  header.write('ustar\0', 257, 6, 'utf8')
  header.write('00', 263, 2, 'utf8')

  // Calculate checksum (sum of all 512 bytes with checksum field treated as spaces)
  let chk = 0
  for (let i = 0; i < 512; i++) chk += header[i]
  const chkStr = chk.toString(8).padStart(6, '0') + '\0 '
  header.write(chkStr, 148, 8, 'utf8')

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

    // If filename > 100 bytes, prepend GNU LongLink header and block
    if (Buffer.byteLength(rel, 'utf8') > 100) {
      const nameBuf = Buffer.from(rel, 'utf8')
      const longLinkHeader = createTarHeader('././@LongLink', nameBuf.length + 1, 0o644, 0, 'L')
      chunks.push(longLinkHeader)

      const paddedName = Buffer.alloc(Math.ceil((nameBuf.length + 1) / 512) * 512)
      nameBuf.copy(paddedName, 0)
      chunks.push(paddedName)
    }

    const header = createTarHeader(rel, content.length, stat.mode & 0o777, Math.floor(stat.mtimeMs / 1000), '0')
    chunks.push(header)
    chunks.push(content)

    // Pad to 512-byte boundary
    const pad = (512 - (content.length % 512)) % 512
    if (pad > 0) {
      chunks.push(Buffer.alloc(pad))
    }
  }

  // End of archive: two consecutive 512-byte blocks of zeros
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
  const files: string[] = []

  function scan(dir: string) {
    const list = fs.readdirSync(dir, { withFileTypes: true })
    for (const item of list) {
      const full = path.join(dir, item.name)
      if (item.isDirectory()) {
        scan(full)
      } else if (item.isFile()) {
        files.push(full)
      }
    }
  }

  scan(sourceDir)
  // Sort deterministically for reproducible builds
  files.sort((a, b) => {
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
 * Parses and extracts a raw TAR buffer safely into targetDir.
 */
export async function extractTarBufferSafely(tarBuffer: Buffer, targetDir: string): Promise<{ fileCount: number; bytesExtracted: number }> {
  await fs.promises.mkdir(targetDir, { recursive: true })

  let offset = 0
  let pendingLongLinkName: string | null = null
  let fileCount = 0
  let bytesExtracted = 0

  while (offset + 512 <= tarBuffer.length) {
    const header = tarBuffer.subarray(offset, offset + 512)

    // Check for end-of-archive (512 bytes of zeros)
    let isZero = true
    for (let i = 0; i < 512; i++) {
      if (header[i] !== 0) {
        isZero = false
        break
      }
    }
    if (isZero) {
      // Possible end of archive, check next 512 bytes
      break
    }

    // Read size (octal)
    const sizeStr = header.toString('utf8', 124, 136).trim().replace(/\0/g, '')
    const size = parseInt(sizeStr, 8) || 0
    const typeFlag = String.fromCharCode(header[156] || 48)

    // Determine entry name
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

    // Handle GNU LongLink entry
    if (typeFlag === 'L') {
      const longNameBuf = tarBuffer.subarray(offset, dataEnd)
      let endIdx = 0
      while (endIdx < longNameBuf.length && longNameBuf[endIdx] !== 0) endIdx++
      pendingLongLinkName = longNameBuf.toString('utf8', 0, endIdx)
      offset = nextOffset
      continue
    }

    // Directory entry
    if (typeFlag === '5' || entryName.endsWith('/')) {
      const safeRel = sanitizeTarEntryPath(entryName)
      const destPath = path.join(targetDir, safeRel.replace(/\//g, path.sep))
      await fs.promises.mkdir(destPath, { recursive: true })
      offset = nextOffset
      continue
    }

    // Normal file entry ('0' or null)
    const safeRel = sanitizeTarEntryPath(entryName)
    const destPath = path.join(targetDir, safeRel.replace(/\//g, path.sep))
    await fs.promises.mkdir(path.dirname(destPath), { recursive: true })

    const fileData = tarBuffer.subarray(offset, dataEnd)
    await fs.promises.writeFile(destPath, fileData)

    fileCount++
    bytesExtracted += fileData.length
    offset = nextOffset
  }

  return { fileCount, bytesExtracted }
}

/**
 * Safely extracts a `.tar.br` archive to targetDir with path traversal checks.
 */
export async function extractTarBrotliSafely(tarBrPath: string, targetDir: string): Promise<{ fileCount: number; bytesExtracted: number }> {
  const compressed = await fs.promises.readFile(tarBrPath)
  const tarBuffer = zlib.brotliDecompressSync(compressed)
  return extractTarBufferSafely(tarBuffer, targetDir)
}
