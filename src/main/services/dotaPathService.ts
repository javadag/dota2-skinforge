/**
 * Steam Library & Dota 2 Installation Path Detection Service
 */

import fs from 'fs'
import path from 'path'
import { execSync } from 'child_process'

export function getSteamPathFromRegistry(): string | null {
  try {
    const output = execSync('reg query "HKCU\\Software\\Valve\\Steam" /v SteamPath', {
      encoding: 'utf-8'
    })
    const match = output.match(/SteamPath\s+REG_SZ\s+(.+)/i)
    if (match && match[1]) {
      return match[1].trim().replace(/\//g, '\\')
    }
  } catch {
    // Registry query failed or not on Windows
  }
  return null
}

export function parseLibraryFolders(vdfContent: string): string[] {
  const libraries: string[] = []
  const pathRegex = /"path"\s+"([^"]+)"/g
  let match: RegExpExecArray | null
  while ((match = pathRegex.exec(vdfContent)) !== null) {
    const libPath = match[1].replace(/\\\\/g, '\\')
    libraries.push(libPath)
  }
  return libraries
}

export function isValidDotaGameDir(dirPath?: string | null): boolean {
  if (!dirPath || !fs.existsSync(dirPath)) return false
  const gameinfo = path.join(dirPath, 'dota', 'gameinfo.gi')
  const dotaDir = path.join(dirPath, 'dota')
  return fs.existsSync(dotaDir) && fs.existsSync(gameinfo)
}

export function detectDotaPath(): string | null {
  const steamPath = getSteamPathFromRegistry() || 'C:\\Program Files (x86)\\Steam'
  const vdfPath = path.join(steamPath, 'steamapps', 'libraryfolders.vdf')

  const candidates: string[] = []

  if (fs.existsSync(vdfPath)) {
    try {
      const content = fs.readFileSync(vdfPath, 'utf-8')
      const libs = parseLibraryFolders(content)
      for (const lib of libs) {
        const potential = path.join(lib, 'steamapps', 'common', 'dota 2 beta', 'game')
        candidates.push(potential)
      }
    } catch {
      // Ignore VDF read error
    }
  }

  // Common fallback drive paths
  const driveLetters = ['C', 'D', 'E', 'F', 'G']
  for (const drive of driveLetters) {
    candidates.push(`${drive}:\\SteamLibrary\\steamapps\\common\\dota 2 beta\\game`)
    candidates.push(`${drive}:\\Program Files (x86)\\Steam\\steamapps\\common\\dota 2 beta\\game`)
    candidates.push(`${drive}:\\Steam\\steamapps\\common\\dota 2 beta\\game`)
  }

  for (const cand of candidates) {
    if (isValidDotaGameDir(cand)) {
      return path.resolve(cand)
    }
  }

  return null
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    detectDotaPath,
    isValidDotaGameDir,
    parseLibraryFolders,
    getSteamPathFromRegistry
  }
}
