/**
 * Dota 2 SkinForge — Cloudflare R2 Asset Extraction & Sync Engine
 *
 * Automates:
 * 1. Locating Dota 2 pak01_dir.vpk on local disk.
 * 2. Decompiling panorama/images/econ/ textures to PNG via Source2Viewer.
 * 3. Compressing PNG textures to optimized WebP via sharp.
 * 4. Syncing WebP icons to Cloudflare R2 bucket via S3 API.
 */

import { HeadObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { execFile } from 'child_process'
import fs from 'fs'
import path from 'path'
import sharp from 'sharp'
import { detectDotaPath } from '../src/main/services/dotaPathService'

export interface CliOptions {
  vpk?: string
  limit?: number
  dryRun?: boolean
  skipExtract?: boolean
  outDir?: string
}

export function parseArgs(args: string[]): CliOptions {
  const options: CliOptions = {}
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    if (arg === '--vpk' && i + 1 < args.length) {
      options.vpk = args[++i]
    } else if (arg === '--limit' && i + 1 < args.length) {
      options.limit = parseInt(args[++i], 10)
    } else if (arg === '--dry-run') {
      options.dryRun = true
    } else if (arg === '--skip-extract') {
      options.skipExtract = true
    } else if (arg === '--out-dir' && i + 1 < args.length) {
      options.outDir = args[++i]
    }
  }
  return options
}

export function loadEnvFile(envPath = path.resolve(process.cwd(), '.env')): Record<string, string> {
  const env: Record<string, string> = {}
  if (!fs.existsSync(envPath)) return env
  const lines = fs.readFileSync(envPath, 'utf8').split('\n')
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eqIdx = trimmed.indexOf('=')
    if (eqIdx !== -1) {
      const key = trimmed.slice(0, eqIdx).trim()
      const val = trimmed.slice(eqIdx + 1).trim()
      env[key] = val
    }
  }
  return env
}

export function findDotaVpkPath(): string | null {
  const detected = detectDotaPath()
  if (detected) {
    const vpk = path.join(detected, 'dota', 'pak01_dir.vpk')
    if (fs.existsSync(vpk)) return vpk
  }

  const commonLocations = [
    'D:\\SteamLibrary\\steamapps\\common\\dota 2 beta\\game\\dota\\pak01_dir.vpk',
    'C:\\Program Files (x86)\\Steam\\steamapps\\common\\dota 2 beta\\game\\dota\\pak01_dir.vpk',
    'E:\\SteamLibrary\\steamapps\\common\\dota 2 beta\\game\\dota\\pak01_dir.vpk'
  ]

  for (const loc of commonLocations) {
    if (fs.existsSync(loc)) return loc
  }

  return null
}

export async function ensureSource2ViewerCli(toolsDir = path.resolve(process.cwd(), 'tools')): Promise<string> {
  const exePath = path.join(toolsDir, 'Source2Viewer-CLI.exe')
  if (fs.existsSync(exePath)) {
    return exePath
  }

  console.log(`[Source2Viewer] Tool not found in ${toolsDir}.`)
  console.log('[Source2Viewer] Please download cli-windows-x64.zip from:')
  console.log('               https://github.com/SteamDatabase/ValveResourceFormat/releases')
  console.log(`               and extract Source2Viewer-CLI.exe into: ${toolsDir}\n`)
  throw new Error(`Missing ${exePath}. Please place Source2Viewer-CLI.exe in tools directory.`)
}

export function decompileVpkEcon(viewerExe: string, vpkPath: string, outDir: string): Promise<void> {
  return new Promise((resolve, reject) => {
    console.log(`[Decompile] Extracting panorama/images/econ textures from ${vpkPath}...`)
    const args = ['-i', vpkPath, '-g', 'panorama/images/econ', '-o', outDir, '-e', 'png']

    execFile(viewerExe, args, { maxBuffer: 1024 * 1024 * 64 }, (error, stdout, stderr) => {
      if (error) {
        console.error('[Decompile Error]', stderr || stdout)
        return reject(error)
      }
      console.log('[Decompile] Extraction complete.')
      resolve()
    })
  })
}

export async function convertPngsToWebp(
  sourceDir: string,
  targetDir: string,
  limit?: number
): Promise<{ converted: number; totalBytes: number }> {
  console.log(`[WebP] Converting PNG textures from ${sourceDir} to ${targetDir}...`)

  async function getFiles(dir: string): Promise<string[]> {
    const entries = await fs.promises.readdir(dir, { withFileTypes: true })
    const files: string[] = []
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        files.push(...(await getFiles(fullPath)))
      } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.png')) {
        files.push(fullPath)
      }
    }
    return files
  }

  const pngFiles = await getFiles(sourceDir)
  const toProcess = limit ? pngFiles.slice(0, limit) : pngFiles
  console.log(`[WebP] Found ${pngFiles.length} PNG textures. Processing ${toProcess.length} items...`)

  let converted = 0
  let totalBytes = 0

  for (const src of toProcess) {
    const rel = path.relative(sourceDir, src)
    const outRel = rel.replace(/\.png$/i, '.webp')
    const dest = path.join(targetDir, outRel)

    await fs.promises.mkdir(path.dirname(dest), { recursive: true })
    const buffer = await sharp(src).webp({ quality: 85, effort: 4 }).toBuffer()

    await fs.promises.writeFile(dest, buffer)
    converted++
    totalBytes += buffer.length

    if (converted % 200 === 0 || converted === toProcess.length) {
      console.log(`[WebP Progress] Converted ${converted}/${toProcess.length} (${(totalBytes / 1024 / 1024).toFixed(1)} MB)`)
    }
  }

  return { converted, totalBytes }
}

