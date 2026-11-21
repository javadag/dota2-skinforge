/**
 * Steam & Dota 2 Installation, Process Detection, and Launch Service
 */

import { execFile, execSync, spawn } from 'child_process'
import fs from 'fs'
import path from 'path'
import { promisify } from 'util'
import { readStoredSettings } from '../app/settingsService'

const execFileAsync = promisify(execFile)
const DEFAULT_STEAM_PATH = 'C:\\Program Files (x86)\\Steam'

function parseSteamRegistryOutput(output: string): string | null {
  const match = output.match(/SteamPath\s+REG_SZ\s+(.+)/i)
  return match?.[1] ? match[1].trim().replace(/\//g, '\\') : null
}

export function getSteamPathFromRegistry(): string | null {
  try {
    const output = execSync('reg query "HKCU\\Software\\Valve\\Steam" /v SteamPath', {
      encoding: 'utf-8',
      windowsHide: true,
      timeout: 3000
    })
    return parseSteamRegistryOutput(output)
  } catch {
    return null
  }
}

export async function getSteamPathFromRegistryAsync(): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync('reg', ['query', 'HKCU\\Software\\Valve\\Steam', '/v', 'SteamPath'], {
      encoding: 'utf-8',
      windowsHide: true,
      timeout: 3000
    })
    return parseSteamRegistryOutput(stdout)
  } catch {
    return null
  }
}

export function parseLibraryFolders(vdfContent: string): string[] {
  const libraries: string[] = []
  const pathRegex = /"path"\s+"([^"]+)"/g
  let match: RegExpExecArray | null
  while ((match = pathRegex.exec(vdfContent)) !== null) {
    libraries.push(match[1].replace(/\\\\/g, '\\'))
  }
  return libraries
}

export function isValidDotaGameDir(dirPath?: string | null): boolean {
  if (!dirPath || !fs.existsSync(dirPath)) return false
  const dotaDir = path.join(dirPath, 'dota')
  const gameinfo = path.join(dotaDir, 'gameinfo.gi')
  return fs.existsSync(dotaDir) && fs.existsSync(gameinfo)
}

function detectDotaPathWithSteam(steamPath: string): string | null {
  const vdfPath = path.join(steamPath, 'steamapps', 'libraryfolders.vdf')
  const candidates: string[] = []

  if (fs.existsSync(vdfPath)) {
    try {
      const content = fs.readFileSync(vdfPath, 'utf-8')
      for (const lib of parseLibraryFolders(content)) {
        candidates.push(path.join(lib, 'steamapps', 'common', 'dota 2 beta', 'game'))
      }
    } catch {
      // Ignore VDF read error
    }
  }

  for (const drive of ['C', 'D', 'E', 'F', 'G']) {
    candidates.push(`${drive}:\\SteamLibrary\\steamapps\\common\\dota 2 beta\\game`)
    candidates.push(`${drive}:\\Program Files (x86)\\Steam\\steamapps\\common\\dota 2 beta\\game`)
    candidates.push(`${drive}:\\Steam\\steamapps\\common\\dota 2 beta\\game`)
  }

  for (const cand of candidates) {
    if (isValidDotaGameDir(cand)) return path.resolve(cand)
  }
  return null
}

export function detectDotaPath(): string | null {
  const steamPath = getSteamPathFromRegistry() || DEFAULT_STEAM_PATH
  return detectDotaPathWithSteam(steamPath)
}

export async function detectDotaPathAsync(): Promise<string | null> {
  const steamPath = (await getSteamPathFromRegistryAsync()) || DEFAULT_STEAM_PATH
  return detectDotaPathWithSteam(steamPath)
}

/**
 * Resolve the effective Dota 2 game directory without blocking the main thread:
 * explicit valid IPC path -> persisted valid custom path -> automatic detection.
 */
export async function resolveDotaPathAsync(customPath?: string | null): Promise<string | null> {
  if (typeof customPath === 'string' && customPath.trim() && isValidDotaGameDir(customPath.trim())) {
    return path.resolve(customPath.trim())
  }
  const saved = readStoredSettings().dotaPath
  if (typeof saved === 'string' && saved.trim() && isValidDotaGameDir(saved.trim())) {
    return path.resolve(saved.trim())
  }
  return detectDotaPathAsync()
}

export function isDotaRunning(): boolean {
  try {
    const output = execSync('tasklist /FI "IMAGENAME eq dota2.exe" /NH', {
      encoding: 'utf-8',
      windowsHide: true,
      timeout: 3000
    })
    return output.toLowerCase().includes('dota2.exe')
  } catch {
    return false
  }
}

export async function isDotaRunningAsync(): Promise<boolean> {
  try {
    const { stdout } = await execFileAsync('tasklist', ['/FI', 'IMAGENAME eq dota2.exe', '/NH'], {
      encoding: 'utf-8',
      windowsHide: true,
      timeout: 3000
    })
    return stdout.toLowerCase().includes('dota2.exe')
  } catch {
    return false
  }
}

export async function findSteamExe(): Promise<string | null> {
  const regPath = await getSteamPathFromRegistryAsync()
  const candidates = [
    regPath ? path.join(regPath, 'steam.exe') : null,
    'C:\\Program Files (x86)\\Steam\\steam.exe',
    'C:\\Program Files\\Steam\\steam.exe',
    'D:\\Steam\\steam.exe',
    'E:\\Steam\\steam.exe'
  ].filter((p): p is string => Boolean(p))

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate
  }
  return null
}

function parseLaunchArgs(args: string): string[] {
  const matches: string[] = []
  const regex = /[^\s"']+|"([^"]*)"|'([^']*)'/g
  let match: RegExpExecArray | null
  while ((match = regex.exec(args)) !== null) {
    if (match[1] !== undefined) matches.push(match[1])
    else if (match[2] !== undefined) matches.push(match[2])
    else matches.push(match[0])
  }
  return matches
}

export async function launchDotaViaSteam(
  launchArgs: string | undefined,
  openExternalUrl: (url: string) => Promise<void>
): Promise<{ success: boolean; method?: string; error?: string }> {
  const rawArgs = typeof launchArgs === 'string' ? launchArgs.trim() : ''
  const steamExe = await findSteamExe()

  if (steamExe) {
    try {
      await new Promise<void>((resolve, reject) => {
        const child = spawn(steamExe, ['-applaunch', '570', ...parseLaunchArgs(rawArgs)], {
          detached: true,
          stdio: 'ignore'
        })
        child.once('error', reject)
        child.once('spawn', () => {
          child.unref()
          resolve()
        })
      })
      return { success: true, method: 'steam-exe' }
    } catch (err) {
      console.warn('[DotaService] Failed to launch Dota 2 via steam.exe, falling back to URL protocol:', err)
    }
  }

  try {
    const url = rawArgs ? `steam://run/570//${encodeURIComponent(rawArgs)}/` : 'steam://run/570'
    await openExternalUrl(url)
    return { success: true, method: 'steam-url' }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
}
