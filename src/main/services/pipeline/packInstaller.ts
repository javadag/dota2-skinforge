/**
 * Dota 2 SkinForge — Pack Installer & Uninstaller
 * Copies mod VPKs, modifies gameinfo search paths, and updates dota.signatures integrity.
 */

import fs from 'fs'
import path from 'path'
import { sanitizeModFolder } from '../../../shared/constants/appConfig'
import { countAbilityIconOverrides, type HeroAbilityIconOverrides } from '../../../shared/types/abilityIcons'
import type { HeroCustomizationsMap } from '../../../shared/types/customization'
import * as gameinfo from '../dota/gameinfoService'
import * as signatures from '../dota/signatureService'
import { getBackupDir, isDotaRunningAsync, MOD_FOLDER_NAME, type ProgressCallback } from './pipelineStatus'
import { buildSelectionPack, type PackedVpkResult, type SelectionPick, type SelectionReport } from './selectionBuilder'

let pipelineBusy = false

async function withPipelineLock<T>(fn: () => Promise<T>): Promise<T> {
  if (pipelineBusy) {
    throw new Error('Another install or uninstall operation is already in progress.')
  }
  pipelineBusy = true
  try {
    return await fn()
  } finally {
    pipelineBusy = false
  }
}

export type InstallResult =
  | { success: true; patchedCount: number; pack: PackedVpkResult; report?: SelectionReport }
  | { success: false; error: string; patchedCount?: number }

export type UninstallResult = { success: true } | { success: false; error: string }

export interface InstallOptions {
  abilityIcons?: HeroAbilityIconOverrides
  /** Folder name inside `game/`. Defaults to the app config (`skinforge`). */
  modFolder?: string
}

async function installPackUnlocked(
  dotaGameDir: string,
  pack: PackedVpkResult,
  onProgress: ProgressCallback = () => {},
  modFolder = MOD_FOLDER_NAME
): Promise<InstallResult> {
  if (!fs.existsSync(dotaGameDir)) throw new Error('Invalid Dota 2 game directory.')
  if (await isDotaRunningAsync()) {
    throw new Error('Dota 2 is currently running. Please close Dota 2 before installing mods.')
  }

  const safeModFolder = sanitizeModFolder(modFolder)
  const backupDir = getBackupDir(dotaGameDir, safeModFolder)
  fs.mkdirSync(backupDir, { recursive: true })

  onProgress({ step: 1, total: 3, message: 'Copying VPK into the game...' })
  const targetModDir = path.join(dotaGameDir, safeModFolder)
  // A previous pack may have left extra chunks behind; the game reads every pak01_*.
  fs.rmSync(targetModDir, { recursive: true, force: true })
  fs.mkdirSync(targetModDir, { recursive: true })
  const targetDirVpk = path.join(targetModDir, 'pak01_dir.vpk')
  const targetChunkVpk = path.join(targetModDir, 'pak01_000.vpk')
  fs.copyFileSync(pack.dirVpk, targetDirVpk)
  if (fs.existsSync(pack.chunkVpk)) fs.copyFileSync(pack.chunkVpk, targetChunkVpk)

  const rollback = (restoreGameinfo: boolean): void => {
    // Never leave the game mounted against an unsigned gameinfo or partial mod folder.
    if (restoreGameinfo) {
      try {
        gameinfo.restoreGameinfo(dotaGameDir, backupDir)
      } catch {}
    }
    try {
      fs.rmSync(targetModDir, { recursive: true, force: true })
    } catch {}
  }

  let gameinfoModified = false
  try {
    onProgress({ step: 2, total: 3, message: 'Injecting search paths into gameinfo...' })
    gameinfo.injectSearchPaths(dotaGameDir, safeModFolder, backupDir)
    gameinfoModified = true

    onProgress({ step: 3, total: 3, message: 'Updating file integrity signatures (dota.signatures)...' })
    const signed = signatures.updateSignaturesForGameinfo(dotaGameDir, backupDir)
    if (!signed.success) {
      rollback(true)
      return { success: false, error: signed.reason, patchedCount: pack.patchBlocks }
    }
  } catch (err) {
    rollback(gameinfoModified)
    throw err
  }

  return { success: true, patchedCount: pack.patchBlocks, pack }
}

