/**
 * How much of each bundle is the same bytes stored under several paths?
 *
 * The packer copies every file a model references to the path that model expects. When ten
 * refit models reference one texture, that texture lands in ten folders.
 */
import crypto from 'crypto'
import fs from 'fs'
import path from 'path'

const manifest = JSON.parse(fs.readFileSync('data/cosmetic-assets.json', 'utf-8')) as {
  sourceDir: string
  items: Record<string, { name: string; group: string; files: string[] }>
}

const md5 = (b: Buffer): string => crypto.createHash('md5').update(b).digest('hex')

let totalFiles = 0
let totalBytes = 0
let uniqueBytes = 0
const rows: Array<{ name: string; files: number; unique: number; bytes: number; uniq: number }> = []

for (const entry of Object.values(manifest.items)) {
  const seen = new Set<string>()
  let files = 0
  let bytes = 0
  let uniq = 0
  for (const rel of entry.files) {
    const local = path.join(manifest.sourceDir, entry.group, rel.replace(/\//g, path.sep))
    if (!fs.existsSync(local)) continue
    const data = fs.readFileSync(local)
    const h = md5(data)
    files++
    bytes += data.length
    if (!seen.has(h)) {
      seen.add(h)
      uniq += data.length
    }
  }
  totalFiles += files
  totalBytes += bytes
  uniqueBytes += uniq
  rows.push({ name: entry.name, files, unique: seen.size, bytes, uniq })
}

rows.sort((a, b) => b.bytes - b.uniq - (a.bytes - a.uniq))
for (const r of rows.slice(0, 12)) {
  const saved = r.bytes - r.uniq
  console.log(
    `${r.name.padEnd(38)} ${String(r.files).padStart(4)} files / ${String(r.unique).padStart(4)} unique   ` +
      `${String(Math.round(r.bytes / 1024)).padStart(7)} KB -> ${String(Math.round(r.uniq / 1024)).padStart(7)} KB   ` +
      `saves ${String(Math.round(saved / 1024)).padStart(6)} KB`
  )
}

console.log('\n--- all 30 bundles ---')
console.log(`files ${totalFiles}`)
console.log(`size  ${Math.round(totalBytes / 1024 / 1024)} MB`)
console.log(`unique bytes ${Math.round(uniqueBytes / 1024 / 1024)} MB`)
console.log(
  `duplicated   ${Math.round((totalBytes - uniqueBytes) / 1024 / 1024)} MB  (${Math.round(((totalBytes - uniqueBytes) / totalBytes) * 100)}%)`
)
