import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import type { CosmeticAssetsManifest, PathMapping } from '../../src/main/services/assets/cosmeticAssets'
import { APP_CONFIG } from '../../src/shared/constants/appConfig'
import { ASSET_PACKAGE_BASE_PATH, type AssetPackageEntry, type AssetPackageManifest } from '../../src/shared/types/assetPackages'

export const PACKAGE_MANIFEST_PATH = 'data/cosmetic-packages.json'
export const DEFAULT_ASSET_SOURCE = process.env.SKINFORGE_ASSET_SOURCE || 'D:\\skinforge_assets'

export function readOverlayManifest(): CosmeticAssetsManifest {
  return JSON.parse(fs.readFileSync('data/cosmetic-assets.json', 'utf8'))
}

export function readPackageManifest(): AssetPackageManifest {
  return JSON.parse(fs.readFileSync(PACKAGE_MANIFEST_PATH, 'utf8'))
}

export function writePackageManifest(manifest: AssetPackageManifest): void {
  const temporary = `${PACKAGE_MANIFEST_PATH}.${crypto.randomUUID()}.tmp`
  try {
    fs.writeFileSync(temporary, JSON.stringify(manifest, null, 2) + '\n')
    fs.renameSync(temporary, PACKAGE_MANIFEST_PATH)
  } finally {
    fs.rmSync(temporary, { force: true })
  }
}

export function hashOverlayManifest(overlay: CosmeticAssetsManifest): string {
  return crypto.createHash('sha256').update(JSON.stringify(overlay)).digest('hex')
}

export function requiredPackageFiles(overlay: CosmeticAssetsManifest): Map<string, Set<string>> {
  const groups = new Map<string, Set<string>>([['_global', new Set(overlay.globalFiles ?? [])]])
  function add(files: Set<string>, overlay: { files?: string[]; aliases?: PathMapping[]; patch?: string }): void {
    for (const file of overlay.files ?? []) files.add(file)
    for (const alias of overlay.aliases ?? []) files.add(alias.src)
    if (overlay.patch) files.add(overlay.patch)
  }
  for (const item of Object.values(overlay.items)) {
    if (!/^[a-z0-9_]+$/.test(item.group)) throw new Error(`Invalid cosmetic group: ${item.group}`)
    const files = groups.get(item.group) ?? new Set<string>()
    groups.set(item.group, files)
    add(files, item)
    for (const style of Object.values(item.styles ?? {})) add(files, style)
    for (const refit of Object.values(item.refits ?? {})) {
      add(files, refit)
      for (const style of Object.values(refit.styles ?? {})) add(files, style)
    }
  }
  return groups
}

export function inspectPackageSource(dir: string, required: Iterable<string>): { sha256: string; bytes: number; fileCount: number } {
  const files = new Map<string, string>()
  function walk(current: string): void {
    for (const item of fs.readdirSync(current, { withFileTypes: true })) {
      const file = path.join(current, item.name)
      if (item.isDirectory()) walk(file)
      else if (item.isFile()) files.set(path.relative(dir, file).replace(/\\/g, '/'), file)
      else throw new Error(`Package source must contain regular files and directories: ${file}`)
    }
  }
  walk(dir)
  const missing = [...required].filter((file) => !files.has(file.replace(/\\/g, '/')))
  if (missing.length) throw new Error(`${path.basename(dir)} is missing files referenced by the overlay:\n${missing.join('\n')}`)
  if (!files.size) throw new Error(`Package source is empty: ${dir}`)

  const hash = crypto.createHash('sha256')
  let bytes = 0
  for (const rel of [...files.keys()].sort()) {
    const content = fs.readFileSync(files.get(rel)!)
    hash.update(rel).update('\0').update(crypto.createHash('sha256').update(content).digest())
    bytes += content.length
  }
  return { sha256: hash.digest('hex'), bytes, fileCount: files.size }
}

const SHA256 = /^[a-f0-9]{64}$/

export function checkPackageEntries(manifest: AssetPackageManifest, groups: ReadonlyMap<string, ReadonlySet<string>>): void {
  const missing = [...groups.keys()].filter((group) => !Object.hasOwn(manifest.packages, group))
  const obsolete = Object.keys(manifest.packages).filter((group) => !groups.has(group))
  if (missing.length || obsolete.length) {
    throw new Error(
      `Package groups differ from the overlay. Missing: ${missing.join(', ') || 'none'}. Obsolete: ${obsolete.join(', ') || 'none'}.`
    )
  }
  const unversioned = Object.entries(manifest.packages)
    .filter(
      ([group, entry]) =>
        !SHA256.test(entry.sha256) ||
        !SHA256.test(entry.sourceSha256 ?? '') ||
        entry.file !== `${group}-${entry.sha256}.tar.br` ||
        !Number.isSafeInteger(entry.size) ||
        entry.size <= 0
    )
    .map(([group]) => group)
  if (unversioned.length) throw new Error(`Rebuild packages with versioned archive names: ${unversioned.join(', ')}`)
  for (const [group, entry] of Object.entries(manifest.packages)) {
    for (const dep of entry.dependencies ?? []) {
      if (dep === group || !groups.has(dep)) throw new Error(`Invalid package dependency: ${group} -> ${dep}`)
    }
  }
}

export async function verifyPublishedPackage(entry: AssetPackageEntry, fetchImpl = fetch): Promise<void> {
  const url = `${APP_CONFIG.cdnUrl}/${ASSET_PACKAGE_BASE_PATH}/${entry.file}`
  const response = await fetchImpl(url, { signal: AbortSignal.timeout(60000) })
  if (!response.ok || !response.body) throw new Error(`${entry.file}: HTTP ${response.status}`)
  const reader = response.body.getReader()
  const hash = crypto.createHash('sha256')
  let size = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.length
      if (size > entry.size) throw new Error(`${entry.file}: size differs from manifest`)
      hash.update(value)
    }
  } finally {
    await reader.cancel().catch(() => {})
  }
  if (size !== entry.size || hash.digest('hex') !== entry.sha256) throw new Error(`${entry.file}: size or SHA-256 differs from manifest`)
}
