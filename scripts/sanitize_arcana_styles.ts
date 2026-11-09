/**
 * Sanitize and integrate downloaded Arcana style packs from `D:\skinforge_raw`
 * into `D:\skinforge_assets` and update `data/cosmetic-assets.json`.
 *
 *   npx tsx scripts/sanitize_arcana_styles.ts
 */

import crypto from 'crypto'
import fs from 'fs'
import path from 'path'
import zlib from 'zlib'

import * as packService from '../src/main/services/packService'
import { loadIndex } from '../src/main/services/vpkIndex'
import type { CosmeticAssetEntry, CosmeticAssetsManifest, PathMapping } from '../src/main/services/cosmeticAssets'
import { classifyGroupFile, GROUP_SPECS, type RefitSpec } from './sanitize_bundle'

const VPK_PATH = 'D:/SteamLibrary/steamapps/common/dota 2 beta/game/dota/pak01_dir.vpk'
const SRC_DIR = 'D:/skinforge_raw'
const DST_DIR = 'D:/changer_cleaned'
const MANIFEST_PATH = path.resolve('data/cosmetic-assets.json')

interface StyleDirSpec {
  dir: string
  styleIndex: number
  customRoots?: string[]
  extraAliases?: PathMapping[]
  extraValveCopies?: PathMapping[]
}

interface HeroArcanaJob {
  id: string
  name: string
  hero: string
  group: string
  basePatchIds: string[]
  styles: StyleDirSpec[]
  refits?: RefitSpec[]
  extraAliases?: PathMapping[]
  extraValveCopies?: PathMapping[]
}

