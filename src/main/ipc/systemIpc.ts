/**
 * System Domain IPC Handlers
 */

import { ipcMain, shell } from 'electron'
import { APP_CONFIG } from '../../shared/constants/appConfig'
import { IPC_CHANNELS } from '../../shared/types/ipc'
import { getRuntimeAppVersion } from '../services/app/appPaths'
import { storedModFolder } from '../services/app/settingsService'
import { launchDotaViaSteam, resolveDotaPathAsync } from '../services/dota/dotaService'
import * as pipeline from '../services/pipeline'

export function registerSystemIpc() {
  ipcMain.handle(IPC_CHANNELS.systemGetInitialData, async () => {
    const dotaPath = await resolveDotaPathAsync()
    const status = await pipeline.checkStatusAsync(dotaPath, storedModFolder())
    const runtimeVersion = getRuntimeAppVersion()
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

  ipcMain.handle(IPC_CHANNELS.systemOpenExternal, async (_event, url?: string) => {
    if (!url || typeof url !== 'string') return
    try {
      const parsed = new URL(url)
      if (parsed.protocol === 'https:' || parsed.protocol === 'http:' || parsed.protocol === 'steam:') {
        await shell.openExternal(url)
      }
    } catch {
      // Ignore malformed URLs
    }
  })

  ipcMain.handle(IPC_CHANNELS.systemLaunchDota, async (_event, launchArgs?: string) => {
    return await launchDotaViaSteam(launchArgs, (url) => shell.openExternal(url))
  })
}
