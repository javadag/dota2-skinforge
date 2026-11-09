/**
 * Import an extracted third-party mod pack into the bundle layout used by
 * `data/cosmetic-assets.json` — `<bundle>/<group>/<game-relative path>`.
 *
 * Packs that ship a persona are written to their own `<hero>_persona` group:
 * they replace the hero's base model, which an arcana group already occupies.
 *
 *   npx tsx scripts/import_pack.ts --src scratch/pack_extracted --bundle D:\skinforge_raw
 */

import crypto from 'crypto'
import fs from 'fs'
import path from 'path'
import zlib from 'zlib'

import { loadIndex } from '../src/main/services/vpkIndex'

const VPK = 'D:/SteamLibrary/steamapps/common/dota 2 beta/game/dota/pak01_dir.vpk'

interface Job {
  group: string
  hero: string
  packs: string[]
  itemIds: string[]
  itemNames: Record<string, string>
}

const JOBS: Job[] = [
  {
    group: 'pudge_persona',
    hero: 'pudge',
    packs: ['The Toy Butcher (you can add Hook and Offhand)', 'Pudge Puppet'],
    itemIds: ['13786'],
    itemNames: { '13786': 'The Toy Butcher' }
  },
  {
    group: 'crystal_maiden_persona',
    hero: 'crystal_maiden',
    packs: ['Conduit of the Blueheart', 'Crystal Maiden Persona'],
    itemIds: ['19205'],
    itemNames: { '19205': 'Conduit of the Blueheart' }
  },
  {
    group: 'phantom_assassin_persona',
    hero: 'phantom_assassin',
    packs: ['Exile Unveiled', 'PA Persona base'],
    itemIds: ['22723'],
    itemNames: { '22723': 'Exile Unveiled' }
  },
  {
    group: 'axe_persona',
    hero: 'axe',
    packs: ['Axe Automaton Persona'],
    itemIds: ['31367'],
    itemNames: { '31367': 'Axe Automaton Persona' }
  },
  {
    group: 'legion_commander_persona',
    hero: 'legion_commander',
    packs: ['Legion Commander Automaton Persona'],
    itemIds: ['36191'],
    itemNames: { '36191': 'Legion Commander Automaton Persona' }
  },
  {
    group: 'techies_arcana',
    hero: 'techies',
    packs: [
      'Swine of the Sunken Galley',
      'Techies Arcana Base',
      'Techies Arcana Base Anims',
      'Swine Arsenal',
      'Swine Visor',
      'Swine Helmet',
      'Swine Powder Barrel',
      'Mark of the Taunting Swine'
    ],
    itemIds: ['6879'],
    itemNames: { '6879': 'Swine of the Sunken Galley' }
  }
]

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(name)
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback
}

const md5 = (b: Buffer): string => crypto.createHash('md5').update(b).digest('hex')

const category = (rel: string): string => {
  if (rel.endsWith('.vmdl_c')) return 'models'
  if (rel.endsWith('.vtex_c')) return 'textures'
  if (rel.endsWith('.vmat_c')) return 'materials'
  if (rel.endsWith('.vpcf_c')) return 'particles'
  if (rel.endsWith('.vsnd_c') || rel.endsWith('.vsndevts_c')) return 'sounds'
  if (rel.endsWith('.vmesh_c')) return 'meshdata'
  if (rel.endsWith('.vanim_c') || rel.endsWith('.vsnap_c')) return 'animations'
  return 'scripts'
}

const walk = (dir: string, prefix = ''): string[] => {
  const out: string[] = []
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const rel = prefix ? `${prefix}/${e.name}` : e.name
    if (e.isDirectory()) out.push(...walk(path.join(dir, e.name), rel))
    else out.push(rel)
  }
  return out
}

function main(): void {
  const src = path.resolve(arg('--src', 'scratch/pack_extracted'))
  const bundle = path.resolve(arg('--bundle', 'D:\\skinforge_raw'))
  const index = loadIndex(VPK)

  for (const job of JOBS) {
    const dest = path.join(bundle, job.group)
    fs.mkdirSync(dest, { recursive: true })

    const written = new Set<string>()
    for (const pack of job.packs) {
      const packDir = path.join(src, pack)
      if (!fs.existsSync(packDir)) throw new Error(`missing pack: ${packDir}`)
      for (const rel of walk(packDir)) {
        // the pack's own copyright notice is not a game file
        if (rel.startsWith('third-party/')) continue
        const from = path.join(packDir, rel.replace(/\//g, path.sep))
        const to = path.join(dest, rel.replace(/\//g, path.sep))
        fs.mkdirSync(path.dirname(to), { recursive: true })
        fs.copyFileSync(from, to)
        written.add(rel)
      }
    }

    const files = [...written].sort().map((rel) => {
      const data = fs.readFileSync(path.join(dest, rel.replace(/\//g, path.sep)))
      return {
        path: rel,
        size: data.length,
        crc: zlib.crc32(data).toString(16).padStart(8, '0'),
        category: category(rel),
        status: index.entries.has(rel) ? 'changed' : 'new'
      }
    })

    const seen = new Set<string>()
    let bytes = 0
    let uniqueBytes = 0
    for (const f of files) {
      const data = fs.readFileSync(path.join(dest, f.path.replace(/\//g, path.sep)))
      bytes += data.length
      const h = md5(data)
      if (!seen.has(h)) {
        seen.add(h)
        uniqueBytes += data.length
      }
    }

    const manifest = {
      group: job.group,
      hero: job.hero,
      excluded: false,
      fileCount: files.length,
      bytes,
      uniqueBytes,
      valveCopyCount: 0,
      valveCopyBytes: 0,
      itemIds: job.itemIds,
      itemNames: job.itemNames,
      files
    }

    fs.writeFileSync(path.join(dest, 'manifest.json'), JSON.stringify(manifest, null, 1) + '\n', 'utf-8')

    const newCount = files.filter((f) => f.status === 'new').length
    console.log(
      `${job.group.padEnd(26)} ${String(files.length).padStart(4)} files  ` +
        `${(bytes / 1048576).toFixed(1).padStart(6)} MB  ` +
        `new ${String(newCount).padStart(3)}  changed ${String(files.length - newCount).padStart(3)}  ` +
        `unique ${(uniqueBytes / 1048576).toFixed(1)} MB`
    )
  }
}

main()
