/**
 * Sanitize and deduplicate an extracted Dota2Changer asset bundle (`D:\changer_changed`)
 * into a clean, self-contained bundle (`D:\changer_cleaned`) and generate `data/cosmetic-assets.json`.
 *
 *   npx tsx scripts/sanitize_bundle.ts --src D:\changer_changed --dst D:\changer_cleaned --wave2 scratch/d2c_extracted/items/scripts/items/items_game.txt --out data/cosmetic-assets.json
 */

import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import * as packService from '../src/main/services/packService'
import type { CompanionRefit, CosmeticAssetEntry, CosmeticAssetsManifest, PathMapping } from '../src/main/services/cosmeticAssets'

export const INVISIBLE_BOX_3708_CRC = 'dfb82309'
export const INVISIBLE_BOX_3249_CRC = 'fc9e2d6b'

export type FileClassification = 'keep' | 'drop'

/**
 * Decide whether a file in a hero group should be kept or dropped during sanitization.
 *
 * Rules:
 * 1. Always drop `.webm` promo videos (`panorama/videos/...`).
 * 2. Drop Workshop item paths (`models/items/...`) that were replaced with `invisiblebox.vmdl_c`
 *    (3708-byte custom or 3249-byte Valve stock) or that duplicate a default hero slot / base model
 *    (Dota2Changer's brute-force Workshop item hijack).
 * 3. Keep default hero slot paths (`models/heroes/...`) and custom `kisilev_ind/...` assets.
 */
export function classifyGroupFile(
  _group: string,
  relPath: string,
  size: number,
  crc: string,
  isDuplicateOfDefaultSlot: boolean
): FileClassification {
  const norm = relPath.replace(/\\/g, '/')
  if (norm.endsWith('.webm') || norm.startsWith('panorama/videos/')) {
    return 'drop'
  }
  if (norm.startsWith('models/items/')) {
    if ((size === 3708 && crc === INVISIBLE_BOX_3708_CRC) || (size === 3249 && crc === INVISIBLE_BOX_3249_CRC)) {
      return 'drop'
    }
    if (isDuplicateOfDefaultSlot) {
      return 'drop'
    }
  }
  return 'keep'
}

interface RawManifestFile {
  path: string
  size: number
  crc: string
  category: string
  status: string
  valveCopy?: string[]
}

interface RawGroupManifest {
  group: string
  files: RawManifestFile[]
}

export interface RefitSpec {
  companionId: string
  name: string
  slot: string
  patchIds: string[]
  pathFilter: (relPath: string) => boolean
}

export interface GroupSpec {
  id: string
  name: string
  hero: string
  group: string
  basePatchIds: string[]
  recoverFromWave2?: string[]
  refits?: RefitSpec[]
  extraAliases?: PathMapping[]
  extraValveCopies?: PathMapping[]
}