const ARCANA_JOBS: HeroArcanaJob[] = [
  {
    id: '7385',
    name: 'Frost Avalanche',
    hero: 'crystal_maiden',
    group: 'crystal_maiden',
    basePatchIds: ['38'],
    styles: [{ dir: 'cm style 1', styleIndex: 0 }]
  },
  {
    id: '19090',
    name: 'Dread Retribution',
    hero: 'drow',
    group: 'drow',
    basePatchIds: ['75', '76', '77', '78', '79', '80', '267', '737', '905'],
    styles: [
      { dir: 'drow style 1', styleIndex: 0 },
      { dir: 'drow style 2', styleIndex: 1 }
    ]
  },
  {
    id: '12692',
    name: 'Planetfall',
    hero: 'earthshaker',
    group: 'earthshaker',
    basePatchIds: ['459', '460', '461', '855', '8655', '12692'],
    styles: [
      { dir: 'es style 1', styleIndex: 0 },
      { dir: 'es style 2', styleIndex: 1 }
    ]
  },
  {
    id: '9059',
    name: 'Bladeform Legacy',
    hero: 'juggernaut',
    group: 'juggernaut',
    basePatchIds: ['6', '811'],
    styles: [
      { dir: 'juggernaut style 1', styleIndex: 0 },
      { dir: 'juggernaut style 2', styleIndex: 1 }
    ]
  },
  {
    id: '9050',
    name: "Great Sage's Reckoning",
    hero: 'monkey_king',
    group: 'monkey_king',
    basePatchIds: ['594', '825'],
    styles: [
      { dir: 'mk style 1', styleIndex: 0 },
      { dir: 'mk style 3', styleIndex: 1 },
      { dir: 'mk style 2', styleIndex: 2 },
      { dir: 'mk style 4', styleIndex: 3 }
    ],
    refits: GROUP_SPECS.find((g) => g.id === '9050')?.refits
  },
  {
    id: '13670',
    name: "Flockheart's Gamble",
    hero: 'ogre_magi',
    group: 'ogre_magi',
    basePatchIds: ['135', '698', '830'],
    styles: [
      { dir: 'ogre style 1', styleIndex: 0 },
      { dir: 'ogre style 2', styleIndex: 1 }
    ],
    refits: GROUP_SPECS.find((g) => g.id === '13670')?.refits
  },
  {
    id: '7247',
    name: 'Manifold Paradox',
    hero: 'phantom_assassin',
    group: 'phantom_assassin',
    basePatchIds: ['140'],
    styles: [
      { dir: 'pa style 1', styleIndex: 0 },
      { dir: 'pa style 2', styleIndex: 1 },
      { dir: 'pa style 3', styleIndex: 2 }
    ]
  },
  {
    id: '7756',
    name: 'Feast of Abscession',
    hero: 'pudge',
    group: 'pudge',
    basePatchIds: ['258', '810'],
    styles: [
      { dir: 'pudge style 1', styleIndex: 0 },
      { dir: 'pudge style 2', styleIndex: 1 }
    ],
    extraAliases: GROUP_SPECS.find((g) => g.id === '7756')?.extraAliases
  },
  {
    id: '12930',
    name: 'Eminence of Ristul',
    hero: 'queenofpain',
    group: 'queenofpain',
    basePatchIds: ['26', '82', '83', '84'],
    styles: [
      { dir: 'qop style 1', styleIndex: 0 },
      {
        dir: 'qop style 2',
        styleIndex: 1,
        customRoots: ['kisilev_ind/models/queen_of_pain/items/wings/queenofpain_arcana_wings.vmdl_c'],
        extraAliases: [
          {
            src: 'styles/1/models/heroes/queenofpain/wings.vmdl_c',
            dst: 'models/heroes/queenofpain/wings.vmdl_c'
          },
          {
            src: 'styles/1/models/heroes/queenofpain/wings.vmdl_c',
            dst: 'models/items/queenofpain/queenofpain_arcana/queenofpain_arcana_wings.vmdl_c'
          },
          {
            src: 'styles/1/kisilev_ind/models/queen_of_pain/items/wings/queenofpain_arcana_wings.vmdl_c',
            dst: 'kisilev_ind/models/queen_of_pain/items/wings/queenofpain_arcana_wings.vmdl_c'
          },
          {
            src: 'styles/1/kisilev_ind/materials/queen_of_pain/items/queenofpain_arcana/queenofpain_arcana_base_armor_style1.vmat_c',
            dst: 'kisilev_ind/materials/queen_of_pain/items/queenofpain_arcana/queenofpain_arcana_base_armor_style1.vmat_c'
          },
          {
            src: 'styles/1/kisilev_ind/materials/queen_of_pain/items/queenofpain_arcana/queenofpain_arcana_wings_style1.vmat_c',
            dst: 'kisilev_ind/materials/queen_of_pain/items/queenofpain_arcana/queenofpain_arcana_wings_style1.vmat_c'
          }
        ],
        extraValveCopies: [
          {
            src: 'materials/models/items/queenofpain/queenofpain_arcana/queenofpain_arcana_wings_style1.vmat_c',
            dst: 'materials/models/items/queenofpain/queenofpain_arcana/queenofpain_arcana_wings.vmat_c'
          },
          {
            src: 'materials/models/items/queenofpain/queenofpain_arcana/queenofpain_arcana_head_style1.vmat_c',
            dst: 'materials/models/items/queenofpain/queenofpain_arcana/queenofpain_arcana_head.vmat_c'
          },
          {
            src: 'materials/models/items/queenofpain/queenofpain_arcana/queenofpain_arcana_crown_style1.vmat_c',
            dst: 'materials/models/items/queenofpain/queenofpain_arcana/queenofpain_arcana_crown.vmat_c'
          },
          {
            src: 'materials/models/items/queenofpain/queenofpain_arcana/queenofpain_arcana_armor_style1.vmat_c',
            dst: 'materials/models/items/queenofpain/queenofpain_arcana/queenofpain_arcana_armor.vmat_c'
          },
          {
            src: 'materials/models/items/queenofpain/queenofpain_arcana/queenofpain_arcana_dagger_style1.vmat_c',
            dst: 'materials/models/items/queenofpain/queenofpain_arcana/queenofpain_arcana_dagger.vmat_c'
          }
        ]
      }
    ]
  },
  {
    id: '23095',
    name: 'Voidstorm Asylum Tormentor',
    hero: 'razor',
    group: 'razor',
    basePatchIds: ['340', '341', '342', '343', '344'],
    styles: [
      { dir: 'razor style 1', styleIndex: 0 },
      { dir: 'razor style 2', styleIndex: 1 }
    ]
  },
  {
    id: '18539',
    name: 'The Devotions of Dragonus - Wings',
    hero: 'skywrath_mage',
    group: 'skywrath_mage',
    basePatchIds: ['420', '421', '422', '423', '424', '425'],
    styles: [
      { dir: 'skymage style 1', styleIndex: 0 },
      { dir: 'skymage style 2', styleIndex: 1 }
    ]
  },
  {
    id: '9662',
    name: 'Phantom Advent',
    hero: 'spectre',
    group: 'spectre',
    basePatchIds: ['323', '324', '325', '395', '580'],
    styles: [
      { dir: 'spectre style 1', styleIndex: 0 },
      { dir: 'spectre style 2', styleIndex: 1 }
    ]
  },
  {
    id: '37143',
    name: 'Maw of the Megalodon - Base',
    hero: 'tidehunter',
    group: 'tidehunter',
    basePatchIds: ['904'],
    styles: [
      { dir: 'tide style 1', styleIndex: 0 },
      { dir: 'tide style 2', styleIndex: 1 },
      { dir: 'tide style 3', styleIndex: 2 }
    ]
  },
  {
    id: '22718',
    name: 'The Resurrection of Shen - Wings',
    hero: 'vengeful',
    group: 'vengeful',
    basePatchIds: ['441', '442', '445', '447'],
    styles: [
      { dir: 'vengeful style 1', styleIndex: 0 },
      { dir: 'vengeful style 2', styleIndex: 1 },
      { dir: 'vengeful style 3', styleIndex: 2 }
    ]
  },
  {
    id: '18033',
    name: 'Claszian Apostasy Head',
    hero: 'faceless_void',
    group: 'faceless_void',
    basePatchIds: ['15', '90', '91', '92', '93'],
    styles: [
      { dir: 'void style 1', styleIndex: 0 },
      { dir: 'void style 2', styleIndex: 1 }
    ]
  },
  {
    id: '13456',
    name: 'Crown of the One True King',
    hero: 'wraith_king',
    group: 'wraith_king',
    basePatchIds: ['148', '149'],
    styles: [
      { dir: 'wk style 1', styleIndex: 0 },
      { dir: 'wk style 2', styleIndex: 1 }
    ]
  },
  {
    id: '13806',
    name: 'Compass of the Rising Gale',
    hero: 'windrunner',
    group: 'windrunner',
    basePatchIds: ['21', '22', '23', '24', '25', '828'],
    styles: [
      { dir: 'wr style 1', styleIndex: 0 },
      { dir: 'wr style 2', styleIndex: 1 }
    ]
  }
]

