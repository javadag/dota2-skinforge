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
  /** SHA-256 hex digest of the ZIP archive for integrity verification */
  sha256: string
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
  generatedAt: string
  /** Relative base URL prefix or path inside CDN bucket */
  baseUrl?: string
  /** Map of group name (e.g. 'antimage', '_global', 'rubick') to package entry */
  packages: Record<string, AssetPackageEntry>
}

export interface LocalPackageState {
  version: string
  sha256: string
  installedAt: string
  group: string
}
