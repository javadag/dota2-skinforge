/**
 * Application Path Resolution Service
 * Provides robust resolution of project root and resource directories
 * across dev, bundled (out/main), packaged electron runtime, and test environments.
 */

import fs from 'fs'
import path from 'path'

let cachedRoot: string | null = null

export function getAppRoot(): string {
  if (cachedRoot) return cachedRoot

  // Check if running inside packaged Electron
  try {
    const { app } = require('electron')
    if (app && typeof app.isPackaged === 'boolean' && app.isPackaged) {
      const p = app.getAppPath()
      if (typeof p === 'string' && p.length > 0) {
        cachedRoot = p
        return p
      }
    }
  } catch {
    // Non-electron context (e.g. CLI or tests)
  }

  // Traverse upwards from __dirname until package.json is found
  let current = __dirname
  while (current && current !== path.dirname(current)) {
    if (fs.existsSync(path.join(current, 'package.json'))) {
      cachedRoot = current
      return current
    }
    current = path.dirname(current)
  }

  // Fallback to current working directory
  const cwd = process.cwd()
  cachedRoot = cwd
  return cwd
}

export function getDataPath(...subpaths: string[]): string {
  // In packaged app, unpacked data files reside in process.resourcesPath
  if (typeof process !== 'undefined' && process.resourcesPath) {
    const resourcePath = path.join(process.resourcesPath, 'data', ...subpaths)
    if (fs.existsSync(resourcePath)) return resourcePath
  }

  const root = getAppRoot()
  const localPath = path.join(root, 'data', ...subpaths)
  if (fs.existsSync(localPath)) return localPath

  return localPath
}

export function getToolsPath(...subpaths: string[]): string {
  // In packaged app, unpacked tools reside in process.resourcesPath
  if (typeof process !== 'undefined' && process.resourcesPath) {
    const resourcePath = path.join(process.resourcesPath, 'tools', ...subpaths)
    if (fs.existsSync(resourcePath)) return resourcePath
  }

  const root = getAppRoot()
  const localPath = path.join(root, 'tools', ...subpaths)
  if (fs.existsSync(localPath)) return localPath

  return localPath
}

export function getAssetsPath(...subpaths: string[]): string {
  // In packaged app, unpacked assets reside in process.resourcesPath
  if (typeof process !== 'undefined' && process.resourcesPath) {
    const resourcePath = path.join(process.resourcesPath, 'assets', ...subpaths)
    if (fs.existsSync(resourcePath)) return resourcePath
  }

  const root = getAppRoot()
  const localPath = path.join(root, 'assets', ...subpaths)
  if (fs.existsSync(localPath)) return localPath

  return localPath
}

export function getStagingPackPath(): string {
  try {
    const { app } = require('electron')
    if (app && typeof app.isPackaged === 'boolean' && app.isPackaged) {
      return path.join(app.getPath('userData'), '.staging_pack')
    }
  } catch {
    // Non-electron context (e.g. tests or CLI)
  }
  return path.join(getAppRoot(), '.staging_pack')
}

export function getStagingIconsPath(...subpaths: string[]): string {
  return path.join(getAppRoot(), '.staging_icons', 'webp', ...subpaths)
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    getAppRoot,
    getDataPath,
    getToolsPath,
    getAssetsPath,
    getStagingPackPath,
    getStagingIconsPath
  }
}