function extractEmbeddedRefs(buf: Buffer): string[] {
  const raw = buf.toString('latin1')
  const matches = raw.match(
    /(?:kisilev_ind|models|materials|particles|sounds|soundevents)\/[a-zA-Z0-9_./-]+(?:\s+skull_basher\/[a-zA-Z0-9_./-]+)?\.(?:vmdl|vmat|vtex|vpcf|vsnap|vsnd|vsndevts|vmesh|vagrp|vanim|vphys|vseq)/g
  )
  return matches ? [...new Set(matches.map((m) => `${m}_c`))] : []
}

function readZipFile(zipPath: string, targetEntry: string): Buffer | null {
  if (!fs.existsSync(zipPath)) return null
  const buf = fs.readFileSync(zipPath)
  let offset = 0
  while (offset < buf.length - 4) {
    if (buf.readUInt32LE(offset) === 0x04034b50) {
      const method = buf.readUInt16LE(offset + 8)
      const compSize = buf.readUInt32LE(offset + 18)
      const nameLen = buf.readUInt16LE(offset + 26)
      const extraLen = buf.readUInt16LE(offset + 28)
      const name = buf.toString('utf8', offset + 30, offset + 30 + nameLen)
      const dataStart = offset + 30 + nameLen + extraLen
      if (name === targetEntry) {
        const slice = buf.subarray(dataStart, dataStart + compSize)
        return method === 0 ? slice : zlib.inflateRawSync(slice)
      }
      offset = dataStart + compSize
    } else {
      offset++
    }
  }
  return null
}

function buildPatchFile(sourceItemsGameText: string, targetIds: string[]): string {
  const sourceSection = packService.readItemsSection(sourceItemsGameText)
  const blocks: string[] = []
  for (const id of targetIds) {
    const span = sourceSection.blocks.get(id)
    if (!span) continue
    const rawBlock = sourceItemsGameText.slice(span.start, span.end)
    const { text } = packService.sanitizeBlock(rawBlock)
    blocks.push(`\t\t"${id}"\n\t\t${text}`)
  }
  return `"items_game"\n{\n\t"items"\n\t{\n${blocks.join('\n')}\n\t}\n}\n`
}

