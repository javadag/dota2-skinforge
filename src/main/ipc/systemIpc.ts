/**
 * System Domain IPC Handlers
 */

import { ipcMain, shell } from 'electron'
import fs from 'fs'
import { APP_CONFIG } from '../../shared/constants/appConfig'
import { getDataPath } from '../services/appPathService'
import * as dotaPathModule from '../services/dotaPathService'
import * as pipeline from '../services/pipelineService'

export interface HeroItem {
  id?: number | string
  name?: string
  tag?: string
  [key: string]: unknown
}

export interface HeroesData {
  heroes: HeroItem[]
  groups: string[]
}

export function loadHeroesData(): HeroesData {
  const heroesJsonPath = getDataPath('heroes.json')
  if (fs.existsSync(heroesJsonPath)) {
    try {
      return JSON.parse(fs.readFileSync(heroesJsonPath, 'utf8')) as HeroesData
    } catch (e: unknown) {
      console.error('Failed to read heroes.json:', e)
    }
  }
  return { heroes: [], groups: [] }
}

export function registerSystemIpc() {
  ipcMain.handle('get-initial-data', async () => {
    const dotaPath = dotaPathModule.detectDotaPath()
    const status = pipeline.checkStatus(dotaPath)
    const heroesData = loadHeroesData()

    return {
      appInfo: APP_CONFIG,
      dotaPath,
      status,
      heroes: heroesData.heroes || [],
      groups: heroesData.groups || []
    }
  })

  ipcMain.handle('open-external', async (_event, url?: string) => {
    if (url && (url.startsWith('https://') || url.startsWith('http://') || url.startsWith('steam://'))) {
      await shell.openExternal(url)
    }
  })
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { registerSystemIpc, loadHeroesData }
}
