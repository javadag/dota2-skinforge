/**
 * Staging directory unpacker & mod package compiler
 */

import fs from 'fs'
import path from 'path'
import { exec } from 'child_process'
import util from 'util'
import { compileItemsGame, type CompileReport } from './compile'
import { getDataPath } from '../appPathService'
import type { CustomizationsMap } from './plan'

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
  report?: CompileReport
}

export async function generateModPackage(
  dotaGameDir: string,
  stagingDir: string,
  equipped: Record<string, Record<string, string>> = {},
  customizationsOrProgress: CustomizationsMap | ((progress: ModProgressData) => void) = {},
  onProgressOrVpk?: ((progress: ModProgressData) => void) | VpkServiceLike,
  vpkService?: VpkServiceLike
): Promise<ModPackageResult> {
  let customizations: CustomizationsMap
  let onProgress: (progress: ModProgressData) => void = () => {}
  let activeVpkService: VpkServiceLike | undefined

  if (typeof customizationsOrProgress === 'function') {
    onProgress = customizationsOrProgress
    customizations = {}
    activeVpkService = onProgressOrVpk as VpkServiceLike | undefined
  } else {
    customizations = customizationsOrProgress || {}
    if (typeof onProgressOrVpk === 'function') {
      onProgress = onProgressOrVpk
      activeVpkService = vpkService
    } else {
      activeVpkService = onProgressOrVpk as VpkServiceLike | undefined
    }
  }

  if (fs.existsSync(stagingDir)) {
    fs.rmSync(stagingDir, { recursive: true, force: true })
  }
  fs.mkdirSync(stagingDir, { recursive: true })

  const templateZip = getDataPath('mod_template.zip')
  if (!fs.existsSync(templateZip)) {
    throw new Error(`Base template archive missing at ${templateZip}`)
  }

  // Extract base template assets
  onProgress({ step: 3, total: 5, message: 'Unpacking base mod template assets...' })
  await execPromise(`tar -xf "${templateZip}" -C "${stagingDir}"`)

  // Extract the game's actual up-to-date items_game.txt, plus the localization used to
  // resolve style names, so the compiler reads the same data the client does.
  const dotaVpk = path.join(dotaGameDir, 'dota', 'pak01_dir.vpk')
  const targetItemsGame = path.join(stagingDir, 'scripts', 'items', 'items_game.txt')
  const targetLocalization = path.join(stagingDir, 'resource', 'localization', 'dota_english.txt')
  let localizationText: string | undefined

  if (activeVpkService && fs.existsSync(dotaVpk)) {
    try {
      onProgress({ step: 3, total: 5, message: 'Extracting fresh items schema from Dota 2...' })
      await activeVpkService.extract(dotaVpk, 'scripts/items/items_game.txt', targetItemsGame)

      try {
        await activeVpkService.extract(dotaVpk, 'resource/localization/dota_english.txt', targetLocalization)
        localizationText = fs.readFileSync(targetLocalization, 'utf-8')
      } catch {
        // Localization is optional: styles then fall back to their schema tokens.
      }
    } catch {
      // Fallback to the template's items_game.txt
    }
  }

  if (!fs.existsSync(targetItemsGame)) {
    throw new Error('Failed to find base items_game.txt')
  }
  const baseContent = fs.readFileSync(targetItemsGame, 'utf-8')

  onProgress({ step: 3, total: 5, message: 'Compiling custom loadouts into items schema...' })
  const { content, report } = compileItemsGame(baseContent, equipped, customizations, { localizationText })

  if (!report.validation.ok) {
    throw new Error(`Generated items_game.txt failed validation:\n${report.validation.errors.join('\n')}`)
  }

  fs.writeFileSync(targetItemsGame, content, 'utf-8')

  return { success: true, patchedCount: report.patchedCount, report }
}

export default generateModPackage