export async function uploadToR2(
  localDir: string,
  s3: S3Client,
  bucketName: string,
  limit?: number
): Promise<{ uploaded: number; skipped: number }> {
  console.log(`[R2 Sync] Uploading WebP assets from ${localDir} to bucket: ${bucketName}...`)

  async function getWebpFiles(dir: string): Promise<string[]> {
    const entries = await fs.promises.readdir(dir, { withFileTypes: true })
    const files: string[] = []
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        files.push(...(await getWebpFiles(fullPath)))
      } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.webp')) {
        files.push(fullPath)
      }
    }
    return files
  }

  const allFiles = await getWebpFiles(localDir)
  const toUpload = limit ? allFiles.slice(0, limit) : allFiles
  let uploaded = 0
  let skipped = 0

  for (const file of toUpload) {
    const relKey = path.relative(localDir, file).replace(/\\/g, '/')
    const stat = await fs.promises.stat(file)

    // Check if file already exists with same size
    try {
      const head = await s3.send(new HeadObjectCommand({ Bucket: bucketName, Key: relKey }))
      if (head.ContentLength === stat.size) {
        skipped++
        continue
      }
    } catch {
      // Object does not exist, proceed to put
    }

    const body = await fs.promises.readFile(file)
    await s3.send(
      new PutObjectCommand({
        Bucket: bucketName,
        Key: relKey,
        Body: body,
        ContentType: 'image/webp',
        CacheControl: 'public, max-age=31536000, immutable'
      })
    )
    uploaded++

    if ((uploaded + skipped) % 100 === 0 || uploaded + skipped === toUpload.length) {
      console.log(`[R2 Progress] Uploaded: ${uploaded} | Skipped (up to date): ${skipped} / Total: ${toUpload.length}`)
    }
  }

  return { uploaded, skipped }
}

export async function runCli(): Promise<void> {
  const options = parseArgs(process.argv.slice(2))
  const env = { ...loadEnvFile(), ...process.env }

  console.log('========================================================')
  console.log(' Dota 2 SkinForge — Cloudflare R2 Asset Sync Pipeline   ')
  console.log('========================================================\n')

  const vpkPath = options.vpk || findDotaVpkPath()
  if (!vpkPath) {
    console.error('[Error] Could not automatically locate pak01_dir.vpk.')
    console.error('        Please specify using: --vpk "<path/to/game/dota/pak01_dir.vpk>"')
    process.exit(1)
  }
  console.log(`[Dota 2] Using VPK: ${vpkPath}`)

  const stagingRoot = options.outDir || path.resolve(process.cwd(), '.staging_icons')
  const extractedDir = path.join(stagingRoot, 'extracted')
  const webpDir = path.join(stagingRoot, 'webp')

  if (!options.skipExtract) {
    const viewerExe = await ensureSource2ViewerCli()
    await decompileVpkEcon(viewerExe, vpkPath, extractedDir)
  }

  const { converted, totalBytes } = await convertPngsToWebp(extractedDir, webpDir, options.limit)
  console.log(`\n[WebP Complete] Converted ${converted} textures (${(totalBytes / 1024 / 1024).toFixed(1)} MB).`)

  if (options.dryRun) {
    console.log('\n[Dry Run] Skipping R2 upload step as requested with --dry-run.')
    console.log(`[Output] WebP assets are staged at: ${webpDir}`)
    return
  }

  const accountId = env.R2_ACCOUNT_ID
  const accessKeyId = env.R2_ACCESS_KEY_ID
  const secretAccessKey = env.R2_SECRET_ACCESS_KEY
  const bucketName = env.R2_BUCKET_NAME

  if (!accountId || !accessKeyId || !secretAccessKey || !bucketName) {
    console.log('\n[Warning] R2 credentials not fully set in .env. Skipping cloud upload.')
    console.log('          Configure R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, and R2_BUCKET_NAME in .env.')
    console.log(`          Local WebP assets ready at: ${webpDir}`)
    return
  }

  const s3 = new S3Client({
    region: 'auto',
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey }
  })

  const { uploaded, skipped } = await uploadToR2(webpDir, s3, bucketName, options.limit)
  console.log(`\n[Sync Success] Finished: ${uploaded} uploaded, ${skipped} already up to date.`)
}

if (require.main === module) {
  runCli().catch((err) => {
    console.error('\n[Fatal Error]', err.message || err)
    process.exit(1)
  })
}
