/**
 * CRC32 utility (supports Uint8Array and Node Buffer)
 * Uses Node.js native `zlib.crc32` when available, with a 256-entry lookup table fallback.
 */

import zlib from 'zlib'

const table = new Uint32Array(256)
for (let i = 0; i < 256; i++) {
  let c = i
  for (let j = 0; j < 8; j++) {
    c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  }
  table[i] = c
}

const nativeCrc32 = (zlib as unknown as { crc32?: (buf: Uint8Array) => number }).crc32

export function crc32(buf: Uint8Array): number {
  if (typeof nativeCrc32 === 'function') {
    return nativeCrc32(buf) >>> 0
  }
  let crc = ~0
  for (let i = 0; i < buf.length; i++) {
    crc = (crc >>> 8) ^ table[(crc ^ buf[i]) & 0xff]
  }
  return ~crc >>> 0
}
