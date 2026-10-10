/**
 * Valve dota.signatures Checksum Integrity & Bypass Service
 */

import crypto from 'crypto'
import fs from 'fs'
import path from 'path'
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

export function formatCrc32LE(crcValue: number): string {
  const buf = Buffer.alloc(4)
  buf.writeUInt32LE(crcValue, 0)
  return buf.toString('hex').toUpperCase()
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

  // Calculate SHA1 and Little-Endian CRC32 of current gameinfo_branchspecific.gi
  const giBuffer = fs.readFileSync(giPath)
  const sha1 = crypto.createHash('sha1').update(giBuffer).digest('hex').toUpperCase()
  const crc = formatCrc32LE(crc32(giBuffer))

  const newEntry = `...\\..\\..\\dota\\gameinfo_branchspecific.gi~SHA1:${sha1};CRC:${crc}`

  let sigContent = fs.readFileSync(sigPath, 'utf-8')

  const digestIndex = sigContent.indexOf('DIGEST:')
  if (digestIndex !== -1) {
    const digestEnd = sigContent.indexOf('\n', digestIndex)
    const baseContent = digestEnd !== -1 ? sigContent.slice(0, digestEnd).replace(/\r$/, '') : sigContent
    sigContent = `${baseContent}\r\n${newEntry}\r\n`
  } else {
    const trimmed = sigContent.trimEnd()
    sigContent = `${trimmed}\r\n${newEntry}\r\n`
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
      status: 'restored_from_backup'
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

  // Fallback: strip any custom entries appended after the official DIGEST line
  if (fs.existsSync(sigPath)) {
    const content = fs.readFileSync(sigPath, 'utf-8')
    const digestIndex = content.indexOf('DIGEST:')
    if (digestIndex !== -1) {
      const digestEnd = content.indexOf('\n', digestIndex)
      if (digestEnd !== -1 && digestEnd < content.length - 1) {
        const cleanContent = content.slice(0, digestEnd).replace(/\r$/, '') + '\r\n'
        fs.writeFileSync(sigPath, cleanContent, 'utf-8')
        return { success: true, status: 'restored_from_backup' }
      }
    }
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
