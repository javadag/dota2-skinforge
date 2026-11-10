/**
 * Cleans `data/other_armory.json` after it is generated from the external catalog dataset.
 *
 *  - drops `is_hero` (always false) and per-item `iw` / `snd` (the first is always 1, the
 *    second is implied by the category),
 *  - restores apostrophes in item names (`Aghanim*s` -> `Aghanim's`),
 *  - merges the generator's mis-bucketed slots:
 *      loadscreens  bow / mount / weapon -> loadscreen
 *      cursor       weapon              -> cursor
 *      music_packs  "official music pack" -> sound
 *  - de-duplicates items by name inside a merged slot,
 *  - normalises slot titles (`Siegedire` -> `Dire Siege Creeps`),
 *  - resolves every item against Valve's `items_game.txt`, writes its numeric item id and
 *    drops entries that are not in the schema (community / armory-only items).
 *
 * Usage:
 *   npm run clean:other
 */

import fs from 'fs'
import path from 'path'
import { buildItemIndex, findItemId, readItemsGame } from './lib/itemIdIndex'

interface CatalogMod {
  id?: number
  name: string
  title?: string
  iw?: unknown
  snd?: unknown
  [key: string]: unknown
}

interface CatalogSlot {
  slot: string
  title: string
  empty_img?: string
  mods: CatalogMod[]
  [key: string]: unknown
}

interface CatalogCategory {
  tag?: string
  is_hero?: unknown
  slots: CatalogSlot[]
  [key: string]: unknown
}

type Catalog = Record<string, CatalogCategory>

const CATALOG_PATH = path.resolve(__dirname, '../data/other_armory.json')
const ITEMS_GAME_PATH = path.resolve(__dirname, 'items/items_game.txt')

/** Categories SkinForge does not support. */
const DROP_CATEGORIES = new Set(['loadscreens'])

/** Slot ids that the upstream generator split off by accident. */
const SLOT_MERGE: Record<string, Record<string, string>> = {
  loadscreens: { bow: 'loadscreen', mount: 'loadscreen', weapon: 'loadscreen' },
  cursor: { weapon: 'cursor' },
  music_packs: { 'official music pack': 'sound' }
}

const SLOT_TITLES: Record<string, Record<string, string>> = {
  courier: { courier: 'Courier' },
  wards: { ward: 'Ward' },
  terrain: { map: 'Terrain' },
  creeps: {
    dire: 'Dire Creeps',
    radiant: 'Radiant Creeps',
    siegedire: 'Dire Siege Creeps',
    siegeradiant: 'Radiant Siege Creeps',
    effect: 'Mega Creeps'
  },
  towers: { dire: 'Dire Towers', radiant: 'Radiant Towers' },
  ancient: { effect: 'Ancient' },
  roshan: { effect: 'Roshan' },
  tormentor: { effect: 'Tormentor' },
  weather: { weather: 'Weather Effect' },
  music_packs: { sound: 'Music Packs' },
  announcers: { announcer: 'Announcer', megakills: 'Mega Kill Announcers' },
  loadscreens: { loadscreen: 'Loading Screen' },
  versus_screen: { effect: 'Versus Screen' },
  huds: { hud: 'HUD Skin' },
  kill_streak: { effect: 'Kill Streak Effect' },
  cursor: { cursor: 'Cursor Pack' }
}

/** Display order; unknown slots keep their original position at the end. */
const SLOT_ORDER: Record<string, string[]> = {
  creeps: ['dire', 'radiant', 'siegedire', 'siegeradiant', 'effect'],
  towers: ['dire', 'radiant']
}

/** Display names that differ from the schema name by more than normalisation can bridge. */
const ALIASES: Record<string, string> = {
  'Diretide Courier Hermid': 'Hermid',
  'Moil the Fetter': 'Moil the Fettered',
  'Jin and Yin Fox Spirits Default': 'Jin and Yin Fox Spirits',
  'Jin and Yin Fox Spirits Only Black': 'Jin and Yin Fox Spirits',
  'Jin and Yin Fox Spirits Only White': 'Jin and Yin Fox Spirits',
  'Lefty - Aegis of the Immortal': 'Lefty',
  'Lefty - Gem of Truesight': 'Lefty',
  'Lefty - Linkens Sphere': 'Lefty',
  'Lefty - Octarine Core': 'Lefty',
  'Lefty - Refresher Orb': 'Lefty',
  'Lefty - Ultimate Orb': 'Lefty',
  'Pirate Captain Mega-Kill': "Mega-Kills: The Pirate Cap'n",
  'HUD of the Burning Scale Fire': 'HUD of the Burning Scale',
  'HUD of the Burning Scale Ice': 'HUD of the Burning Scale',
  'HUD of the Burning Scale Poison': 'HUD of the Burning Scale',
  'Jolly Roger HUD Davy Jones Style': 'Jolly Roger',
  'Jolly Roger HUD Landlubber Style': 'Jolly Roger',
  'DotaCinema Bright HUD': 'DotaCinema HUD',
  'DotaCinema Dark HUD': 'DotaCinema HUD',
  'Roshan Halloween Angel Skin': "Roshan's Costume - Angel",
  'Roshan Halloween Dracula Skin': "Roshan's Costume - Dracula",
  'Roshan Halloween Frankenstein Skin': "Roshan's Costume - Frankenstein"
}

