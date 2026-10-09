/**
 * Valve Source 2 VPK Packing & Extraction Service
 */

const path = require('path');
const { execFile } = require('child_process');
const fs = require('fs');
const crypto = require('crypto');
const { crc32 } = require('../../shared/utils/crc32');

const VPKTOOL_PATH = path.resolve(__dirname, '../../../tools/vpktool.exe');

function runVpkTool(args) {
  return new Promise((resolve, reject) => {
    execFile(VPKTOOL_PATH, args, { maxBuffer: 1024 * 1024 * 32 }, (error, stdout, stderr) => {
      if (error && !stdout) {
        return reject(new Error(stderr || error.message));
      }
      try {
        const parsed = JSON.parse(stdout.trim());
        if (!parsed.ok) {
          return reject(new Error(parsed.error || 'VPK tool error'));
        }
        resolve(parsed);
      } catch (parseErr) {
        if (error) return reject(error);
        resolve(stdout);
      }
    });
  });
}

async function list(vpkPath) {
  return await runVpkTool(['list', path.resolve(vpkPath)]);
}

async function extract(vpkPath, internalPath, outFilePath) {
  const resolvedOut = path.resolve(outFilePath);
  const outDir = path.dirname(resolvedOut);
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }
  return await runVpkTool(['extract', path.resolve(vpkPath), internalPath, resolvedOut]);
}

async function unpack(vpkPath, outDir) {
  const resolvedOutDir = path.resolve(outDir);
  if (!fs.existsSync(resolvedOutDir)) {
    fs.mkdirSync(resolvedOutDir, { recursive: true });
  }
  return await runVpkTool(['unpack', path.resolve(vpkPath), resolvedOutDir]);
}

// Source 2 multi-chunk VPK packer (pak01_dir.vpk + pak01_000.vpk)
function packMultiChunk(srcDir, outDirVpkPath) {
  const resolvedDirVpk = path.resolve(outDirVpkPath);
  const vpkDir = path.dirname(resolvedDirVpk);
  if (!fs.existsSync(vpkDir)) {
    fs.mkdirSync(vpkDir, { recursive: true });
  }

  const basePrefix = path.basename(resolvedDirVpk).replace(/_dir\.vpk$/i, '');
  const outChunkVpkPath = path.join(vpkDir, `${basePrefix}_000.vpk`);

  // 1. Gather all files
  const fileEntries = [];
  function walk(currentDir, relDir) {
    const list = fs.readdirSync(currentDir);
    for (const item of list) {
      const full = path.join(currentDir, item);
      const rel = relDir ? `${relDir}/${item}` : item;
      const stat = fs.statSync(full);
      if (stat.isDirectory()) {
        walk(full, rel);
      } else {
        const ext = path.extname(item).replace(/^\./, '').toLowerCase();
        const base = path.basename(item, path.extname(item));
        const dir = relDir ? relDir.replace(/\\/g, '/').toLowerCase() : ' ';
        fileEntries.push({
          full,
          ext,
          dir,
          base,
          size: stat.size
        });
      }
    }
  }
  walk(srcDir, '');

  // 2. Sort by ext -> dir -> base
  fileEntries.sort((a, b) => {
    if (a.ext !== b.ext) return a.ext.localeCompare(b.ext);
    if (a.dir !== b.dir) return a.dir.localeCompare(b.dir);
    return a.base.localeCompare(b.base);
  });

  // 3. Write data chunk (pak01_000.vpk)
  const chunkFd = fs.openSync(outChunkVpkPath, 'w');
  let currentOffset = 0;
  for (const entry of fileEntries) {
    const buf = fs.readFileSync(entry.full);
    entry.crc = crc32(buf);
    entry.offset = currentOffset;
    fs.writeSync(chunkFd, buf, 0, buf.length, currentOffset);
    currentOffset += buf.length;
  }
  fs.closeSync(chunkFd);

  // 4. Build Tree
  const treeChunks = [];
  const byExt = new Map();
  for (const e of fileEntries) {
    if (!byExt.has(e.ext)) byExt.set(e.ext, new Map());
    const byDir = byExt.get(e.ext);
    if (!byDir.has(e.dir)) byDir.set(e.dir, []);
    byDir.get(e.dir).push(e);
  }

  for (const [ext, dirs] of byExt.entries()) {
    treeChunks.push(Buffer.from(ext + '\0', 'utf-8'));
    for (const [dir, files] of dirs.entries()) {
      treeChunks.push(Buffer.from(dir + '\0', 'utf-8'));
      for (const f of files) {
        treeChunks.push(Buffer.from(f.base + '\0', 'utf-8'));
        const entryBuf = Buffer.alloc(18);
        entryBuf.writeUInt32LE(f.crc, 0);       // CRC32
        entryBuf.writeUInt16LE(0, 4);           // PreloadBytes = 0
        entryBuf.writeUInt16LE(0, 6);           // ArchiveIndex = 0 (pak01_000.vpk)
        entryBuf.writeUInt32LE(f.offset, 8);    // EntryOffset
        entryBuf.writeUInt32LE(f.size, 12);     // EntryLength
        entryBuf.writeUInt16LE(0xFFFF, 16);     // Terminator
        treeChunks.push(entryBuf);
      }
      treeChunks.push(Buffer.from([0])); // End of files for dir
    }
    treeChunks.push(Buffer.from([0])); // End of dirs for ext
  }
  treeChunks.push(Buffer.from([0])); // End of extensions

  const treeBuffer = Buffer.concat(treeChunks);

  // 5. Build Header
  const header = Buffer.alloc(28);
  header.writeUInt32LE(0x55aa1234, 0);         // Signature
  header.writeUInt32LE(2, 4);                  // Version 2
  header.writeUInt32LE(treeBuffer.length, 8);   // TreeSize
  header.writeUInt32LE(0, 12);                 // FileDataSectionSize = 0 (data is in 000.vpk)
  header.writeUInt32LE(0, 16);                 // ArchiveMD5SectionSize
  header.writeUInt32LE(48, 20);                // OtherMD5SectionSize
  header.writeUInt32LE(0, 24);                 // SignatureSectionSize

  // 6. Build Footer (Other MD5 Section)
  const treeMD5 = crypto.createHash('md5').update(treeBuffer).digest();
  const archiveMD5 = crypto.createHash('md5').update(Buffer.alloc(0)).digest();
  const partialBuf = Buffer.concat([header, treeBuffer, treeMD5, archiveMD5]);
  const wholeMD5 = crypto.createHash('md5').update(partialBuf).digest();
  const footer = Buffer.concat([treeMD5, archiveMD5, wholeMD5]);

  // 7. Write pak01_dir.vpk
  fs.writeFileSync(resolvedDirVpk, Buffer.concat([header, treeBuffer, footer]));

  return {
    ok: true,
    filesCount: fileEntries.length,
    dirVpk: resolvedDirVpk,
    chunkVpk: outChunkVpkPath
  };
}

async function pack(srcDir, outVpkPath) {
  const resolvedOutVpk = path.resolve(outVpkPath);
  if (resolvedOutVpk.toLowerCase().endsWith('_dir.vpk')) {
    return packMultiChunk(srcDir, resolvedOutVpk);
  }
  return await runVpkTool(['pack', path.resolve(srcDir), resolvedOutVpk]);
}

module.exports = {
  list,
  extract,
  unpack,
  pack,
  packMultiChunk,
  VPKTOOL_PATH
};