export const GROUP_SPECS: GroupSpec[] = [
  { id: '4794', name: 'Fiery Soul of the Slayer', hero: 'lina', group: 'lina', basePatchIds: ['319'] },
  { id: '5810', name: 'Blades of Voth Domosh', hero: 'legion_commander', group: 'legion_commander', basePatchIds: ['847'] },
  { id: '5957', name: 'Fractal Horns of Inner Abysm', hero: 'terrorblade', group: 'terrorblade', basePatchIds: ['478', '540', '913'] },
  {
    id: '6879',
    name: 'Swine of the Sunken Galley',
    hero: 'techies',
    group: 'techies_arcana',
    basePatchIds: ['394', '487', '489', '490', '491', '492', '499', '827'],
    recoverFromWave2: ['394', '487', '489', '490', '491', '492', '499', '827']
  },
  {
    id: '6914',
    name: 'Tempest Helm of the Thundergod',
    hero: 'zuus',
    group: 'zeus',
    basePatchIds: ['589', '607']
  },
  {
    id: '6996',
    name: 'Demon Eater',
    hero: 'shadow_fiend',
    group: 'shadow_fiend',
    basePatchIds: ['387', '486', '488', '826'],
    extraValveCopies: [
      {
        src: 'materials/models/heroes/shadow_fiend/shadow_fiend_inferno_color.vmat_c',
        dst: 'kisilev_ind/materials/shadow_fiend/arcana/shadow_fiend_inferno_kisilev_ind.vmat_c'
      }
    ]
  },
  { id: '7247', name: 'Manifold Paradox', hero: 'phantom_assassin', group: 'phantom_assassin', basePatchIds: ['140'] },
  { id: '7385', name: 'Frost Avalanche', hero: 'crystal_maiden', group: 'crystal_maiden', basePatchIds: ['38'] },
  {
    id: '7756',
    name: 'Feast of Abscession',
    hero: 'pudge',
    group: 'pudge',
    basePatchIds: ['258', '810'],
    extraAliases: [
      {
        src: 'kisilev_ind/particles/pudge/arcana/pudge_arcana_chain_c_l_fx.vsnap_c',
        dst: 'particles/kisilev_ind/models/pudge/arcana/pudge_arcana_back/pudge_arcana_chain_c_l_fx.vsnap_c'
      },
      {
        src: 'kisilev_ind/particles/pudge/arcana/pudge_arcana_chain_c_r_fx.vsnap_c',
        dst: 'particles/kisilev_ind/models/pudge/arcana/pudge_arcana_back/pudge_arcana_chain_c_r_fx.vsnap_c'
      },
      {
        src: 'kisilev_ind/particles/pudge/arcana/pudge_arcana_chain_d_l_fx.vsnap_c',
        dst: 'particles/kisilev_ind/models/pudge/arcana/pudge_arcana_back/pudge_arcana_chain_d_l_fx.vsnap_c'
      },
      {
        src: 'kisilev_ind/particles/pudge/arcana/pudge_arcana_chain_d_r_fx.vsnap_c',
        dst: 'particles/kisilev_ind/models/pudge/arcana/pudge_arcana_back/pudge_arcana_chain_d_r_fx.vsnap_c'
      }
    ]
  },
  { id: '9050', name: "Great Sage's Reckoning", hero: 'monkey_king', group: 'monkey_king', basePatchIds: ['594', '825'] },
  { id: '9059', name: 'Bladeform Legacy', hero: 'juggernaut', group: 'juggernaut', basePatchIds: ['6', '811'] },
  { id: '9235', name: 'Benevolent Companion', hero: 'wisp', group: 'wisp', basePatchIds: ['639'] },
  { id: '9662', name: 'Phantom Advent', hero: 'spectre', group: 'spectre', basePatchIds: ['323', '324', '325', '395', '580'] },
  {
    id: '12451',
    name: 'The Magus Cypher',
    hero: 'rubick',
    group: 'rubick',
    basePatchIds: ['204', '674'],
    extraValveCopies: [
      {
        src: 'materials/particle/bullseye/bullseye_anim.vtex_c',
        dst: 'kisilev_ind/particles/rubick/rubick_arcana_cape/rubick_arcana_skills/bullseye.vtex_c'
      }
    ]
  },
  {
    id: '12692',
    name: 'Planetfall',
    hero: 'earthshaker',
    group: 'earthshaker',
    basePatchIds: ['459', '460', '461', '855', '8655', '12692']
  },
  { id: '12930', name: 'Eminence of Ristul', hero: 'queenofpain', group: 'queenofpain', basePatchIds: ['26', '82', '83', '84'] },
  { id: '12964', name: 'Fists of Axe Unleashed', hero: 'axe', group: 'axe', basePatchIds: ['2', '4'] },
  {
    id: '13042',
    name: 'Acolyte of the Lost Arts',
    hero: 'invoker',
    group: 'invoker',
    basePatchIds: ['48', '89', '98', '99', '100', '305', '683', '8626']
  },
  { id: '13456', name: 'Crown of the One True King', hero: 'wraith_king', group: 'wraith_king', basePatchIds: ['148', '149'] },
  {
    id: '13527',
    name: 'Pachyderm Powderwagon Elephant',
    hero: 'techies',
    group: 'techies',
    basePatchIds: ['394', '487', '489', '490', '491', '492', '827', '35989']
  },
  {
    id: '13670',
    name: "Flockheart's Gamble",
    hero: 'ogre_magi',
    group: 'ogre_magi',
    basePatchIds: ['135', '698', '830'],
    refits: [
      {
        companionId: '5245',
        name: 'Masks of Ancestral Luck',
        slot: 'head',
        patchIds: ['5245'],
        pathFilter: (p) => p.includes('ogre_ancestral_head')
      },
      {
        companionId: '7613',
        name: 'Hood of Pagus',
        slot: 'head',
        patchIds: ['7613'],
        pathFilter: (p) => p.includes('fortunes_veil_head')
      },
      {
        companionId: '7847',
        name: 'Helmet and hood of the Antipodeans',
        slot: 'head',
        patchIds: ['7847'],
        pathFilter: (p) => p.includes('antipodean_head')
      },
      {
        companionId: '9229',
        name: 'Headgear of the Shoreline Sapper',
        slot: 'head',
        patchIds: ['9229'],
        pathFilter: (p) => p.includes('ogre_magi_set_head')
      },
      {
        companionId: '12801',
        name: 'Heads of the Grey Wastes',
        slot: 'head',
        patchIds: ['12801'],
        pathFilter: (p) => p.includes('frostivus2018')
      },
      {
        companionId: '18098',
        name: 'Pyrexae Polymorph Perfected - Head',
        slot: 'head',
        patchIds: ['18098'],
        pathFilter: (p) => p.includes('dragon_head')
      },
      {
        companionId: '25948',
        name: 'Oni Magi - Head',
        slot: 'head',
        patchIds: ['25948'],
        pathFilter: (p) => p.includes('oni_lord_head')
      },
      {
        companionId: '18535',
        name: 'Stonebreak Excavators - Heads',
        slot: 'head',
        patchIds: [],
        pathFilter: (p) => p.includes('ti8_head') || p.includes('ti8_ogre_crypt_treasure_hunting_team_head')
      },
      {
        companionId: '19373',
        name: 'Freeboot Fortunes - Head',
        slot: 'head',
        patchIds: [],
        pathFilter: (p) => p.includes('adv_of_fortune_head') || p.includes('adventurers_of_fortune_head')
      },
      {
        companionId: '31207',
        name: 'Pisces Gemini - Head',
        slot: 'head',
        patchIds: [],
        pathFilter: (p) => p.includes('ogre_cosmic')
      }
    ]
  },
  {
    id: '13783',
    name: "The Disciple's Path",
    hero: 'antimage',
    group: 'antimage',
    basePatchIds: ['1', '215', '216', '217', '218', '335', '13784'],
    extraAliases: [
      {
        src: 'kisilev_ind/particles/antimage/antimage_female/basher/antimage_female_basher_fx_l.vsnap_c',
        dst: 'particles/models/items/antimage/ skull_basher/antimage_female_basher_fx_l.vsnap_c'
      },
      {
        src: 'kisilev_ind/particles/antimage/antimage_female/basher/antimage_female_basher_fx_r.vsnap_c',
        dst: 'particles/models/items/antimage/ skull_basher/antimage_female_basher_fx_r.vsnap_c'
      },
      {
        src: 'kisilev_ind/particles/antimage/antimage_female/basher/antimage_female_basher_fx_l.vsnap_c',
        dst: 'particles/models/heroes/antimage/antimage_persona_kisilev_ind/antimage_female_kisilev_ind/antimage_female_basher_fx_l.vsnap_c'
      },
      {
        src: 'kisilev_ind/particles/antimage/antimage_female/basher/antimage_female_basher_fx_r.vsnap_c',
        dst: 'particles/models/heroes/antimage/antimage_persona_kisilev_ind/antimage_female_kisilev_ind/antimage_female_basher_fx_r.vsnap_c'
      }
    ],
    refits: [
      {
        companionId: '5395',
        name: 'Arc of Manta - Off-Hand',
        slot: 'offhand_weapon',
        patchIds: ['5395'],
        pathFilter: () => false
      },
      {
        companionId: '5396',
        name: 'Arc of Manta',
        slot: 'weapon',
        patchIds: ['5396'],
        pathFilter: (p) => p.includes('arc_of_manta')
      },
      {
        companionId: '23780',
        name: 'Mohawk of the Spectral Hunter',
        slot: 'head',
        patchIds: ['23780'],
        pathFilter: (p) => p.includes('calavera')
      },
      {
        companionId: '5538',
        name: 'Hood of the Clergy Ascetic',
        slot: 'head',
        patchIds: [],
        pathFilter: (p) => p.includes('hood_of_the_clergy_ascetic')
      },
      {
        companionId: '6884',
        name: 'Acolyte of Vengeance Mask',
        slot: 'head',
        patchIds: [],
        pathFilter: (p) => p.includes('acolyte_vengeance_hood')
      },
      {
        companionId: '24924',
        name: 'Brands of the Reaper - Head',
        slot: 'head',
        patchIds: [],
        pathFilter: (p) => p.includes('am_eternal_reaper_head')
      }
    ]
  },
  {
    id: '13786',
    name: 'The Toy Butcher',
    hero: 'pudge',
    group: 'pudge_persona',
    basePatchIds: ['47', '258', '391', '709', '810'],
    recoverFromWave2: ['47', '258', '391', '709', '810']
  },
  {
    id: '13806',
    name: 'Compass of the Rising Gale',
    hero: 'windrunner',
    group: 'windrunner',
    basePatchIds: ['21', '22', '23', '24', '25', '828']
  },
  {
    id: '18033',
    name: 'Claszian Apostasy Head',
    hero: 'faceless_void',
    group: 'faceless_void',
    basePatchIds: ['15', '90', '91', '92', '93']
  },
  { id: '18113', name: 'Davion of Dragon Hold', hero: 'dragon_knight', group: 'dragon_knight', basePatchIds: ['64', '732'] },
  { id: '18178', name: 'Mirana of Nightsilver', hero: 'mirana', group: 'mirana', basePatchIds: ['759'] },
  {
    id: '18539',
    name: 'The Devotions of Dragonus - Wings',
    hero: 'skywrath_mage',
    group: 'skywrath_mage',
    basePatchIds: ['420', '421', '422', '423', '424', '425']
  },
  {
    id: '19090',
    name: 'Dread Retribution',
    hero: 'drow',
    group: 'drow',
    basePatchIds: ['75', '76', '77', '78', '79', '80', '267', '737', '905']
  },
  {
    id: '19205',
    name: 'Conduit of the Blueheart',
    hero: 'crystal_maiden',
    group: 'crystal_maiden_persona',
    basePatchIds: ['38', '39', '40', '41', '311', '502', '707'],
    recoverFromWave2: ['38', '39', '40', '41', '311', '502', '707'],
    extraAliases: [
      {
        src: 'kisilev_ind/models/crystal_maiden/persona/crystal_maiden_persona_kisilev_ind.vmdl_c',
        dst: 'kisilev_ind/models/crystal_maiden/persona/crystal_maiden_persona.vmdl_c'
      }
    ]
  },
  {
    id: '22718',
    name: 'The Resurrection of Shen - Wings',
    hero: 'vengeful',
    group: 'vengeful',
    basePatchIds: ['441', '442', '445', '447']
  },
  {
    id: '22723',
    name: 'Exile Unveiled',
    hero: 'phantom_assassin',
    group: 'phantom_assassin_persona',
    basePatchIds: ['137', '138', '140', '141', '764'],
    recoverFromWave2: ['137', '138', '140', '141', '764']
  },
  { id: '23095', name: 'Voidstorm Asylum Tormentor', hero: 'razor', group: 'razor', basePatchIds: ['340', '341', '342', '343', '344'] },
  {
    id: '31357',
    name: 'Oracle Automaton Persona',
    hero: 'oracle',
    group: 'oracle',
    basePatchIds: ['546', '547', '548', '549', '853']
  },
  {
    id: '31367',
    name: 'Axe Automaton Persona',
    hero: 'axe',
    group: 'axe_persona',
    basePatchIds: ['2', '4', '5', '846'],
    recoverFromWave2: ['2', '4', '5', '846']
  },
  {
    id: '33393',
    name: 'Mesmer-Eye - Base',
    hero: 'nyx_assassin',
    group: 'nerubian_assassin',
    basePatchIds: ['195', '196', '197', '578', '902']
  },
  {
    id: '36191',
    name: 'Legion Commander Automaton Persona',
    hero: 'legion_commander',
    group: 'legion_commander_persona',
    basePatchIds: ['433', '434', '435', '847', '31372'],
    recoverFromWave2: ['433', '434', '435', '847', '31372']
  },
  {
    id: '36193',
    name: 'Morphling Automaton Persona',
    hero: 'morphling',
    group: 'morphling',
    basePatchIds: ['507', '575', '576', '860']
  },
  {
    id: '36214',
    name: 'Bristleback Automaton Persona',
    hero: 'bristleback',
    group: 'bristleback',
    basePatchIds: ['436', '437', '438', '439', '440', '718']
  },
  {
    id: '37143',
    name: 'Maw of the Megalodon - Base',
    hero: 'tidehunter',
    group: 'tidehunter',
    basePatchIds: ['904']
  }
]

