/**
 * System Domain IPC Handlers
 */

import { ipcMain, shell } from 'electron'
import fs from 'fs'
import path from 'path'
import { APP_CONFIG } from '../../shared/constants/appConfig'
import * as dotaPathModule from '../services/dotaPathService'
import * as pipeline from '../services/pipelineService'

interface HeroItem {
  id?: number | string
  name?: string
  tag?: string
  [key: string]: unknown
}

interface HeroesData {
  heroes: HeroItem[]
  groups: string[]
}

export function registerSystemIpc() {
  ipcMain.handle('get-initial-data', async () => {
    const dotaPath = dotaPathModule.detectDotaPath()
    const status = pipeline.checkStatus(dotaPath)

    let heroesData: HeroesData = { heroes: [], groups: [] }
    const heroesJsonPath = path.resolve(__dirname, '../../../data/heroes.json')
    if (fs.existsSync(heroesJsonPath)) {
      try {
        heroesData = JSON.parse(fs.readFileSync(heroesJsonPath, 'utf8')) as HeroesData
      } catch (e: unknown) {
        console.error('Failed to read heroes.json:', e)
      }
    }

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
  module.exports = { registerSystemIpc }
}
