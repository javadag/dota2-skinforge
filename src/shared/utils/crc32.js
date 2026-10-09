/**
 * Universal CRC32 utility (supports Node.js CommonJS and ES Modules)
 */
function crc32(buf) {
  let crc = ~0;
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i];
    for (let j = 0; j < 8; j++) {
      crc = (crc >>> 1) ^ (-(crc & 1) & 0xEDB88320);
    }
  }
  return (~crc) >>> 0;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { crc32 };
}
