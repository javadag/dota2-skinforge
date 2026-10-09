/**
 * Universal CRC32 utility (supports Uint8Array and Node Buffer)
 */
export function crc32(buf: Uint8Array): number {
  let crc = ~0
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i]
    for (let j = 0; j < 8; j++) {
      crc = (crc >>> 1) ^ (-(crc & 1) & 0xedb88320)
    }
  }
  return ~crc >>> 0
}

export default crc32