function md5File(filePath: string): string {
  return crypto.createHash('md5').update(fs.readFileSync(filePath)).digest('hex')
}

function buildPatchFile(sourceItemsGameText: string, sourceSection: packService.ItemsSection, targetIds: string[]): string {
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

export function sanitizeBundle(opts: {
  srcDir: string
  dstDir: string
  wave2ItemsGamePath: string
  outManifestPath: string
}): CosmeticAssetsManifest {
  const { srcDir, dstDir, wave2ItemsGamePath, outManifestPath } = opts

  fs.rmSync(dstDir, { recursive: true, force: true })
  fs.mkdirSync(dstDir, { recursive: true })

  // 1. Stage _global guard files (excluding scripts/items/items_game.txt and panorama/)
  const directGlobalFiles: string[] = [
    'models/creeps/neutral_creeps/n_creep_troll_skeleton/n_creep_skeleton_melee.vmdl_c',
    'models/dev/materialforerrormodel.vmat_c',
    'particles/error/error.vpcf_c',
    'scripts/npc/portraits_full_body_loadout.txt'
  ]
  for (const rel of directGlobalFiles) {
    const s = path.join(srcDir, '_global', rel)
    const d = path.join(dstDir, '_global', rel)
    if (fs.existsSync(s)) {
      fs.mkdirSync(path.dirname(d), { recursive: true })
      fs.copyFileSync(s, d)
    }
  }
  // Place an empty null particle at kisilev_ind/particles/logo/logo.vpcf_c so embedded model
  // references resolve cleanly without rendering Dota2Changer's advertisement logo.
  const nullParticleSrc = path.join(srcDir, '_global', 'particles/error/error.vpcf_c')
  const logoGuardRel = 'kisilev_ind/particles/logo/logo.vpcf_c'
  if (fs.existsSync(nullParticleSrc)) {
    const logoDst = path.join(dstDir, '_global', logoGuardRel)
    fs.mkdirSync(path.dirname(logoDst), { recursive: true })
    fs.copyFileSync(nullParticleSrc, logoDst)
  }
  const globalFiles: string[] = [...directGlobalFiles, logoGuardRel]

  // Load Wave-1 and Wave-2 items_game.txt for patch extraction/recovery
  const wave1Path = path.join(srcDir, '_global', 'scripts', 'items', 'items_game.txt')
  const wave1Text = fs.readFileSync(wave1Path, 'utf-8')
  const wave1Section = packService.readItemsSection(wave1Text)

  const wave2Text = fs.readFileSync(wave2ItemsGamePath, 'utf-8')
  const wave2Section = packService.readItemsSection(wave2Text)

  const items: Record<string, CosmeticAssetEntry> = {}

  for (const spec of GROUP_SPECS) {
    const groupSrcDir = path.join(srcDir, spec.group)
    const groupDstDir = path.join(dstDir, spec.group)
    fs.mkdirSync(groupDstDir, { recursive: true })

    const rawManifestPath = path.join(groupSrcDir, 'manifest.json')
    const rawManifest: RawGroupManifest = JSON.parse(fs.readFileSync(rawManifestPath, 'utf-8'))

    const isClaimedByRefit = (relPath: string): boolean => Boolean(spec.refits?.some((r) => r.pathFilter(relPath)))

    // Count how many times each (size:crc) appears in non-refit models/items/
    const itemCrcCounts = new Map<string, number>()
    for (const f of rawManifest.files) {
      if (f.path.startsWith('models/items/') && !isClaimedByRefit(f.path)) {
        const key = `${f.size}:${f.crc}`
        itemCrcCounts.set(key, (itemCrcCounts.get(key) ?? 0) + 1)
      }
    }

    // Collect (size:crc) hashes of default hero slot models (`models/heroes/...`) and non-refit `kisilev_ind/` models
    // plus any `(size:crc)` repeated 3+ times across Workshop `models/items/...` paths (mass Workshop hijack)
    const defaultSlotHashes = new Set<string>()
    for (const f of rawManifest.files) {
      if (
        f.path.startsWith('models/heroes/') ||
        (f.path.startsWith('kisilev_ind/') && !f.path.includes('/items/') && !isClaimedByRefit(f.path))
      ) {
        defaultSlotHashes.add(`${f.size}:${f.crc}`)
      }
      if ((itemCrcCounts.get(`${f.size}:${f.crc}`) ?? 0) >= 3) {
        defaultSlotHashes.add(`${f.size}:${f.crc}`)
      }
    }

    const baseFiles: string[] = []
    const baseAliases: PathMapping[] = []
    const baseValveCopies: PathMapping[] = []

    const refitEntries: Record<string, CompanionRefit> = {}
    const refitHashPrimary = new Map<string, Map<string, string>>()

    if (spec.refits) {
      for (const r of spec.refits) {
        refitEntries[r.companionId] = {
          name: r.name,
          slot: r.slot,
          files: [],
          aliases: [],
          valveCopies: [],
          patchIds: r.patchIds.length ? r.patchIds : undefined
        }
        refitHashPrimary.set(r.companionId, new Map())
      }
    }

    const baseHashPrimary = new Map<string, string>()

    // Sort files so base files come before refits, and `kisilev_ind/` / `models/heroes/` before `models/items/`
    const sortedFiles = [...rawManifest.files].sort((a, b) => {
      const refitA = isClaimedByRefit(a.path) ? 1 : 0
      const refitB = isClaimedByRefit(b.path) ? 1 : 0
      if (refitA !== refitB) return refitA - refitB
      const rank = (p: string): number => (p.startsWith('kisilev_ind/') ? 0 : p.startsWith('models/heroes/') ? 1 : 2)
      return rank(a.path) - rank(b.path) || a.path.localeCompare(b.path)
    })

    for (const f of sortedFiles) {
      const rel = f.path.replace(/\\/g, '/')
      const matchedRefit = spec.refits?.find((r) => r.pathFilter(rel))
      const isDupDefault = !matchedRefit && defaultSlotHashes.has(`${f.size}:${f.crc}`)
      const decision = matchedRefit ? 'keep' : classifyGroupFile(spec.group, rel, f.size, f.crc, isDupDefault)
      if (decision === 'drop') continue

      // 1. Check if this file is an exact copy from Valve's pak01_dir.vpk
      if (f.valveCopy && f.valveCopy.length > 0) {
        const vpkSrc = f.valveCopy[0]
        // Drop Workshop hijack valveCopies that overwrite a Workshop item with a default hero model or invisiblebox
        if (
          rel.startsWith('models/items/') &&
          !matchedRefit &&
          (vpkSrc.startsWith('models/heroes/') || vpkSrc.startsWith('models/development/'))
        ) {
          continue
        }
        if (matchedRefit) {
          refitEntries[matchedRefit.companionId].valveCopies!.push({ src: vpkSrc, dst: rel })
        } else {
          baseValveCopies.push({ src: vpkSrc, dst: rel })
        }
        continue
      }

      const diskSrc = path.join(groupSrcDir, rel)
      if (!fs.existsSync(diskSrc)) continue
      const digest = md5File(diskSrc)

      if (matchedRefit) {
        const rEntry = refitEntries[matchedRefit.companionId]
        const hMap = refitHashPrimary.get(matchedRefit.companionId)!
        const existingPrimary = baseHashPrimary.get(digest) ?? hMap.get(digest)
        if (existingPrimary) {
          rEntry.aliases!.push({ src: existingPrimary, dst: rel })
        } else {
          hMap.set(digest, rel)
          rEntry.files.push(rel)
          const diskDst = path.join(groupDstDir, rel)
          fs.mkdirSync(path.dirname(diskDst), { recursive: true })
          fs.copyFileSync(diskSrc, diskDst)
        }
      } else {
        const existingPrimary = baseHashPrimary.get(digest)
        if (existingPrimary) {
          baseAliases.push({ src: existingPrimary, dst: rel })
        } else {
          baseHashPrimary.set(digest, rel)
          baseFiles.push(rel)
          const diskDst = path.join(groupDstDir, rel)
          fs.mkdirSync(path.dirname(diskDst), { recursive: true })
          fs.copyFileSync(diskSrc, diskDst)
        }
      }
    }

    // Add explicit missing dependency aliases (e.g., .vsnap_c path mismatches)
    if (spec.extraAliases) {
      for (const mapping of spec.extraAliases) {
        baseAliases.push(mapping)
      }
    }
    if (spec.extraValveCopies) {
      for (const mapping of spec.extraValveCopies) {
        baseValveCopies.push(mapping)
      }
    }

    // Build sanitized items_patch.txt containing basePatchIds + any refit patchIds
    const patchSourceText = spec.recoverFromWave2 ? wave2Text : wave1Text
    const patchSourceSec = spec.recoverFromWave2 ? wave2Section : wave1Section
    const baseTargetIds = spec.recoverFromWave2 ?? spec.basePatchIds
    const refitTargetIds = spec.refits ? spec.refits.flatMap((r) => r.patchIds) : []
    const allPatchTargetIds = [...new Set([...baseTargetIds, ...refitTargetIds])]

    let patchRel: string | undefined
    if (allPatchTargetIds.length > 0) {
      const content = buildPatchFile(patchSourceText, patchSourceSec, allPatchTargetIds)
      fs.writeFileSync(path.join(groupDstDir, 'items_patch.txt'), content, 'utf-8')
      patchRel = 'items_patch.txt'
    }

    if (spec.refits) {
      for (const r of spec.refits) {
        const rEntry = refitEntries[r.companionId]
        if (!rEntry.aliases?.length) delete rEntry.aliases
        if (!rEntry.valveCopies?.length) delete rEntry.valveCopies
      }
    }

    const entry: CosmeticAssetEntry = {
      name: spec.name,
      hero: spec.hero,
      group: spec.group,
      patch: patchRel,
      basePatchIds: baseTargetIds.length ? baseTargetIds : undefined,
      files: baseFiles.sort()
    }
    if (baseAliases.length > 0) entry.aliases = baseAliases
    if (baseValveCopies.length > 0) entry.valveCopies = baseValveCopies
    if (spec.refits && Object.keys(refitEntries).length > 0) entry.refits = refitEntries

    items[spec.id] = entry
  }

  const manifest: CosmeticAssetsManifest = {
    $comment: 'Sanitized, deduplicated cosmetic asset overlay manifest generated by scripts/sanitize_bundle.ts.',
    sourceDir: dstDir,
    globalFiles,
    items
  }

  fs.mkdirSync(path.dirname(outManifestPath), { recursive: true })
  fs.writeFileSync(outManifestPath, JSON.stringify(manifest, null, 2) + '\n', 'utf-8')
  return manifest
}

if (require.main === module) {
  const getArg = (flag: string, fallback: string): string => {
    const idx = process.argv.indexOf(flag)
    return idx !== -1 && process.argv[idx + 1] ? process.argv[idx + 1] : fallback
  }
  const srcDir = path.resolve(getArg('--src', 'D:\\changer_changed'))
  const dstDir = path.resolve(getArg('--dst', 'D:\\changer_cleaned'))
  const wave2ItemsGamePath = path.resolve(getArg('--wave2', 'scratch/d2c_extracted/items/scripts/items/items_game.txt'))
  const outManifestPath = path.resolve(getArg('--out', 'data/cosmetic-assets.json'))

  const res = sanitizeBundle({ srcDir, dstDir, wave2ItemsGamePath, outManifestPath })
  console.log(`Sanitized ${Object.keys(res.items).length} cosmetic groups into ${dstDir} -> ${outManifestPath}`)
}
