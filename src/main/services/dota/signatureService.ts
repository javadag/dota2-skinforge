/**
 * Valve dota.signatures Checksum Integrity & Bypass Service
 */

import crypto from 'crypto'
import fs from 'fs'
import path from 'path'
import { crc32 } from './crc32'
import { getGameinfoPath } from './gameinfoService'

export function getSignaturesPath(dotaGameDir: string): string {
  const win64Path = path.join(dotaGameDir, 'bin', 'win64', 'dota.signatures')
  if (fs.existsSync(win64Path)) return win64Path
  const legacyDotaPath = path.join(dotaGameDir, 'dota', 'dota.signatures')
  if (fs.existsSync(legacyDotaPath)) return legacyDotaPath
  return win64Path
}

export function isGameinfoSigned(dotaGameDir: string, giBuffer?: Buffer | null): boolean {
  const sigPath = getSignaturesPath(dotaGameDir)
  if (!fs.existsSync(sigPath)) return false
  const giPath = getGameinfoPath(dotaGameDir)
  const buf = giBuffer ?? (fs.existsSync(giPath) ? fs.readFileSync(giPath) : null)
  if (!buf) return false
  const sha1 = crypto.createHash('sha1').update(buf).digest('hex').toUpperCase()
  return fs.readFileSync(sigPath, 'utf-8').includes(sha1)
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
  try {
    const sigPath = getSignaturesPath(dotaGameDir)
    const giPath = getGameinfoPath(dotaGameDir)

    if (!fs.existsSync(sigPath)) {
      return { success: false, reason: `dota.signatures not found at ${sigPath}` }
    }
    if (!fs.existsSync(giPath)) {
      return { success: false, reason: `gameinfo_branchspecific.gi not found at ${giPath}` }
    }

    let sigContent = fs.readFileSync(sigPath, 'utf-8')
    const digestIndex = sigContent.indexOf('DIGEST:')
    const digestEnd = digestIndex !== -1 ? sigContent.indexOf('\n', digestIndex) : -1
    const hasAppendedLines = digestIndex !== -1 && digestEnd !== -1 && sigContent.slice(digestEnd + 1).trim().length > 0

    if (backupDir) {
      fs.mkdirSync(backupDir, { recursive: true })
      const backupTarget = path.join(backupDir, 'dota.signatures')
      // Refresh backup when the live file is clean (e.g. after a Dota 2 patch reset).
      if (!fs.existsSync(backupTarget) || !hasAppendedLines) {
        fs.copyFileSync(sigPath, backupTarget)
      }
    }

    const giBuffer = fs.readFileSync(giPath)
    const sha1 = crypto.createHash('sha1').update(giBuffer).digest('hex').toUpperCase()
    const crc = formatCrc32LE(crc32(giBuffer))
    const newEntry = `...\\..\\..\\dota\\gameinfo_branchspecific.gi~SHA1:${sha1};CRC:${crc}`

    if (sigContent.includes(sha1)) {
      return { success: true, sha1, crc, newEntry, sigPath }
    }

    if (digestIndex !== -1) {
      const baseContent = digestEnd !== -1 ? sigContent.slice(0, digestEnd).replace(/\r$/, '') : sigContent
      sigContent = `${baseContent}\r\n${newEntry}\r\n`
    } else {
      sigContent = `${sigContent.trimEnd()}\r\n${newEntry}\r\n`
    }

    fs.writeFileSync(sigPath, sigContent, 'utf-8')
    return { success: true, sha1, crc, newEntry, sigPath }
  } catch (err) {
    return { success: false, reason: err instanceof Error ? err.message : String(err) }
  }
}

export type SignatureRestoreResult =
  { success: true; status: 'restored_from_backup' | 'stripped_to_digest' } | { success: false; status: 'no_backup_found' }

export function restoreSignatures(dotaGameDir: string, backupDir: string | null = null): SignatureRestoreResult {
  const sigPath = getSignaturesPath(dotaGameDir)

  // Prefer stripping appended lines after DIGEST: on the live file so a stale pre-patch backup
  // can never overwrite Valve's updated binary hashes.
  if (fs.existsSync(sigPath)) {
    const content = fs.readFileSync(sigPath, 'utf-8')
    const digestIndex = content.indexOf('DIGEST:')
    if (digestIndex !== -1) {
      const digestEnd = content.indexOf('\n', digestIndex)
      const cleanContent = (digestEnd !== -1 ? content.slice(0, digestEnd) : content).replace(/\r$/, '') + '\r\n'
      if (cleanContent !== content) {
        fs.writeFileSync(sigPath, cleanContent, 'utf-8')
      }
      return { success: true, status: 'stripped_to_digest' }
    }
  }

  if (backupDir) {
    const primaryBackup = path.join(backupDir, 'dota.signatures')
    if (fs.existsSync(primaryBackup)) {
      fs.copyFileSync(primaryBackup, sigPath)
      return { success: true, status: 'restored_from_backup' }
    }
  }

  return { success: false, status: 'no_backup_found' }
}
