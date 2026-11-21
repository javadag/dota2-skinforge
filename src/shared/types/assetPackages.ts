/**
 * Asset Package Manifest Types
 *
 * Defines the contract for downloadable asset packages stored in Cloudflare R2
 * and cached locally by the Electron client.
 */

export interface AssetPackageEntry {
  /** Package file name in R2 (e.g., 'antimage.zip') */
  file: string
  /** Semantic version or content hash version of the package */
  version: string
  /** SHA-256 hex digest of the archive for integrity verification */
  sha256: string
  /** Hash of game-relative paths and source file bytes, independent of archive timestamps. */
  sourceSha256?: string
  /** Archive size in bytes */
  size: number
  /** Approximate uncompressed size in bytes */
  uncompressedSize?: number
  /** Number of files contained in this package */
  fileCount?: number
  /** Other packages that must be present (e.g. ['_global']) */
  dependencies?: string[]
}

export interface AssetPackageManifest {
  version: number
  /** Version 2 manifests pin asset packages to this app version. */
  appVersion?: string
  /** Hash of the overlay manifest this package set was checked against. */
  overlaySha256?: string
  generatedAt: string
  /** Relative base URL prefix or path inside CDN bucket */
  baseUrl?: string
  /** Map of group name (e.g. 'antimage', '_global', 'rubick') to package entry */
  packages: Record<string, AssetPackageEntry>
}

export const ASSET_PACKAGE_BASE_PATH = 'cosmetic-assets/packages'