interface RawFileRecord {
  diskPath: string
  gameRelPath: string
  size: number
  crc: string
  md5: string
}

function walkPackDir(packDir: string): RawFileRecord[] {
  const records: RawFileRecord[] = []
  function walk(current: string, rel: string) {
    for (const ent of fs.readdirSync(current, { withFileTypes: true })) {
      const childDisk = path.join(current, ent.name)
      const childRel = rel ? `${rel}/${ent.name}` : ent.name
      if (ent.isDirectory()) {
        if (childRel === 'dota2changer' || childRel.startsWith('dota2changer/')) continue
        walk(childDisk, childRel)
      } else {
        if (ent.name === 'items.zip' || ent.name.endsWith('.webm') || childRel.startsWith('panorama/videos/')) continue
        const data = fs.readFileSync(childDisk)
        records.push({
          diskPath: childDisk,
          gameRelPath: childRel.replace(/\\/g, '/'),
          size: data.length,
          crc: zlib.crc32(data).toString(16).padStart(8, '0'),
          md5: crypto.createHash('md5').update(data).digest('hex')
        })
      }
    }
  }
  walk(packDir, '')
  return records
}

export function sanitizeArcanaStyles(filterHero?: string): void {
  console.log(`Loading Dota VPK index from ${VPK_PATH}...`)
  const vpkIndex = fs.existsSync(VPK_PATH) ? loadIndex(VPK_PATH) : null
  if (!vpkIndex) console.warn('Warning: Dota VPK index not available. Skipping dead code reachability pruning.')

  const existingManifest: CosmeticAssetsManifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf-8'))

  for (const job of ARCANA_JOBS) {
    if (filterHero && job.hero !== filterHero && job.id !== filterHero) continue
    console.log(`\n========================================`)
    console.log(`Processing ${job.name} (${job.hero}, id: ${job.id})...`)
    const groupDstDir = path.join(DST_DIR, job.group)
    fs.mkdirSync(groupDstDir, { recursive: true })

    // Keep existing companion refits from the manifest if present
    const existingEntry = existingManifest.items[job.id]
    const preservedRefits = existingEntry?.refits

    // StyleIndex -> Map<gameRelPath, RawFileRecord>
    const styleFiles = new Map<number, Map<string, RawFileRecord>>()
    const stylePatches = new Map<number, string>()

    for (const sSpec of job.styles) {
      const styleDir = path.join(SRC_DIR, sSpec.dir)
      if (!fs.existsSync(styleDir)) {
        console.warn(`  Warning: Style dir ${styleDir} not found, skipping style ${sSpec.styleIndex}`)
        continue
      }

      // 1. Extract items_game.txt from items.zip
      let patchText = ''
      for (const ent of fs.readdirSync(styleDir, { withFileTypes: true })) {
        if (!ent.isDirectory()) continue
        const zipPath = path.join(styleDir, ent.name, 'items.zip')
        if (fs.existsSync(zipPath)) {
          const rawItems = readZipFile(zipPath, 'scripts/items/items_game.txt')
          if (rawItems) {
            patchText = buildPatchFile(rawItems.toString('utf-8'), job.basePatchIds)
            break
          }
        }
      }
      if (patchText) {
        stylePatches.set(sSpec.styleIndex, patchText)
      }

      // 2. Walk all mod pack folders in this style dir
      const records = new Map<string, RawFileRecord>()
      for (const ent of fs.readdirSync(styleDir, { withFileTypes: true })) {
        if (!ent.isDirectory()) continue
        const packDir = path.join(styleDir, ent.name)
        const packRecords = walkPackDir(packDir)
        for (const rec of packRecords) {
          // Classify
          const isDup = false // Duplicate default slot check
          const decision = classifyGroupFile(job.group, rec.gameRelPath, rec.size, rec.crc, isDup)
          if (decision === 'keep') {
            records.set(rec.gameRelPath, rec)
          }
        }
      }
      styleFiles.set(sSpec.styleIndex, records)
      console.log(`  Style ${sSpec.styleIndex} (${sSpec.dir}): ${records.size} raw files staged.`)
    }

    // 3. Reachability analysis per style
    if (vpkIndex) {
      for (const [sIndex, filesMap] of styleFiles) {
        const sSpec = job.styles.find((s) => s.styleIndex === sIndex)
        const patchContent = stylePatches.get(sIndex) || ''
        const roots = new Set<string>()
        for (const p of filesMap.keys()) {
          if (vpkIndex.entries.has(p)) roots.add(p)
        }
        for (const cr of sSpec?.customRoots ?? []) {
          if (filesMap.has(cr)) roots.add(cr)
        }
        if (patchContent) {
          for (const ref of extractEmbeddedRefs(Buffer.from(patchContent, 'utf-8'))) {
            if (filesMap.has(ref)) roots.add(ref)
          }
        }
        const reachable = new Set<string>(roots)
        const queue: string[] = [...roots]
        while (queue.length > 0) {
          const cur = queue.shift()!
          const rec = filesMap.get(cur)
          if (!rec) continue
          if (!/\.(vmdl_c|vpcf_c|vmat_c|vsndevts_c)$/.test(cur)) continue
          const data = fs.readFileSync(rec.diskPath)
          for (const ref of extractEmbeddedRefs(data)) {
            if (filesMap.has(ref) && !reachable.has(ref)) {
              reachable.add(ref)
              queue.push(ref)
            }
          }
        }
        // Filter out unreachable files
        for (const p of Array.from(filesMap.keys())) {
          if (!reachable.has(p)) filesMap.delete(p)
        }
        console.log(`    After reachability: ${filesMap.size} files reachable in style ${sIndex}.`)
      }
    }

    // 4. Partition files into common vs style-specific
    const allPaths = new Set<string>()
    for (const filesMap of styleFiles.values()) {
      for (const p of filesMap.keys()) allPaths.add(p)
    }

    const commonPaths = new Set<string>()
    const numStyles = styleFiles.size
    for (const p of allPaths) {
      // Check if p is present in every style with identical MD5
      let inAll = true
      let firstMd5: string | null = null
      for (const filesMap of styleFiles.values()) {
        const rec = filesMap.get(p)
        if (!rec) {
          inAll = false
          break
        }
        if (firstMd5 === null) firstMd5 = rec.md5
        else if (firstMd5 !== rec.md5) {
          inAll = false
          break
        }
      }
      if (inAll && numStyles > 1) {
        commonPaths.add(p)
      }
    }

    console.log(`  Identified ${commonPaths.size} common files across styles.`)

    // Write common files to D:\skinforge_assets\<group>/<p>
    const baseFiles: string[] = []
    const baseAliases: PathMapping[] = []
    const baseMd5ToRel = new Map<string, string>()

    for (const p of commonPaths) {
      // Get the record from style 0
      const rec = Array.from(styleFiles.values())[0].get(p)!
      const existing = baseMd5ToRel.get(rec.md5)
      if (existing) {
        baseAliases.push({ src: existing, dst: p })
      } else {
        baseMd5ToRel.set(rec.md5, p)
        baseFiles.push(p)
        const dstFull = path.join(groupDstDir, p.replace(/\//g, path.sep))
        fs.mkdirSync(path.dirname(dstFull), { recursive: true })
        fs.copyFileSync(rec.diskPath, dstFull)
      }
    }

    // Style overrides
    const stylesRecord: Record<string, { files?: string[]; aliases?: PathMapping[]; patch?: string; valveCopies?: PathMapping[] }> = {}

    // Track path collision across styles
    const pathToStyles = new Map<string, number[]>()
    for (const [sIndex, filesMap] of styleFiles) {
      for (const p of filesMap.keys()) {
        if (commonPaths.has(p)) continue
        const list = pathToStyles.get(p) ?? []
        list.push(sIndex)
        pathToStyles.set(p, list)
      }
    }

    for (const [sIndex, filesMap] of styleFiles) {
      const sFiles: string[] = []
      const sAliases: PathMapping[] = []
      const sMd5ToRel = new Map<string, string>()

      for (const [p, rec] of filesMap) {
        if (commonPaths.has(p)) continue

        const collisionList = pathToStyles.get(p) ?? []
        const hasCollision = collisionList.length > 1
        const storedRel = hasCollision ? `styles/${sIndex}/${p}` : p
        const targetVpkPath = p

        const existingCommon = baseMd5ToRel.get(rec.md5)
        const existingStyle = sMd5ToRel.get(rec.md5)
        const primary = existingCommon ?? existingStyle

        if (primary) {
          sAliases.push({ src: primary, dst: targetVpkPath })
        } else {
          sMd5ToRel.set(rec.md5, storedRel)
          const dstFull = path.join(groupDstDir, storedRel.replace(/\//g, path.sep))
          fs.mkdirSync(path.dirname(dstFull), { recursive: true })
          fs.copyFileSync(rec.diskPath, dstFull)

          if (storedRel !== targetVpkPath) {
            sAliases.push({ src: storedRel, dst: targetVpkPath })
          } else {
            sFiles.push(storedRel)
          }
        }
      }

      // Check patch for this style
      let sPatchRel: string | undefined = undefined
      const patchContent = stylePatches.get(sIndex)
      if (patchContent) {
        if (sIndex === 0) {
          fs.writeFileSync(path.join(groupDstDir, 'items_patch.txt'), patchContent, 'utf-8')
        } else {
          const style0Patch = stylePatches.get(0)
          if (patchContent !== style0Patch) {
            sPatchRel = `styles/${sIndex}/items_patch.txt`
            const patchDst = path.join(groupDstDir, sPatchRel.replace(/\//g, path.sep))
            fs.mkdirSync(path.dirname(patchDst), { recursive: true })
            fs.writeFileSync(patchDst, patchContent, 'utf-8')
          }
        }
      }

      const sSpec = job.styles.find((s) => s.styleIndex === sIndex)
      if (sSpec?.extraAliases) {
        sAliases.push(...sSpec.extraAliases)
      }

      stylesRecord[String(sIndex)] = {
        files: sFiles.length > 0 ? sFiles.sort() : undefined,
        aliases: sAliases.length > 0 ? sAliases : undefined,
        patch: sPatchRel,
        valveCopies: sSpec?.extraValveCopies
      }
    }

    // For single-style jobs (like CM): if baseFiles has nothing (because numStyles === 1), populate baseFiles directly
    if (numStyles === 1) {
      const s0 = styleFiles.get(0)!
      const md5Map = new Map<string, string>()
      for (const [p, rec] of s0) {
        const existing = md5Map.get(rec.md5)
        if (existing) {
          baseAliases.push({ src: existing, dst: p })
        } else {
          md5Map.set(rec.md5, p)
          baseFiles.push(p)
          const dstFull = path.join(groupDstDir, p.replace(/\//g, path.sep))
          fs.mkdirSync(path.dirname(dstFull), { recursive: true })
          fs.copyFileSync(rec.diskPath, dstFull)
        }
      }
      const patchContent = stylePatches.get(0)
      if (patchContent) {
        fs.writeFileSync(path.join(groupDstDir, 'items_patch.txt'), patchContent, 'utf-8')
      }
    }

    // Extra aliases from spec
    if (job.extraAliases) {
      baseAliases.push(...job.extraAliases)
    }

    // Build final entry
    const entry: CosmeticAssetEntry = {
      name: job.name,
      hero: job.hero,
      group: job.group,
      patch: fs.existsSync(path.join(groupDstDir, 'items_patch.txt')) ? 'items_patch.txt' : undefined,
      basePatchIds: job.basePatchIds,
      files: baseFiles.sort()
    }
    if (baseAliases.length > 0) entry.aliases = baseAliases
    if (preservedRefits) entry.refits = preservedRefits
    if (numStyles > 1) entry.styles = stylesRecord

    existingManifest.items[job.id] = entry
    console.log(`  Finished ${job.name}: ${entry.files.length} base files, ${Object.keys(entry.styles || {}).length} styles.`)
  }

  // Save updated manifest
  fs.writeFileSync(MANIFEST_PATH, JSON.stringify(existingManifest, null, 2) + '\n', 'utf-8')
  console.log(`\nSuccessfully updated ${MANIFEST_PATH}!`)
}

if (require.main === module) {
  const heroArg = process.argv[2]
  sanitizeArcanaStyles(heroArg)
}
