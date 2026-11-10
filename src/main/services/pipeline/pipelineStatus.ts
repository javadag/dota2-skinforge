/**
 * Dota 2 SkinForge — Pipeline Status & Process Detection
 */

import { execSync } from 'child_process'
import crypto from 'crypto'
import fs from 'fs'
import path from 'path'
import { APP_CONFIG } from '../../../shared/constants/appConfig'
import * as gameinfo from '../gameinfoService'
import * as signatures from '../signatureService'

export const MOD_FOLDER_NAME = APP_CONFIG.modFolder || 'skinforge'

export function isDotaRunning(): boolean {
  try {
    const output = execSync('tasklist /FI "IMAGENAME eq dota2.exe" /NH', { encoding: 'utf-8' })
    return output.toLowerCase().includes('dota2.exe')
  } catch {
    return false
  }
}

export function getBackupDir(dotaGameDir: string, modFolder = MOD_FOLDER_NAME): string {
  return path.join(dotaGameDir, `${modFolder}.backup`)
}

export interface PipelineStatus {
  validDotaDir: boolean
  dotaRunning: boolean
  installed: boolean
  signaturesBypassed: boolean
  gameinfoConfigured: boolean
  vpkFileExists?: boolean
}

export function checkStatus(dotaGameDir?: string | null, modFolder = MOD_FOLDER_NAME): PipelineStatus {
  if (!dotaGameDir || !fs.existsSync(dotaGameDir)) {
    return {
      validDotaDir: false,
      dotaRunning: false,
      installed: false,
      signaturesBypassed: false,
      gameinfoConfigured: false
    }
  }

  const dotaRunning = isDotaRunning()
  const vpkDir = path.join(dotaGameDir, modFolder)
  const vpkFile = path.join(vpkDir, 'pak01_dir.vpk')
  const hasVpk = fs.existsSync(vpkFile)

  const giPath = gameinfo.getGameinfoPath(dotaGameDir)
  let gameinfoConfigured = false
  if (fs.existsSync(giPath)) {
    gameinfoConfigured = fs.readFileSync(giPath, 'utf-8').includes(modFolder)
  }

  const sigPath = signatures.getSignaturesPath(dotaGameDir)
  let signaturesBypassed = false
  if (fs.existsSync(sigPath) && fs.existsSync(giPath)) {
    const sigContent = fs.readFileSync(sigPath, 'utf-8')
    const sha1 = crypto.createHash('sha1').update(fs.readFileSync(giPath)).digest('hex').toUpperCase()
    signaturesBypassed = sigContent.includes(sha1)
  }

  return {
    validDotaDir: true,
    dotaRunning,
    installed: hasVpk && gameinfoConfigured && signaturesBypassed,
    signaturesBypassed,
    gameinfoConfigured,
    vpkFileExists: hasVpk
  }
}

export interface ProgressCallbackData {
  step: number
  total: number
  message: string
}

export type ProgressCallback = (progress: ProgressCallbackData) => void

export function assertDirVpk(dirVpk: string): void {
  const header = Buffer.alloc(12)
  const fd = fs.openSync(dirVpk, 'r')
  try {
    fs.readSync(fd, header, 0, 12, 0)
  } finally {
    fs.closeSync(fd)
  }
  if (header.readUInt32LE(0) !== 0x55aa1234 || header.readUInt32LE(4) !== 2) {
    throw new Error(`Packed dir VPK failed its header check: ${dirVpk}`)
  }
}
