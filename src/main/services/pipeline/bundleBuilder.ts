/**
 * Dota 2 SkinForge — Asset Bundle Pack Builder
 */

import fs from 'fs'
import path from 'path'
import { getStagingPackPath } from '../appPathService'
import * as packService from '../packService'
import * as vpk from '../vpkService'
import { assertDirVpk, MOD_FOLDER_NAME, type ProgressCallback } from './pipelineStatus'

export interface BuildPackOptions {
  /** Folder of game-relative assets with per-group items_patch.txt files. */
  bundleDir: string
  /** Only stage these groups (hero folders). Omit for everything. */
  includeGroups?: string[]
  /** Where to write pak01_dir.vpk + pak01_000.vpk. Defaults to the app staging folder. */
  outDir?: string
  /** Override the bundle's own items_game.txt. */
  baseItemsGame?: string
  /** Strip the pack tool's watermark / advert text. Defaults to true. */
  sanitize?: boolean
}

export interface BuildPackResult {
  outDir: string
  dirVpk: string
  chunkVpk: string
  files: number
  bytes: number
  groups: number
  patchBlocks: number
  itemsGameBytes: number
  packBytes: number
  referencedBranding: number
  merge: packService.MergeStats
}

/** Stage a bundle and pack it, without touching the game. */
export async function buildPack(options: BuildPackOptions, onProgress: ProgressCallback = () => {}): Promise<BuildPackResult> {
  const bundle = packService.readBundle(options.bundleDir)
  if (options.includeGroups?.length) {
    const want = new Set(options.includeGroups)
    const missing = options.includeGroups.filter((name) => !bundle.groups.some((g) => g.name === name))
    if (missing.length) throw new Error(`Bundle has no group(s): ${missing.join(', ')}`)
    bundle.groups = bundle.groups.filter((g) => want.has(g.name))
  }
  const stagingDir = getStagingPackPath()

  onProgress({ step: 1, total: 3, message: `Staging ${bundle.groups.length} groups from bundle...` })
  const staged = await packService.stageBundle(
    bundle,
    stagingDir,
    { baseItemsGame: options.baseItemsGame, sanitize: options.sanitize },
    (p) => onProgress({ step: 1, total: 3, message: p.message })
  )

  const outDir = options.outDir ?? path.join(stagingDir, '..', `${MOD_FOLDER_NAME}_pack`)
  fs.mkdirSync(outDir, { recursive: true })
  for (const name of fs.readdirSync(outDir)) {
    if (/^pak01_.*\.vpk$/i.test(name)) fs.rmSync(path.join(outDir, name), { force: true })
  }

  onProgress({ step: 2, total: 3, message: 'Packing assets into multi-chunk VPK...' })
  const dirVpk = path.join(outDir, 'pak01_dir.vpk')
  const packed = await vpk.pack(stagingDir, dirVpk)
  if (typeof packed !== 'object' || !('ok' in packed) || !packed.ok) {
    throw new Error(`VPK packing failed: ${JSON.stringify(packed)}`)
  }

  try {
    fs.rmSync(stagingDir, { recursive: true, force: true })
  } catch {
    // Staging cleanup is best effort.
  }

  const chunkVpk = path.join(outDir, 'pak01_000.vpk')

  // The packer writes the tree last; a truncated dir VPK is silent otherwise.
  assertDirVpk(dirVpk)

  const packBytes = (fs.existsSync(dirVpk) ? fs.statSync(dirVpk).size : 0) + (fs.existsSync(chunkVpk) ? fs.statSync(chunkVpk).size : 0)

  onProgress({ step: 3, total: 3, message: `Packed ${staged.files} files.` })

  return {
    outDir,
    dirVpk,
    chunkVpk,
    files: staged.files,
    bytes: staged.bytes,
    groups: staged.groups,
    patchBlocks: staged.patchBlocks,
    itemsGameBytes: staged.itemsGameBytes,
    packBytes,
    referencedBranding: staged.referencedBranding,
    merge: staged.merge
  }
}
