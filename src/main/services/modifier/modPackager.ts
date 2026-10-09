/**
 * Staging directory unpacker & mod package compiler
 */

import fs from 'fs'
import path from 'path'
import { exec } from 'child_process'
import util from 'util'
import { applyModModifications } from './compiler'

const execPromise = util.promisify(exec)

export interface ModProgressData {
  step: number
  total: number
  message: string
}

export interface VpkServiceLike {
  extract: (vpkPath: string, internalPath: string, outFilePath: string) => Promise<unknown>
}

export interface ModPackageResult {
  success: boolean
  patchedCount: number
}

export async function generateModPackage(
  dotaGameDir: string,
  stagingDir: string,
  equipped: Record<string, Record<string, string>> = {},
  onProgress: (progress: ModProgressData) => void = () => {},
  vpkService?: VpkServiceLike
): Promise<ModPackageResult> {
  if (fs.existsSync(stagingDir)) {
    fs.rmSync(stagingDir, { recursive: true, force: true })
  }
  fs.mkdirSync(stagingDir, { recursive: true })

  const templateZip = path.resolve(__dirname, '../../../../data/mod_template.zip')
  if (!fs.existsSync(templateZip)) {
    throw new Error(`Base template archive missing at ${templateZip}`)
  }

  // Extract base template assets
  onProgress({ step: 3, total: 5, message: 'Unpacking base mod template assets...' })
  await execPromise(`tar -xf "${templateZip}" -C "${stagingDir}"`)

  // Try extracting the game's actual up-to-date items_game.txt and localization
  const dotaVpk = path.join(dotaGameDir, 'dota', 'pak01_dir.vpk')
  const targetItemsGame = path.join(stagingDir, 'scripts', 'items', 'items_game.txt')
  let baseContent: string

  if (vpkService && fs.existsSync(dotaVpk)) {
    try {
      onProgress({ step: 3, total: 5, message: 'Extracting fresh items schema from Dota 2...' })
      await vpkService.extract(dotaVpk, 'scripts/items/items_game.txt', targetItemsGame)

      const targetLoc = path.join(stagingDir, 'resource', 'localization', 'dota_english.txt')
      try {
        await vpkService.extract(dotaVpk, 'resource/localization/dota_english.txt', targetLoc)
      } catch {
        // Localization is optional
      }
    } catch {
      // Fallback to template's items_game.txt
    }
  }

  if (fs.existsSync(targetItemsGame)) {
    baseContent = fs.readFileSync(targetItemsGame, 'utf-8')
  } else {
    throw new Error('Failed to find base items_game.txt')
  }

  onProgress({ step: 3, total: 5, message: 'Compiling custom loadouts into items schema...' })
  const { modifiedContent, patchedCount } = applyModModifications(baseContent, equipped)

  fs.writeFileSync(targetItemsGame, modifiedContent, 'utf-8')

  return { success: true, patchedCount }
}

export default generateModPackage
