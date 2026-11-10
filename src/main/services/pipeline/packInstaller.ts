/**
 * Dota 2 SkinForge — Pack Installer & Uninstaller
 * Copies mod VPKs, modifies gameinfo search paths, and updates dota.signatures integrity.
 */

import fs from 'fs'
import path from 'path'
import * as gameinfo from '../gameinfoService'
import * as signatures from '../signatureService'
import { buildPack, type BuildPackResult } from './bundleBuilder'
import { getBackupDir, isDotaRunning, MOD_FOLDER_NAME, type ProgressCallback } from './pipelineStatus'
import { buildSelectionPack, type SelectionPick, type SelectionReport } from './selectionBuilder'

export type InstallResult =
  | { success: true; patchedCount: number; pack: BuildPackResult; report?: SelectionReport }
  | { success: false; error: string; patchedCount?: number }

export type UninstallResult = { success: true } | { success: false; error: string }

export interface InstallOptions {
  bundleDir?: string
  baseItemsGame?: string
  sanitize?: boolean
  /** Folder name inside `game/`. Defaults to the app config (`skinforge`). */
  modFolder?: string
}

/**
 * Install a built pack into the game: copy the VPK, mount the mod folder and refresh
 * the integrity signature. Requires Dota 2 to be closed.
 */
export async function installPack(
  dotaGameDir: string,
  pack: BuildPackResult,
  onProgress: ProgressCallback = () => {},
  modFolder = MOD_FOLDER_NAME
): Promise<InstallResult> {
  if (!fs.existsSync(dotaGameDir)) throw new Error('Invalid Dota 2 game directory.')
  if (isDotaRunning()) {
    throw new Error('Dota 2 is currently running. Please close Dota 2 before installing mods.')
  }

  const backupDir = getBackupDir(dotaGameDir, modFolder)
  fs.mkdirSync(backupDir, { recursive: true })

  onProgress({ step: 1, total: 3, message: 'Copying VPK into the game...' })
  const targetModDir = path.join(dotaGameDir, modFolder)
  // A previous pack may have left extra chunks behind; the game reads every pak01_*.
  fs.rmSync(targetModDir, { recursive: true, force: true })
  fs.mkdirSync(targetModDir, { recursive: true })
  const targetDirVpk = path.join(targetModDir, 'pak01_dir.vpk')
  const targetChunkVpk = path.join(targetModDir, 'pak01_000.vpk')
  fs.copyFileSync(pack.dirVpk, targetDirVpk)
  if (fs.existsSync(pack.chunkVpk)) fs.copyFileSync(pack.chunkVpk, targetChunkVpk)

  onProgress({ step: 2, total: 3, message: 'Injecting search paths into gameinfo...' })
  gameinfo.injectSearchPaths(dotaGameDir, modFolder, backupDir)

  onProgress({ step: 3, total: 3, message: 'Updating file integrity signatures (dota.signatures)...' })
  const signed = signatures.updateSignaturesForGameinfo(dotaGameDir, backupDir)
  if (!signed.success) {
    // Never leave the game mounted against an unsigned gameinfo.
    gameinfo.restoreGameinfo(dotaGameDir, backupDir)
    fs.rmSync(targetModDir, { recursive: true, force: true })
    return { success: false, error: signed.reason, patchedCount: pack.patchBlocks }
  }

  return { success: true, patchedCount: pack.patchBlocks, pack }
}

/** Build and install a bundle in one call. */
export async function installFromBundle(
  dotaGameDir: string,
  options: InstallOptions,
  onProgress: ProgressCallback = () => {}
): Promise<InstallResult> {
  if (!options.bundleDir) return { success: false, error: 'No bundle folder was given.' }
  if (isDotaRunning()) {
    return { success: false, error: 'Dota 2 is currently running. Please close Dota 2 before installing mods.' }
  }
  const pack = await buildPack(
    { bundleDir: options.bundleDir, baseItemsGame: options.baseItemsGame, sanitize: options.sanitize },
    onProgress
  )
  return installPack(dotaGameDir, pack, onProgress, options.modFolder)
}

/**
 * Catalog-driven install. User's slot selections are compiled into items_game.txt
 * and packed into Source 2 VPK.
 */
export async function installMods(
  dotaGameDir?: string | null,
  equipped: Record<string, Record<string, string>> = {},
  customizationsOrProgress: unknown = {},
  onProgress: ProgressCallback = () => {},
  options: InstallOptions = {}
): Promise<InstallResult> {
  if (!dotaGameDir || !fs.existsSync(dotaGameDir)) {
    throw new Error('Invalid Dota 2 game directory.')
  }
  if (options.bundleDir) {
    return installFromBundle(dotaGameDir, options, onProgress)
  }

  const customizations = (customizationsOrProgress ?? {}) as Record<string, Record<string, { style?: number }>>
  const picks: SelectionPick[] = []
  for (const [hero, slots] of Object.entries(equipped)) {
    for (const [slot, item] of Object.entries(slots || {})) {
      if (!item) continue
      picks.push({ hero, slot, item, style: customizations?.[hero]?.[slot]?.style })
    }
  }
  if (!picks.length) return { success: false, error: 'No cosmetics selected.' }

  const pack = await buildSelectionPack({ dotaGameDir, picks }, onProgress)
  const result = await installPack(dotaGameDir, pack, onProgress, options.modFolder)
  return result.success ? { ...result, report: pack.report } : result
}

export async function uninstallMods(
  dotaGameDir?: string | null,
  onProgress: ProgressCallback = () => {},
  modFolder = MOD_FOLDER_NAME
): Promise<UninstallResult> {
  if (!dotaGameDir || !fs.existsSync(dotaGameDir)) {
    throw new Error('Invalid Dota 2 game directory.')
  }
  if (isDotaRunning()) {
    throw new Error('Dota 2 is currently running. Please close Dota 2 before uninstalling mods.')
  }

  const backupDir = getBackupDir(dotaGameDir, modFolder)

  onProgress({ step: 1, total: 3, message: 'Restoring gameinfo search paths...' })
  gameinfo.restoreGameinfo(dotaGameDir, backupDir)

  onProgress({ step: 2, total: 3, message: 'Restoring signature verification...' })
  signatures.restoreSignatures(dotaGameDir, backupDir)

  onProgress({ step: 3, total: 3, message: 'Removing mod VPK folder...' })
  const targetModDir = path.join(dotaGameDir, modFolder)
  if (fs.existsSync(targetModDir)) fs.rmSync(targetModDir, { recursive: true, force: true })

  return { success: true }
}
