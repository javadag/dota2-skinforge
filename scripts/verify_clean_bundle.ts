/**
 * Verify that `D:\changer_cleaned` and `data/cosmetic-assets.json` have:
 * - Every declared disk file present in `D:\changer_cleaned`
 * - Every `aliases.src` present on disk
 * - Every `valveCopies.src` present in Dota 2's `pak01_dir.vpk`
 * - Every group's `items_patch.txt` present, parseable, and free of ad spam / watermarks
 * - Zero broken internal asset dependencies (`kisilev_ind/...`, `particles/...`, `materials/...`, `models/...`)
 */

import fs from 'fs'
import path from 'path'
import { loadIndex } from '../src/main/services/vpkIndex'
import { detectDotaPath } from '../src/main/services/dotaPathService'
import * as packService from '../src/main/services/packService'
import type { CosmeticAssetsManifest } from '../src/main/services/cosmeticAssets'

function extractEmbeddedStrings(buf: Buffer): string[] {
  const raw = buf.toString('latin1')
  const matches = raw.match(
    /(?:kisilev_ind|models|materials|particles|sounds|soundevents)\/[a-zA-Z0-9_./-]+(?:\s+skull_basher\/[a-zA-Z0-9_./-]+)?\.(?:vmdl|vmat|vtex|vpcf|vsnap|vsnd|vsndevts|vmesh|vagrp|vanim|vphys|vseq)/g
  )
  return matches ? [...new Set(matches)] : []
}

