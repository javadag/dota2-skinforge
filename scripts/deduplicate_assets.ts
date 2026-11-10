/**
 * Asset Deduplication and Optimization Script
 *
 * 1. Detects and removes unreferenced/orphaned files in `D:\skinforge_assets`.
 * 2. Deduplicates intra-group duplicate files across styles and refits,
 *    updating `data/cosmetic-assets.json` aliases to point to the canonical copy.
 * 3. Verifies 100% integrity of every item, style, refit, and alias.
 *
 * Usage:
 *   npx tsx scripts/deduplicate_assets.ts [--dry-run] [--apply]
 */

import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import type { CosmeticAssetsManifest, PathMapping } from '../src/main/services/cosmeticAssets'

const ASSETS_DIR = path.resolve('D:/skinforge_assets')
const MANIFEST_PATH = path.resolve('data/cosmetic-assets.json')

function walk(dir: string): string[] {
  const files: string[] = []
  if (!fs.existsSync(dir)) return files
  for (const f of fs.readdirSync(dir)) {
    const full = path.join(dir, f)
    if (fs.statSync(full).isDirectory()) files.push(...walk(full))
    else files.push(full)
  }
  return files
}

function computeSha256(filePath: string): string {
  const buf = fs.readFileSync(filePath)
  return crypto.createHash('sha256').update(buf).digest('hex')
}

