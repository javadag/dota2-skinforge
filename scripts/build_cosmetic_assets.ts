/**
 * Generate `data/cosmetic-assets.json` and sanitize the extracted pack bundle into `D:\skinforge_assets`.
 *
 *   npx tsx scripts/build_cosmetic_assets.ts
 */

import path from 'path'
import { sanitizeBundle } from './sanitize_bundle'

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(name)
  if (i !== -1 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--')) return process.argv[i + 1]
  return fallback
}

function main(): void {
  const srcDir = path.resolve(arg('--src', 'D:\\skinforge_raw'))
  const dstDir = path.resolve(arg('--bundle', 'D:\\skinforge_assets'))
  const wave2ItemsGamePath = path.resolve(arg('--wave2', 'scratch/pack_extracted/items/scripts/items/items_game.txt'))
  const outManifestPath = path.resolve(arg('--out', 'data/cosmetic-assets.json'))

  const manifest = sanitizeBundle({ srcDir, dstDir, wave2ItemsGamePath, outManifestPath })
  const totalFiles = Object.values(manifest.items).reduce((sum, e) => sum + e.files.length, 0)
  console.log(`wrote   ${outManifestPath}`)
  console.log(`entries ${Object.keys(manifest.items).length}  unique disk files ${totalFiles}`)
}

main()
