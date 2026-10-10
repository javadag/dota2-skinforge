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
  groups?: Array<{ key: string; title: string }>
}

export interface CategoryItem {
  tag: string
  name?: string
  mods?: number
  available?: number
  img?: string
  g?: string
  [key: string]: unknown
}

export interface CategoryGroupItem {
  key: string
  title: string
}

export interface CategoriesData {
  categories: CategoryItem[]
  groups: CategoryGroupItem[]
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

export function loadCategoriesData(): CategoriesData {
  const categoriesJsonPath = getDataPath('categories.json')
  if (fs.existsSync(categoriesJsonPath)) {
    try {
      return JSON.parse(fs.readFileSync(categoriesJsonPath, 'utf8')) as CategoriesData
    } catch (e: unknown) {
      console.error('Failed to read categories.json:', e)
    }
  }
  return { categories: [], groups: [] }
}

export function registerSystemIpc() {
  ipcMain.handle('get-initial-data', async () => {
    const dotaPath = dotaPathModule.detectDotaPath()
    const status = pipeline.checkStatus(dotaPath)
    const heroesData = loadHeroesData()
    const categoriesData = loadCategoriesData()

    const groups: CategoryGroupItem[] = [
      { key: 'hero', title: 'Heroes' },
      ...(categoriesData.groups || [
        { key: 'world', title: 'World' },
        { key: 'interface', title: 'Interface' }
      ])
    ]

    return {
      appInfo: APP_CONFIG,
      dotaPath,
      status,
      heroes: heroesData.heroes || [],
      categories: categoriesData.categories || [],
      groups
    }
  })

  ipcMain.handle('open-external', async (_event, url?: string) => {
    if (url && (url.startsWith('https://') || url.startsWith('http://') || url.startsWith('steam://'))) {
      await shell.openExternal(url)
    }
  })
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { registerSystemIpc, loadHeroesData, loadCategoriesData }
}