async function main() {
  const isApply = process.argv.includes('--apply')
  console.log(`=== Dota 2 SkinForge Asset Deduplication & Optimization ===`)
  console.log(`Mode: ${isApply ? 'APPLY (Modifying disk & manifest)' : 'DRY RUN (Simulating)'}`)
  console.log(`Assets directory: ${ASSETS_DIR}`)

  if (!fs.existsSync(ASSETS_DIR)) {
    console.error(`Error: Assets directory not found at ${ASSETS_DIR}`)
    process.exit(1)
  }

  const manifest: CosmeticAssetsManifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'))
  const manifestRawBackup = JSON.stringify(manifest, null, 2)

  // 1. Collect all explicitly referenced paths per group
  function getReferencedPaths(m: CosmeticAssetsManifest): Set<string> {
    const set = new Set<string>()
    for (const [, item] of Object.entries(m.items || {})) {
      const g = item.group
      for (const f of item.files || []) set.add(`${g}/${f.replace(/\\/g, '/')}`)
      for (const a of item.aliases || []) if (a.src) set.add(`${g}/${a.src.replace(/\\/g, '/')}`)
      for (const [, sVal] of Object.entries((item.styles || {}) as Record<string, { files?: string[]; aliases?: PathMapping[] }>)) {
        for (const f of sVal.files || []) set.add(`${g}/${f.replace(/\\/g, '/')}`)
        for (const a of sVal.aliases || []) if (a.src) set.add(`${g}/${a.src.replace(/\\/g, '/')}`)
      }
      const refits = Array.isArray(item.refits) ? item.refits : Object.values(item.refits || {})
      for (const r of refits as Array<{
        files?: string[]
        aliases?: PathMapping[]
        styles?: Record<string, { files?: string[]; aliases?: PathMapping[] }>
      }>) {
        for (const f of r.files || []) set.add(`${g}/${f.replace(/\\/g, '/')}`)
        for (const a of r.aliases || []) if (a.src) set.add(`${g}/${a.src.replace(/\\/g, '/')}`)
        for (const [, sVal] of Object.entries(r.styles || {})) {
          for (const f of sVal.files || []) set.add(`${g}/${f.replace(/\\/g, '/')}`)
          for (const a of sVal.aliases || []) if (a.src) set.add(`${g}/${a.src.replace(/\\/g, '/')}`)
        }
      }
    }
    for (const g of m.globalFiles || []) set.add(`_global/${g.replace(/\\/g, '/')}`)
    return set
  }

  const refSet = getReferencedPaths(manifest)
  const allDiskFiles = walk(ASSETS_DIR)
  console.log(`Total files found on disk: ${allDiskFiles.length}`)

  // 2. Identify orphaned files (not referenced and not items_patch.txt)
  const orphanedFiles: string[] = []
  let orphanedBytes = 0

  for (const f of allDiskFiles) {
    const rel = path.relative(ASSETS_DIR, f).split(path.sep).join('/')
    if (path.basename(rel) === 'items_patch.txt') continue
    if (!refSet.has(rel)) {
      orphanedFiles.push(f)
      orphanedBytes += fs.statSync(f).size
    }
  }

  console.log(`\n[Phase 1] Orphaned / Unreferenced Files:`)
  console.log(`  Count: ${orphanedFiles.length}`)
  console.log(`  Space: ${(orphanedBytes / 1048576).toFixed(2)} MB`)

  // 3. Intra-group duplicate detection & alias remapping
  // For each group, find files that have identical hash
  const activeDiskFiles = allDiskFiles.filter((f) => !orphanedFiles.includes(f))
  const groupFilesMap = new Map<string, string[]>()

  for (const f of activeDiskFiles) {
    const rel = path.relative(ASSETS_DIR, f).split(path.sep).join('/')
    const group = rel.split('/')[0]
    if (!groupFilesMap.has(group)) groupFilesMap.set(group, [])
    groupFilesMap.get(group)!.push(f)
  }

  const aliasReplacements = new Map<string, string>() // oldRel -> canonicalRel
  const duplicateFilesToDelete: string[] = []
  let duplicateBytes = 0

  for (const [group, files] of groupFilesMap.entries()) {
    const hashMap = new Map<string, string[]>()
    for (const f of files) {
      const h = computeSha256(f)
      if (!hashMap.has(h)) hashMap.set(h, [])
      hashMap.get(h)!.push(f)
    }

    for (const [, list] of hashMap.entries()) {
      if (list.length <= 1) continue

      // Pick canonical file: prefer shorter path or base models/ over styles/
      list.sort((a, b) => {
        const relA = path.relative(ASSETS_DIR, a).split(path.sep).join('/')
        const relB = path.relative(ASSETS_DIR, b).split(path.sep).join('/')
        const aIsStyle = relA.includes('/styles/')
        const bIsStyle = relB.includes('/styles/')
        if (aIsStyle !== bIsStyle) return aIsStyle ? 1 : -1
        return relA.length - relB.length
      })

      const canonicalFull = list[0]
      const canonicalRel = path.relative(ASSETS_DIR, canonicalFull).split(path.sep).join('/')
      // Strip group prefix for manifest relative path
      const canonicalSubRel = canonicalRel.slice(group.length + 1)

      for (let i = 1; i < list.length; i++) {
        const dupFull = list[i]
        const dupRel = path.relative(ASSETS_DIR, dupFull).split(path.sep).join('/')
        const dupSubRel = dupRel.slice(group.length + 1)

        aliasReplacements.set(`${group}::${dupSubRel}`, canonicalSubRel)
        duplicateFilesToDelete.push(dupFull)
        duplicateBytes += fs.statSync(dupFull).size
      }
    }
  }

  console.log(`\n[Phase 2] Intra-Group Duplicate Files:`)
  console.log(`  Count: ${duplicateFilesToDelete.length}`)
  console.log(`  Space: ${(duplicateBytes / 1048576).toFixed(2)} MB`)
  console.log(`  Alias mappings to update: ${aliasReplacements.size}`)

  console.log(`\nTotal Space to Reclaim: ${((orphanedBytes + duplicateBytes) / 1048576).toFixed(2)} MB`)

  // 4. Update manifest in memory
  let manifestChanges = 0
  function remapPath(group: string, p: string): string {
    const key = `${group}::${p.replace(/\\/g, '/')}`
    if (aliasReplacements.has(key)) {
      manifestChanges++
      return aliasReplacements.get(key)!
    }
    return p
  }

  function remapAliases(group: string, aliases?: PathMapping[]) {
    if (!aliases) return
    for (const a of aliases) {
      const oldSrc = a.src
      a.src = remapPath(group, a.src)
      if (a.src !== oldSrc) {
        // Updated alias src to point to canonical file
      }
    }
  }

  for (const [, item] of Object.entries(manifest.items || {})) {
    const g = item.group
    remapAliases(g, item.aliases)

    if (item.styles) {
      for (const [, sVal] of Object.entries(item.styles as Record<string, { files?: string[]; aliases?: PathMapping[] }>)) {
        if (sVal.files) {
          sVal.files = sVal.files.map((f: string) => remapPath(g, f))
        }
        remapAliases(g, sVal.aliases)
      }
    }

    const refits = Array.isArray(item.refits) ? item.refits : Object.values(item.refits || {})
    for (const r of refits as Array<{ aliases?: PathMapping[]; styles?: Record<string, { files?: string[]; aliases?: PathMapping[] }> }>) {
      remapAliases(g, r.aliases)
      if (r.styles) {
        for (const [, sVal] of Object.entries(r.styles as Record<string, { files?: string[]; aliases?: PathMapping[] }>)) {
          if (sVal.files) {
            sVal.files = sVal.files.map((f: string) => remapPath(g, f))
          }
          remapAliases(g, sVal.aliases)
        }
      }
    }
  }

  console.log(`Manifest alias/file updates made: ${manifestChanges}`)

  // 5. Apply changes if requested
  if (isApply) {
    console.log(`\nApplying changes...`)

    // Save manifest backup
    fs.writeFileSync(`${MANIFEST_PATH}.bak`, manifestRawBackup, 'utf8')
    // Save updated manifest
    fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2), 'utf8')
    console.log(`Saved updated manifest to ${MANIFEST_PATH}`)

    // Delete orphaned files
    let deletedCount = 0
    for (const f of orphanedFiles) {
      if (fs.existsSync(f)) {
        fs.unlinkSync(f)
        deletedCount++
      }
    }

    // Delete duplicate files
    for (const f of duplicateFilesToDelete) {
      if (fs.existsSync(f)) {
        fs.unlinkSync(f)
        deletedCount++
      }
    }

    // Remove empty directories
    function cleanEmptyDirs(dir: string) {
      if (!fs.existsSync(dir)) return
      for (const item of fs.readdirSync(dir)) {
        const full = path.join(dir, item)
        if (fs.statSync(full).isDirectory()) {
          cleanEmptyDirs(full)
          if (fs.readdirSync(full).length === 0) {
            fs.rmdirSync(full)
          }
        }
      }
    }
    cleanEmptyDirs(ASSETS_DIR)
    console.log(`Successfully deleted ${deletedCount} files from disk.`)
  }

  // 6. Comprehensive Integrity Verification
  console.log(`\n[Phase 3] Running Full Integrity Verification...`)
  let integrityErrors = 0
  let checkedItems = 0
  let checkedFiles = 0

  function checkFileExists(group: string, rel: string, context: string) {
    checkedFiles++
    const full = path.join(ASSETS_DIR, group, rel.replace(/\//g, path.sep))
    if (!fs.existsSync(full)) {
      console.error(`[INTEGRITY ERROR] Missing file for ${group} (${context}): ${rel}`)
      integrityErrors++
    }
  }

  for (const [id, item] of Object.entries(manifest.items || {})) {
    checkedItems++
    const g = item.group

    for (const f of item.files || []) checkFileExists(g, f, `item ${id} base file`)
    for (const a of item.aliases || []) checkFileExists(g, a.src, `item ${id} alias src`)

    for (const [sKey, sVal] of Object.entries(item.styles || {})) {
      for (const f of sVal.files || []) checkFileExists(g, f, `item ${id} style ${sKey} file`)
      for (const a of sVal.aliases || []) checkFileExists(g, a.src, `item ${id} style ${sKey} alias src`)
    }

    const refits = Array.isArray(item.refits) ? item.refits : Object.values(item.refits || {})
    for (const r of refits as Array<{
      companionId?: string
      files?: string[]
      aliases?: PathMapping[]
      styles?: Record<string, { files?: string[]; aliases?: PathMapping[] }>
    }>) {
      for (const f of r.files || []) checkFileExists(g, f, `item ${id} refit ${r.companionId} file`)
      for (const a of r.aliases || []) checkFileExists(g, a.src, `item ${id} refit ${r.companionId} alias src`)
      for (const [, sVal] of Object.entries(r.styles || {})) {
        for (const f of sVal.files || []) checkFileExists(g, f, `item ${id} refit style file`)
        for (const a of sVal.aliases || []) checkFileExists(g, a.src, `item ${id} refit style alias src`)
      }
    }
  }

  for (const g of manifest.globalFiles || []) {
    checkFileExists('_global', g, 'global file')
  }

  console.log(`Checked ${checkedItems} items across ${checkedFiles} file references.`)
  if (integrityErrors > 0) {
    console.error(`FAILED: ${integrityErrors} integrity errors found!`)
    process.exit(1)
  } else {
    console.log(`PASSED: 100% of all required file references exist and resolve cleanly!`)
  }
}

main().catch((err) => {
  console.error('Fatal error:', err)
  process.exit(1)
})