function fixApostrophes(value: string): string {
  return value.replace(/\*/g, "'")
}

function cleanCategory(tag: string, category: CatalogCategory, index: ReturnType<typeof buildItemIndex>, stats: Stats): void {
  delete category.is_hero

  const merge = SLOT_MERGE[tag] || {}
  const slots = new Map<string, CatalogSlot>()

  for (const slot of category.slots) {
    const id = merge[slot.slot] || slot.slot
    const existing = slots.get(id)

    for (const mod of slot.mods || []) {
      delete mod.iw
      delete mod.snd
      if (typeof mod.name === 'string' && mod.name.includes('*')) {
        mod.name = fixApostrophes(mod.name)
        stats.namesFixed++
      }
      if (typeof mod.title === 'string' && mod.title.includes('*')) {
        mod.title = fixApostrophes(mod.title)
      }
    }

    if (!existing) {
      slots.set(id, { ...slot, slot: id, mods: [...(slot.mods || [])] })
      continue
    }

    if (!existing.empty_img && slot.empty_img) existing.empty_img = slot.empty_img
    const seen = new Set(existing.mods.map((mod) => mod.name))
    for (const mod of slot.mods || []) {
      if (seen.has(mod.name)) {
        stats.duplicatesDropped++
        continue
      }
      seen.add(mod.name)
      existing.mods.push(mod)
    }
    stats.slotsMerged++
  }

  for (const [slotId, slot] of slots) {
    slot.title = SLOT_TITLES[tag]?.[slotId] ?? slot.title

    const kept: CatalogMod[] = []
    for (const mod of slot.mods) {
      const itemId = findItemId(mod.name, index, ALIASES)
      if (itemId === null) {
        stats.droppedItems++
        stats.droppedByCategory[tag] = (stats.droppedByCategory[tag] || 0) + 1
        continue
      }
      mod.id = itemId
      kept.push(mod)
    }
    slot.mods = kept
  }

  const order = SLOT_ORDER[tag]
  const ordered = order
    ? [...slots.values()].sort((a, b) => {
        const ai = order.indexOf(a.slot)
        const bi = order.indexOf(b.slot)
        return (ai < 0 ? 999 : ai) - (bi < 0 ? 999 : bi)
      })
    : [...slots.values()]

  category.slots = ordered
  stats.slots += ordered.length
  stats.mods += ordered.reduce((total, slot) => total + slot.mods.length, 0)
}

interface Stats {
  categories: number
  droppedCategories: number
  slots: number
  mods: number
  slotsMerged: number
  duplicatesDropped: number
  namesFixed: number
  droppedItems: number
  droppedByCategory: Record<string, number>
}

function main(): void {
  if (!fs.existsSync(ITEMS_GAME_PATH)) {
    console.error(`Error: items_game.txt not found at ${ITEMS_GAME_PATH}`)
    process.exit(1)
  }

  const catalog = JSON.parse(fs.readFileSync(CATALOG_PATH, 'utf8')) as Catalog
  const index = buildItemIndex(readItemsGame(ITEMS_GAME_PATH))

  const stats: Stats = {
    categories: 0,
    droppedCategories: 0,
    slots: 0,
    mods: 0,
    slotsMerged: 0,
    duplicatesDropped: 0,
    namesFixed: 0,
    droppedItems: 0,
    droppedByCategory: {}
  }

  for (const [tag, category] of Object.entries(catalog)) {
    if (DROP_CATEGORIES.has(tag)) {
      delete catalog[tag]
      stats.droppedCategories++
      continue
    }
    stats.categories++
    cleanCategory(tag, category, index, stats)
  }

  fs.writeFileSync(CATALOG_PATH, JSON.stringify(catalog, null, 2) + '\n', 'utf8')

  console.log(
    `Cleaned ${stats.categories} categories in ${path.relative(process.cwd(), CATALOG_PATH)} (dropped ${stats.droppedCategories})`
  )
  console.log(`  slots: ${stats.slots} (${stats.slotsMerged} merged), items kept: ${stats.mods}`)
  console.log(`  apostrophes restored: ${stats.namesFixed}, duplicate items dropped: ${stats.duplicatesDropped}`)
  console.log(`  items without a schema id dropped: ${stats.droppedItems}`)
  for (const [tag, count] of Object.entries(stats.droppedByCategory)) {
    console.log(`    ${tag}: ${count}`)
  }
}

main()
