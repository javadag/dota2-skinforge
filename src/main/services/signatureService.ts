/**
 * Valve dota.signatures Checksum Integrity & Bypass Service
 */

import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import { crc32 } from '../../shared/utils/crc32'

export function getSignaturesPath(dotaGameDir: string): string {
  const win64Path = path.join(dotaGameDir, 'bin', 'win64', 'dota.signatures')
  if (fs.existsSync(win64Path)) return win64Path
  const legacyDotaPath = path.join(dotaGameDir, 'dota', 'dota.signatures')
  if (fs.existsSync(legacyDotaPath)) return legacyDotaPath
  return win64Path
}

export function getGameinfoPath(dotaGameDir: string): string {
  return path.join(dotaGameDir, 'dota', 'gameinfo_branchspecific.gi')
}

export type SignatureUpdateResult =
  | {
      success: true
      sha1: string
      crc: string
      newEntry: string
      sigPath: string
    }
  | {
      success: false
      reason: string
    }

export function updateSignaturesForGameinfo(dotaGameDir: string, backupDir: string | null = null): SignatureUpdateResult {
  const sigPath = getSignaturesPath(dotaGameDir)
  const giPath = getGameinfoPath(dotaGameDir)

  if (!fs.existsSync(sigPath)) {
    return { success: false, reason: `dota.signatures not found at ${sigPath}` }
  }
  if (!fs.existsSync(giPath)) {
    return { success: false, reason: `gameinfo_branchspecific.gi not found at ${giPath}` }
  }

  // Backup original dota.signatures if not already backed up
  if (backupDir) {
    if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true })
    const backupTarget = path.join(backupDir, 'dota.signatures')
    if (!fs.existsSync(backupTarget)) {
      fs.copyFileSync(sigPath, backupTarget)
    }
  }

  // Calculate SHA1 and CRC32 of current gameinfo_branchspecific.gi
  const giBuffer = fs.readFileSync(giPath)
  const sha1 = crypto.createHash('sha1').update(giBuffer).digest('hex').toUpperCase()
  const crc = crc32(giBuffer).toString(16).toUpperCase().padStart(8, '0')

  const newEntry = `...\\..\\..\\dota\\gameinfo_branchspecific.gi~SHA1:${sha1};CRC:${crc}`

  let sigContent = fs.readFileSync(sigPath, 'utf-8')

  // Replace any existing gameinfo_branchspecific lines
  const regex = /\.\.\.\\\.\.\\\.\.\\dota\\gameinfo_branchspecific\.gi~SHA1:[0-9A-Fa-f]+;CRC:[0-9A-Fa-f]+/g
  if (regex.test(sigContent)) {
    sigContent = sigContent.replace(regex, newEntry)
  }

  // Ensure it is present at the end
  const lines = sigContent.split(/\r?\n/).filter((l) => l.trim().length > 0)
  const lastLine = lines[lines.length - 1]
  if (lastLine !== newEntry) {
    sigContent = lines.join('\n') + '\n' + newEntry + '\n'
  }

  fs.writeFileSync(sigPath, sigContent, 'utf-8')

  return {
    success: true,
    sha1,
    crc,
    newEntry,
    sigPath
  }
}

export type SignatureRestoreResult =
  | {
      success: true
      status: 'restored_from_backup' | 'restored_from_d2c_backup'
    }
  | {
      success: false
      status: 'no_backup_found'
    }

export function restoreSignatures(dotaGameDir: string, backupDir: string | null = null): SignatureRestoreResult {
  const sigPath = getSignaturesPath(dotaGameDir)

  if (backupDir) {
    const primaryBackup = path.join(backupDir, 'dota.signatures')
    if (fs.existsSync(primaryBackup)) {
      fs.copyFileSync(primaryBackup, sigPath)
      return { success: true, status: 'restored_from_backup' }
    }
  }

  // Check Dota2Changer backup if available
  const userProfile = process.env.USERPROFILE || ''
  const d2cBackup = path.join(userProfile, 'AppData', 'Roaming', 'Dota2ChangerLauncher', 'gameinfo_replaced', 'dota.signatures')
  if (fs.existsSync(d2cBackup)) {
    fs.copyFileSync(d2cBackup, sigPath)
    return { success: true, status: 'restored_from_d2c_backup' }
  }

  return { success: false, status: 'no_backup_found' }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    getSignaturesPath,
    getGameinfoPath,
    updateSignaturesForGameinfo,
    restoreSignatures
  }
}
