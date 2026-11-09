/**
 * Cloudflare R2 Asset Packaging and Synchronization CLI
 *
 * Scans `skinforge_assets` (or custom `--src`), creates individual deterministic
 * ZIP archives for each group, generates `packages.json`, and uploads them to
 * the Cloudflare R2 bucket.
 *
 * Usage:
 *   npx tsx scripts/package_and_sync_assets.ts [--src D:\skinforge_assets] [--dry-run] [--skip-upload]
 */

import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import fs from 'fs'
import path from 'path'
import { computeFileSha256, createZipFromDir } from '../src/main/services/zipUtils'
import type { AssetPackageManifest, AssetPackageEntry } from '../src/shared/types/assetPackages'
import { loadEnvFile } from './sync_r2_icons'

interface CliOptions {
  srcDir: string
  distDir: string
  dryRun: boolean
  skipUpload: boolean
  force: boolean
  group?: string
}

function parseArgs(): CliOptions {
  const args = process.argv.slice(2)
  const options: CliOptions = {
    srcDir: 'D:\\skinforge_assets',
    distDir: path.resolve(process.cwd(), 'scratch/dist_packages'),
    dryRun: false,
    skipUpload: false,
    force: false
  }

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    if (arg === '--src' && i + 1 < args.length) {
      options.srcDir = path.resolve(args[++i])
    } else if (arg === '--dist' && i + 1 < args.length) {
      options.distDir = path.resolve(args[++i])
    } else if (arg === '--dry-run') {
      options.dryRun = true
    } else if (arg === '--skip-upload') {
      options.skipUpload = true
    } else if (arg === '--force' || arg === '-f') {
      options.force = true
    } else if (arg === '--group' && i + 1 < args.length) {
      options.group = args[++i]
    }
  }
  return options
}

async function uploadToR2(s3: S3Client, bucket: string, key: string, body: Buffer, contentType: string): Promise<void> {
  await s3.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: body,
      ContentType: contentType
    })
  )
}

async function main() {
  const opts = parseArgs()
  console.log('=== Dota 2 SkinForge Asset Packager & R2 Sync ===')
  console.log(`Source directory: ${opts.srcDir}`)
  console.log(`Package output:   ${opts.distDir}`)

  if (!fs.existsSync(opts.srcDir)) {
    console.error(`Error: Source directory does not exist: ${opts.srcDir}`)
    process.exit(1)
  }

  const env = loadEnvFile()
  const accountId = env.R2_ACCOUNT_ID
  const accessKeyId = env.R2_ACCESS_KEY_ID
  const secretAccessKey = env.R2_SECRET_ACCESS_KEY
  const bucketName = env.R2_BUCKET_NAME || 'skinforge'

  let s3: S3Client | null = null
  if (!opts.skipUpload && !opts.dryRun) {
    if (!accountId || !accessKeyId || !secretAccessKey) {
      console.error('Error: Missing Cloudflare R2 credentials in .env file.')
      console.error('Required: R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY')
      process.exit(1)
    }
    s3 = new S3Client({
      region: 'auto',
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      credentials: { accessKeyId, secretAccessKey }
    })
  }

  fs.mkdirSync(opts.distDir, { recursive: true })

  // Find all group directories
  const entries = fs.readdirSync(opts.srcDir, { withFileTypes: true })
  const groupDirs = entries.filter((e) => e.isDirectory()).map((e) => e.name)

  if (opts.group) {
    if (!groupDirs.includes(opts.group)) {
      console.error(`Group "${opts.group}" not found in ${opts.srcDir}`)
      process.exit(1)
    }
  }

  const targets = opts.group ? [opts.group] : groupDirs
  console.log(`Found ${targets.length} group(s) to process.`)

  const manifestPath = path.resolve(process.cwd(), 'data/cosmetic-packages.json')
  let existingManifest: AssetPackageManifest = {
    version: 1,
    generatedAt: new Date().toISOString(),
    baseUrl: 'cosmetic-assets/packages',
    packages: {}
  }

  if (fs.existsSync(manifestPath)) {
    try {
      existingManifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
    } catch {
      // Use blank if unreadable
    }
  }

  const packages: Record<string, AssetPackageEntry> = { ...existingManifest.packages }
  let totalPackedBytes = 0

  for (const group of targets) {
    const groupPath = path.join(opts.srcDir, group)
    const zipName = `${group}.zip`
    const outZipPath = path.join(opts.distDir, zipName)

    process.stdout.write(`Packaging [${group}]... `)
    const { size, fileCount } = await createZipFromDir(groupPath, outZipPath)
    const sha256 = await computeFileSha256(outZipPath)
    totalPackedBytes += size

    const uncompressedSize = fs.readdirSync(groupPath, { recursive: true }).reduce((acc, sub) => {
      const p = path.join(groupPath, String(sub))
      try {
        const s = fs.statSync(p)
        return acc + (s.isFile() ? s.size : 0)
      } catch {
        return acc
      }
    }, 0)

    const existing = packages[group]
    const hasChanged = !existing || existing.sha256 !== sha256
    const shouldUpload = hasChanged || opts.force

    packages[group] = {
      file: zipName,
      version: hasChanged ? (existing ? bumpVersion(existing.version) : '1.0.0') : existing.version,
      sha256,
      size,
      uncompressedSize,
      fileCount,
      ...(group !== '_global' ? { dependencies: ['_global'] } : {})
    }

    console.log(`${(size / (1024 * 1024)).toFixed(2)} MB (${fileCount} files) - ${hasChanged ? 'UPDATED' : 'UNCHANGED'}`)

    if (s3 && shouldUpload && !opts.skipUpload) {
      const r2Key = `cosmetic-assets/packages/${zipName}`
      process.stdout.write(`  -> Uploading to R2 (${r2Key})... `)
      const data = fs.readFileSync(outZipPath)
      await uploadToR2(s3, bucketName, r2Key, data, 'application/zip')
      console.log('DONE')
    }
  }

  const finalManifest: AssetPackageManifest = {
    version: 1,
    generatedAt: new Date().toISOString(),
    baseUrl: 'cosmetic-assets/packages',
    packages
  }

  // Save local copy to data/cosmetic-packages.json for bundling with app
  fs.writeFileSync(manifestPath, JSON.stringify(finalManifest, null, 2), 'utf8')
  console.log(`Saved local manifest to ${manifestPath}`)

  if (s3 && !opts.skipUpload) {
    const manifestBuffer = Buffer.from(JSON.stringify(finalManifest, null, 2), 'utf8')
    const manifestKey = 'cosmetic-assets/packages.json'
    process.stdout.write(`Uploading manifest to R2 (${manifestKey})... `)
    await uploadToR2(s3, bucketName, manifestKey, manifestBuffer, 'application/json')
    console.log('DONE')
  }

  console.log(`\nAll done! Total package data: ${(totalPackedBytes / (1024 * 1024)).toFixed(2)} MB across ${targets.length} packages.`)
}

function bumpVersion(v: string): string {
  const parts = v.split('.').map((n) => parseInt(n, 10) || 0)
  while (parts.length < 3) parts.push(0)
  parts[2]++
  return parts.join('.')
}

if (require.main === module) {
  main().catch((err) => {
    console.error('Fatal error:', err)
    process.exit(1)
  })
}
