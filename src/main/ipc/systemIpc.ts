/**
 * System Domain IPC Handlers
 */

import { spawn } from 'child_process'
import { app, ipcMain, shell } from 'electron'
import fs from 'fs'
import path from 'path'
import { APP_CONFIG } from '../../shared/constants/appConfig'
import * as dotaPathModule from '../services/dotaPathService'
import * as pipeline from '../services/pipelineService'
import { storedModFolder } from '../services/settingsStore'

function findSteamExe(): string | null {
  const regPath = dotaPathModule.getSteamPathFromRegistry()
  const candidates = [
    regPath ? path.join(regPath, 'steam.exe') : null,
    'C:\\Program Files (x86)\\Steam\\steam.exe',
    'C:\\Program Files\\Steam\\steam.exe',
    'D:\\Steam\\steam.exe',
    'E:\\Steam\\steam.exe'
  ].filter((p): p is string => Boolean(p))

  for (const p of candidates) {
    if (fs.existsSync(p)) return p
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

export function registerSystemIpc() {
  ipcMain.handle('get-initial-data', async () => {
    const dotaPath = dotaPathModule.detectDotaPath()
    const status = pipeline.checkStatus(dotaPath, storedModFolder())

    // The hero list and the categories are derived in the renderer from the armory files
    // it already bundles; only app/session state crosses this bridge now.
    const runtimeVersion = (typeof app?.getVersion === 'function' && app.getVersion()) || APP_CONFIG.version
    const appInfo = {
      ...APP_CONFIG,
      version: runtimeVersion,
      displayVersion: `v${runtimeVersion.replace(/^v/, '')}`
    }

    return {
      appInfo,
      dotaPath,
      status
    }
  })

  ipcMain.handle('open-external', async (_event, url?: string) => {
    if (url && (url.startsWith('https://') || url.startsWith('http://') || url.startsWith('steam://'))) {
      await shell.openExternal(url)
    }
  })

  ipcMain.handle('launch-dota', async (_event, launchArgs?: string) => {
    const rawArgs = typeof launchArgs === 'string' ? launchArgs.trim() : ''
    const steamExe = findSteamExe()

    if (steamExe) {
      try {
        const spawnArgs = ['-applaunch', '570', ...parseLaunchArgs(rawArgs)]
        const child = spawn(steamExe, spawnArgs, {
          detached: true,
          stdio: 'ignore'
        })
        child.unref()
        return { success: true, method: 'steam-exe' }
      } catch (err: unknown) {
        console.warn('Failed to launch Dota 2 via steam.exe, falling back to URL protocol:', err)
      }
    }

    try {
      const url = rawArgs ? `steam://run/570//${encodeURIComponent(rawArgs)}/` : 'steam://run/570'
      await shell.openExternal(url)
      return { success: true, method: 'steam-url' }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      return { success: false, error: msg }
    }
  })
}
