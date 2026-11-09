/**
 * Universal CRC32 utility (supports Uint8Array and Node Buffer)
 * Accelerated by Node.js zlib when running in Node, with a fast 256-entry lookup table fallback.
 */

const table = new Uint32Array(256)
for (let i = 0; i < 256; i++) {
  let c = i
  for (let j = 0; j < 8; j++) {
    c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  }
  table[i] = c
}

type NodeZlib = { crc32?: (buf: Uint8Array) => number }

let nodeZlib: NodeZlib | null | undefined

function getNodeZlib(): NodeZlib | null {
  if (nodeZlib !== undefined) return nodeZlib
  try {
    const req = (globalThis as unknown as { require?: (mod: string) => NodeZlib }).require
    if (typeof req === 'function') {
      nodeZlib = req('zlib')
      return nodeZlib
    }
  } catch {
    // browser or sandboxed
  }
  nodeZlib = null
  return null
}

export function crc32(buf: Uint8Array): number {
  const zlib = getNodeZlib()
  if (zlib && typeof zlib.crc32 === 'function') {
    return zlib.crc32(buf) >>> 0
  }
  let crc = ~0
  for (let i = 0; i < buf.length; i++) {
    crc = (crc >>> 8) ^ table[(crc ^ buf[i]) & 0xff]
  }
  return ~crc >>> 0
}

export default crc32