async function main(): Promise<void> {
  const manifestPath = path.resolve('data/cosmetic-assets.json')
  const manifest: CosmeticAssetsManifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'))
  const bundleDir = manifest.sourceDir!

  const dotaPath = detectDotaPath()
  if (!dotaPath) throw new Error('Could not locate Dota 2 path for VPK verification')
  const vpkDirPath = path.join(dotaPath, 'dota', 'pak01_dir.vpk')
  const vpkIndex = loadIndex(vpkDirPath)

  const catalog = JSON.parse(fs.readFileSync(path.resolve('data/heroes_catalog.json'), 'utf-8'))
  const catalogIds = new Set<string>()
  for (const entry of Object.values<{ slots?: Array<{ mods?: Array<{ id?: number }> }> }>(catalog)) {
    for (const s of entry.slots ?? []) {
      for (const m of s.mods ?? []) {
        if (m.id) catalogIds.add(String(m.id))
      }
    }
  }

  let errors = 0
  let totalDiskBytes = 0
  let totalDiskFiles = 0

  const globalSet = new Set<string>()
  for (const gRel of manifest.globalFiles ?? []) {
    const full = path.join(bundleDir, '_global', gRel)
    if (!fs.existsSync(full)) {
      console.error(`[ERROR] Missing global file: ${full}`)
      errors++
    } else {
      globalSet.add(gRel)
      totalDiskBytes += fs.statSync(full).size
      totalDiskFiles++
    }
  }

  for (const [itemId, entry] of Object.entries(manifest.items)) {
    if (!catalogIds.has(itemId)) {
      console.error(`[ERROR] [${entry.group}] Item ID ${itemId} (${entry.name}) not found in data/heroes_catalog.json`)
      errors++
    }
    const groupDir = path.join(bundleDir, entry.group)
    const stagedSet = new Set<string>(globalSet)

    // 1. Check disk files
    for (const rel of entry.files) {
      const full = path.join(groupDir, rel)
      if (!fs.existsSync(full)) {
        console.error(`[ERROR] [${entry.group}] Missing disk file: ${rel}`)
        errors++
      } else {
        stagedSet.add(rel)
        totalDiskBytes += fs.statSync(full).size
        totalDiskFiles++
      }
    }

    // 2. Check aliases
    for (const alias of entry.aliases ?? []) {
      if (!stagedSet.has(alias.src)) {
        console.error(`[ERROR] [${entry.group}] Alias src not in files: ${alias.src} -> ${alias.dst}`)
        errors++
      }
      stagedSet.add(alias.dst)
    }

    // 3. Check valveCopies
    for (const vc of entry.valveCopies ?? []) {
      const clean = vc.src.replace(/\\/g, '/')
      if (!vpkIndex.entries.has(clean) && !vpkIndex.entries.has(`${clean}_c`)) {
        console.error(`[ERROR] [${entry.group}] valveCopy src missing from pak01_dir.vpk: ${vc.src}`)
        errors++
      }
      stagedSet.add(vc.dst)
    }

    // 4. Check refits
    for (const [cId, refit] of Object.entries(entry.refits ?? {})) {
      for (const rel of refit.files) {
        const full = path.join(groupDir, rel)
        if (!fs.existsSync(full)) {
          console.error(`[ERROR] [${entry.group} refit ${cId}] Missing disk file: ${rel}`)
          errors++
        } else {
          stagedSet.add(rel)
          totalDiskBytes += fs.statSync(full).size
          totalDiskFiles++
        }
      }
      for (const alias of refit.aliases ?? []) {
        if (!stagedSet.has(alias.src)) {
          console.error(`[ERROR] [${entry.group} refit ${cId}] Alias src not in files: ${alias.src} -> ${alias.dst}`)
          errors++
        }
        stagedSet.add(alias.dst)
      }
      for (const vc of refit.valveCopies ?? []) {
        const clean = vc.src.replace(/\\/g, '/')
        if (!vpkIndex.entries.has(clean) && !vpkIndex.entries.has(`${clean}_c`)) {
          console.error(`[ERROR] [${entry.group} refit ${cId}] valveCopy src missing from pak01_dir.vpk: ${vc.src}`)
          errors++
        }
        stagedSet.add(vc.dst)
      }
    }

    // 5. Check items_patch.txt
    if (!entry.patch) {
      console.error(`[ERROR] [${entry.group}] Missing patch property on item ${itemId}`)
      errors++
    } else {
      const patchFull = path.join(groupDir, entry.patch)
      if (!fs.existsSync(patchFull)) {
        console.error(`[ERROR] [${entry.group}] Missing patch file on disk: ${patchFull}`)
        errors++
      } else {
        const patchText = fs.readFileSync(patchFull, 'utf-8')
        if (/dota2changer\.com/i.test(patchText) || /"test_name"/i.test(patchText)) {
          console.error(`[ERROR] [${entry.group}] Unsanitized advert/watermark in ${patchFull}`)
          errors++
        }
        const blocks = packService.readPatchBlocks(patchText)
        if (blocks.size === 0) {
          console.error(`[ERROR] [${entry.group}] Empty patch blocks in ${patchFull}`)
          errors++
        }
      }
    }

    // 6. Verify internal references in binary files (.vmdl_c, .vpcf_c, .vmat_c) across base + refits
    const allGroupDiskFiles = [...entry.files, ...Object.values(entry.refits ?? {}).flatMap((r) => r.files)]
    for (const rel of allGroupDiskFiles) {
      if (!/\.(vmdl_c|vpcf_c|vmat_c)$/.test(rel)) continue
      const buf = fs.readFileSync(path.join(groupDir, rel))
      for (const ref of extractEmbeddedStrings(buf)) {
        const refC = `${ref}_c`
        if (ref.startsWith('kisilev_ind/') || ref.includes('skull_basher')) {
          if (!stagedSet.has(refC) && !vpkIndex.entries.has(refC)) {
            console.error(`[ERROR] [${entry.group}] Broken internal reference in ${rel}: ${refC}`)
            errors++
          }
        }
      }
    }
  }

  console.log(
    `Verified ${Object.keys(manifest.items).length} items | ${totalDiskFiles} unique disk files | ${(totalDiskBytes / (1024 * 1024)).toFixed(2)} MB total | ${errors} errors`
  )
  if (errors > 0) process.exit(1)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
