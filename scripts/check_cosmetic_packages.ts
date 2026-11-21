import path from 'node:path'
import { parseArgs } from 'node:util'
import { APP_CONFIG } from '../src/shared/constants/appConfig'
import {
  checkPackageEntries,
  DEFAULT_ASSET_SOURCE,
  hashOverlayManifest,
  inspectPackageSource,
  readOverlayManifest,
  readPackageManifest,
  requiredPackageFiles,
  verifyPublishedPackage,
  writePackageManifest
} from './lib/cosmeticPackages'

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      src: { type: 'string', default: DEFAULT_ASSET_SOURCE },
      prepare: { type: 'boolean' },
      local: { type: 'boolean' },
      tag: { type: 'string' }
    }
  })
  const { src, prepare, local } = values
  if (prepare && local) throw new Error('Use --prepare to verify both local and published packages before sealing the manifest.')
  const tag = values.tag ?? (process.env.GITHUB_REF_TYPE === 'tag' ? process.env.GITHUB_REF_NAME : undefined)
  if (tag && tag !== APP_CONFIG.displayVersion)
    throw new Error(`Tag ${tag} does not match package.json version ${APP_CONFIG.displayVersion}.`)

  const overlay = readOverlayManifest()
  const overlaySha256 = hashOverlayManifest(overlay)
  const groups = requiredPackageFiles(overlay)
  const manifest = readPackageManifest()
  if (!prepare && (manifest.version !== 2 || manifest.appVersion !== APP_CONFIG.version)) {
    throw new Error(
      `Cosmetic packages are not prepared for ${APP_CONFIG.displayVersion}. Run npm run check:assets -- --prepare after publishing the archives.`
    )
  }
  if (!prepare && manifest.overlaySha256 !== overlaySha256) {
    throw new Error('The cosmetic overlay changed after preparation. Run npm run check:assets -- --prepare again.')
  }
  checkPackageEntries(manifest, groups)

  function checkLocalSources(): void {
    const stale: string[] = []
    for (const [group, required] of groups) {
      const source = inspectPackageSource(path.join(src, group), required)
      if (manifest.packages[group].sourceSha256 !== source.sha256) stale.push(group)
    }
    if (stale.length)
      throw new Error(`Local assets changed since packaging: ${stale.join(', ')}. Run npm run sync:assets for the changed groups.`)
  }
  if (prepare || local) {
    checkLocalSources()
    console.log(`Verified ${groups.size} local package sources.`)
  }
  if (!local) {
    const remaining = Object.values(manifest.packages)
    const failures: string[] = []
    async function worker(): Promise<void> {
      let entry = remaining.shift()
      while (entry) {
        try {
          await verifyPublishedPackage(entry)
        } catch (error) {
          failures.push(error instanceof Error ? error.message : String(error))
        }
        entry = remaining.shift()
      }
    }
    await Promise.all(Array.from({ length: 4 }, () => worker()))
    if (failures.length) throw new Error(`Packages unavailable or corrupt on the CDN:\n${failures.sort().join('\n')}`)
    console.log(`Verified ${groups.size} published package sizes and SHA-256 hashes.`)
  }
  if (prepare) {
    checkLocalSources()
    if (
      hashOverlayManifest(readOverlayManifest()) !== overlaySha256 ||
      JSON.stringify(readPackageManifest()) !== JSON.stringify(manifest)
    ) {
      throw new Error('A manifest changed during verification. Run the command again.')
    }
    writePackageManifest({ ...manifest, version: 2, appVersion: APP_CONFIG.version, overlaySha256 })
    console.log(`Prepared the cosmetic package manifest for ${APP_CONFIG.displayVersion}.`)
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