/**
 * Install a built pack into the game: copy the VPK, mount the mod folder and refresh
 * the integrity signature. Requires Dota 2 to be closed.
 */
export async function installPack(
  dotaGameDir: string,
  pack: PackedVpkResult,
  onProgress: ProgressCallback = () => {},
  modFolder = MOD_FOLDER_NAME
): Promise<InstallResult> {
  return withPipelineLock(() => installPackUnlocked(dotaGameDir, pack, onProgress, modFolder))
}

/**
 * Armory-driven install. User's slot selections are compiled into items_game.txt
 * and packed into a Source 2 VPK.
 */
export async function installMods(
  dotaGameDir?: string | null,
  equipped: Record<string, Record<string, string>> = {},
  customizations: HeroCustomizationsMap = {},
  onProgress: ProgressCallback = () => {},
  options: InstallOptions = {}
): Promise<InstallResult> {
  return withPipelineLock(async () => {
    if (!dotaGameDir || !fs.existsSync(dotaGameDir)) {
      throw new Error('Invalid Dota 2 game directory.')
    }
    if (await isDotaRunningAsync()) {
      throw new Error('Dota 2 is currently running. Please close Dota 2 before installing mods.')
    }

    const picks: SelectionPick[] = []
    for (const [hero, slots] of Object.entries(equipped)) {
      for (const [slot, item] of Object.entries(slots || {})) {
        if (!item) continue
        picks.push({ hero, slot, item, style: customizations?.[hero]?.[slot]?.style })
      }
    }
    if (!picks.length && !countAbilityIconOverrides(options.abilityIcons ?? {})) {
      return { success: false, error: 'No cosmetics or ability icons selected.' }
    }

    const pack = await buildSelectionPack({ dotaGameDir, picks, abilityIcons: options.abilityIcons }, onProgress)
    try {
      const result = await installPackUnlocked(dotaGameDir, pack, onProgress, options.modFolder)
      return result.success ? { ...result, report: pack.report } : result
    } finally {
      fs.rmSync(pack.outDir, { recursive: true, force: true })
    }
  })
}

export async function uninstallMods(
  dotaGameDir?: string | null,
  onProgress: ProgressCallback = () => {},
  modFolder = MOD_FOLDER_NAME
): Promise<UninstallResult> {
  return withPipelineLock(async () => {
    if (!dotaGameDir || !fs.existsSync(dotaGameDir)) {
      throw new Error('Invalid Dota 2 game directory.')
    }
    if (await isDotaRunningAsync()) {
      throw new Error('Dota 2 is currently running. Please close Dota 2 before uninstalling mods.')
    }

    const safeModFolder = sanitizeModFolder(modFolder)
    const backupDir = getBackupDir(dotaGameDir, safeModFolder)

    onProgress({ step: 1, total: 3, message: 'Restoring gameinfo search paths...' })
    gameinfo.restoreGameinfo(dotaGameDir, backupDir)

    onProgress({ step: 2, total: 3, message: 'Restoring signature verification...' })
    signatures.restoreSignatures(dotaGameDir, backupDir)

    onProgress({ step: 3, total: 3, message: 'Removing mod VPK folder...' })
    const targetModDir = path.join(dotaGameDir, safeModFolder)
    if (fs.existsSync(targetModDir)) fs.rmSync(targetModDir, { recursive: true, force: true })
    // Remove backup directory after restore so a future Dota 2 patch never collides with stale backups.
    if (fs.existsSync(backupDir)) fs.rmSync(backupDir, { recursive: true, force: true })

    return { success: true }
  })
}
