/**
 * Dota 2 SkinForge — Pipeline Status
 */

import fs from 'fs'
import path from 'path'
import { APP_CONFIG } from '../../../shared/constants/appConfig'
import type { PipelineStatus, ProgressCallback, StepProgress } from '../../../shared/types/ipc'
import { isDotaRunning, isDotaRunningAsync } from '../dota/dotaService'
import * as gameinfo from '../dota/gameinfoService'
import * as signatures from '../dota/signatureService'
import { assertDirVpk } from '../dota/vpkService'

export { assertDirVpk, isDotaRunning, isDotaRunningAsync }
export type { PipelineStatus, ProgressCallback, StepProgress }

export const MOD_FOLDER_NAME = APP_CONFIG.modFolder || 'skinforge'

export function getBackupDir(dotaGameDir: string, modFolder = MOD_FOLDER_NAME): string {
  return path.join(dotaGameDir, `${modFolder}.backup`)
}

function buildStatus(dotaGameDir: string | null | undefined, modFolder: string, dotaRunning: boolean): PipelineStatus {
  if (!dotaGameDir || !fs.existsSync(dotaGameDir)) {
    return {
      validDotaDir: false,
      dotaRunning: false,
      installed: false,
      signaturesBypassed: false,
      gameinfoConfigured: false
    }
  }

  const vpkFile = path.join(dotaGameDir, modFolder, 'pak01_dir.vpk')
  const hasVpk = fs.existsSync(vpkFile)

  const giPath = gameinfo.getGameinfoPath(dotaGameDir)
  let gameinfoConfigured = false
  let giBuffer: Buffer | null = null
  if (fs.existsSync(giPath)) {
    giBuffer = fs.readFileSync(giPath)
    gameinfoConfigured = gameinfo.hasModEntry(giBuffer.toString('utf-8'), modFolder)
  }

  const signaturesBypassed = giBuffer ? signatures.isGameinfoSigned(dotaGameDir, giBuffer) : false

  return {
    validDotaDir: true,
    dotaRunning,
    installed: hasVpk && gameinfoConfigured && signaturesBypassed,
    signaturesBypassed,
    gameinfoConfigured,
    vpkFileExists: hasVpk
  }
}

export function checkStatus(dotaGameDir?: string | null, modFolder = MOD_FOLDER_NAME): PipelineStatus {
  if (!dotaGameDir || !fs.existsSync(dotaGameDir)) {
    return buildStatus(dotaGameDir, modFolder, false)
  }
  return buildStatus(dotaGameDir, modFolder, isDotaRunning())
}

export async function checkStatusAsync(dotaGameDir?: string | null, modFolder = MOD_FOLDER_NAME): Promise<PipelineStatus> {
  if (!dotaGameDir || !fs.existsSync(dotaGameDir)) {
    return buildStatus(dotaGameDir, modFolder, false)
  }
  return buildStatus(dotaGameDir, modFolder, await isDotaRunningAsync())
}
