/**
 * Mods Domain IPC Handlers
 */

import { BrowserWindow, ipcMain } from 'electron'
import type { HeroAbilityIconOverrides } from '../../shared/types/abilityIcons'
import type { HeroCustomizationsMap } from '../../shared/types/customization'
import { IPC_CHANNELS, type StepProgress } from '../../shared/types/ipc'
import { storedModFolder } from '../services/app/settingsService'
import { getHeroAbilityIcons } from '../services/assets/abilityIconResolver'
import { resolveDotaPathAsync } from '../services/dota/dotaService'
import * as pipeline from '../services/pipeline'

function createProgressSender(getMainWindow: () => BrowserWindow | null) {
  return (progress: StepProgress) => {
    const mainWindow = getMainWindow()
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send(IPC_CHANNELS.modsInstallProgress, progress)
    }
  }
}

function toFailureEnvelope(err: unknown): { success: false; error: string } {
  return { success: false, error: err instanceof Error ? err.message : String(err) }
}

export function registerModsIpc(getMainWindow: () => BrowserWindow | null) {
  const sendProgress = createProgressSender(getMainWindow)

  ipcMain.handle(IPC_CHANNELS.modsCheckStatus, async (_event, customPath?: string) => {
    const dotaPath = await resolveDotaPathAsync(customPath)
    return pipeline.checkStatusAsync(dotaPath, storedModFolder())
  })

  ipcMain.handle(
    IPC_CHANNELS.modsGetHeroAbilityIcons,
    async (_event, customPath: string, hero: string, slots: Record<string, string>, styles: Record<string, { style?: number }>) => {
      const dota = await resolveDotaPathAsync(customPath)
      return dota ? getHeroAbilityIcons(dota, hero, slots, styles) : null
    }
  )

  ipcMain.handle(
    IPC_CHANNELS.modsInstall,
    async (
      _event,
      customPath?: string,
      equipped?: Record<string, Record<string, string>>,
      customizations?: HeroCustomizationsMap,
      abilityIcons?: HeroAbilityIconOverrides
    ) => {
      try {
        const dotaPath = await resolveDotaPathAsync(customPath)
        return await pipeline.installMods(dotaPath, equipped || {}, customizations || {}, sendProgress, {
          modFolder: storedModFolder(),
          abilityIcons
        })
      } catch (err) {
        return toFailureEnvelope(err)
      }
    }
  )

  ipcMain.handle(IPC_CHANNELS.modsUninstall, async (_event, customPath?: string) => {
    try {
      const dotaPath = await resolveDotaPathAsync(customPath)
      return await pipeline.uninstallMods(dotaPath, sendProgress, storedModFolder())
    } catch (err) {
      return toFailureEnvelope(err)
    }
  })
}
