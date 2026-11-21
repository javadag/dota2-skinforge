import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import fs from 'node:fs'
import path from 'node:path'
import { parseArgs } from 'node:util'
import { computeFileSha256, createTarBrotliFromDir } from '../src/main/services/assets/archiveUtils'
import { ASSET_PACKAGE_BASE_PATH, type AssetPackageEntry } from '../src/shared/types/assetPackages'
import {
  DEFAULT_ASSET_SOURCE,
  hashOverlayManifest,
  inspectPackageSource,
  readOverlayManifest,
  readPackageManifest,
  requiredPackageFiles,
  verifyPublishedPackage,
  writePackageManifest
} from './lib/cosmeticPackages'

function connectToR2(): { s3: S3Client; bucket: string } {
  const env: Record<string, string | undefined> = {}
  if (fs.existsSync('.env')) {
    for (const line of fs.readFileSync('.env', 'utf8').split('\n')) {
      const match = /^\s*(R2_[A-Z_]+)\s*=\s*(.*?)\s*$/.exec(line)
      if (match) env[match[1]] = match[2]
    }
  }
  const {
    R2_ACCOUNT_ID: accountId,
    R2_ACCESS_KEY_ID: accessKeyId,
    R2_SECRET_ACCESS_KEY: secretAccessKey,
    R2_BUCKET_NAME: bucket
  } = {
    ...env,
    ...process.env
  }
  if (!accountId || !accessKeyId || !secretAccessKey || !bucket) throw new Error('Set the four R2 credentials before uploading.')
  return {
    s3: new S3Client({
      region: 'auto',
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      credentials: { accessKeyId, secretAccessKey }
    }),
    bucket
  }
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      src: { type: 'string', default: DEFAULT_ASSET_SOURCE },
      dist: { type: 'string', default: 'scratch/dist_packages' },
      group: { type: 'string', multiple: true },
      force: { type: 'boolean', short: 'f' },
      'dry-run': { type: 'boolean' },
      'skip-upload': { type: 'boolean' },
      upload: { type: 'boolean' }
    }
  })
  const { src, dist, group: requested, force, upload } = values
  if (upload && (values['skip-upload'] || values['dry-run'])) throw new Error('Use --upload by itself to send packages to R2.')

  const overlay = readOverlayManifest()
  const groups = requiredPackageFiles(overlay)
  const targets = requested ? [...new Set(requested)].sort() : [...groups.keys()].sort()
  const sources = targets.map((group) => {
    const required = groups.get(group)
    if (!required) throw new Error(`Group is not in the overlay manifest: ${group}`)
    const dir = path.join(src, group)
    return { group, dir, required, ...inspectPackageSource(dir, required) }
  })
  const existing = readPackageManifest()
  const packages = Object.fromEntries(Object.entries(existing.packages).filter(([group]) => groups.has(group)))
  const matchesSource = (group: string, entry: AssetPackageEntry | undefined, hash: string): entry is AssetPackageEntry =>
    entry?.sourceSha256 === hash && entry.file === `${group}-${entry.sha256}.tar.br`

  if (values['dry-run']) {
    for (const source of sources) {
      const entry = packages[source.group]
      const current = matchesSource(source.group, entry, source.sha256) && fs.existsSync(path.join(dist, entry.file))
      console.log(`${source.group}: ${current && !force ? 'current' : 'needs packaging'} (${source.fileCount} files)`)
    }
    return
  }

  const remote = upload ? connectToR2() : undefined
  fs.mkdirSync(dist, { recursive: true })
  for (const source of sources) {
    const { group, dir, sha256: sourceSha256 } = source
    let entry = packages[group]
    const current = matchesSource(group, entry, sourceSha256)
    const staged = current && fs.existsSync(path.join(dist, entry.file))
    if (remote && !force && current && !staged) {
      const published = await verifyPublishedPackage(entry).then(
        () => true,
        () => false
      )
      if (published) {
        console.log(`Already published ${entry.file}.`)
        continue
      }
    }
    if (force || !staged) {
      const temporary = path.join(dist, `.${group}-${process.pid}.tmp`)
      try {
        const { size, fileCount } = await createTarBrotliFromDir(dir, temporary)
        if (fileCount !== source.fileCount || inspectPackageSource(dir, source.required).sha256 !== sourceSha256) {
          throw new Error(`${group} changed while being packaged. Run the command again.`)
        }
        const sha256 = await computeFileSha256(temporary)
        const file = `${group}-${sha256}.tar.br`
        fs.renameSync(temporary, path.join(dist, file))
        entry = packages[group] = {
          file,
          version: sha256.slice(0, 12),
          sha256,
          sourceSha256,
          size,
          fileCount,
          uncompressedSize: source.bytes,
          ...(group === '_global' ? {} : { dependencies: ['_global'] })
        }
        console.log(`Packaged ${group} (${entry.version}).`)
      } finally {
        fs.rmSync(temporary, { force: true })
      }
    } else {
      console.log(`Reusing ${group} (${entry.version}).`)
    }

    if (remote) {
      const archive = path.join(dist, entry.file)
      if ((await computeFileSha256(archive)) !== entry.sha256)
        throw new Error(`Local archive has changed: ${archive}. Rebuild with --force.`)
      await remote.s3.send(
        new PutObjectCommand({
          Bucket: remote.bucket,
          Key: `${ASSET_PACKAGE_BASE_PATH}/${entry.file}`,
          Body: fs.readFileSync(archive),
          ContentType: 'application/x-brotli',
          CacheControl: 'public, max-age=31536000, immutable'
        })
      )
      console.log(`Uploaded ${entry.file}.`)
    }
  }

  if (JSON.stringify(existing.packages) !== JSON.stringify(packages)) {
    if (
      hashOverlayManifest(readOverlayManifest()) !== hashOverlayManifest(overlay) ||
      JSON.stringify(readPackageManifest()) !== JSON.stringify(existing)
    ) {
      throw new Error('A manifest changed during packaging. Run the command again.')
    }
    writePackageManifest({ version: 1, generatedAt: new Date().toISOString(), baseUrl: ASSET_PACKAGE_BASE_PATH, packages })
    console.log('Updated data/cosmetic-packages.json. Prepare the manifest before creating a release tag.')
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
