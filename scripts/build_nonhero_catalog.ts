/**
 * Dota 2 SkinForge — Non-Hero Categories Catalog Generator
 * Parses Valve's official items_game.txt and generates src/data/nonHeroCatalog.ts
 */

import fs from 'fs'
import path from 'path'

const ITEMS_GAME_PATH = path.resolve(__dirname, 'items/items_game.txt')
const OUTPUT_PATH = path.resolve(__dirname, '../src/data/nonHeroCatalog.ts')

interface ParsedItem {
  id: number
  name: string
  tag: string
  img: string
  isDefault?: boolean
  best?: boolean
}

interface CategoryDefinition {
  slots: { id: string; name: string; icon: string }[]
  items: Record<string, ParsedItem[]>
}

export function buildNonHeroCatalog(): void {
  if (!fs.existsSync(ITEMS_GAME_PATH)) {
    console.error(`Error: items_game.txt not found at ${ITEMS_GAME_PATH}`)
    process.exit(1)
  }

  console.log('Reading items_game.txt...')
  const content = fs.readFileSync(ITEMS_GAME_PATH, 'utf8')

  console.log('Parsing Valve items schema...')
  const itemsStart = content.indexOf('"items"')
  const firstBrace = content.indexOf('{', itemsStart)
  let depth = 1
  let i = firstBrace + 1

  let currentItemId: string | null = null
  let currentItemStart = -1

  // Maps by prefab or special category
  const terrainItems: ParsedItem[] = []
  const weatherItems: ParsedItem[] = []
  const radiantTowers: ParsedItem[] = []
  const direTowers: ParsedItem[] = []
  const radiantCreeps: ParsedItem[] = []
  const direCreeps: ParsedItem[] = []
  const radiantSiege: ParsedItem[] = []
  const direSiege: ParsedItem[] = []
  const roshanItems: ParsedItem[] = []
  const tormentorItems: ParsedItem[] = []
  const ancientItems: ParsedItem[] = []
  const emblemItems: ParsedItem[] = []
  const killStreakItems: ParsedItem[] = []
  const shaderItems: ParsedItem[] = []
  const teleportItems: ParsedItem[] = []
  const blinkItems: ParsedItem[] = []
  const loadscreenItems: ParsedItem[] = []
  const hudItems: ParsedItem[] = []
  const cursorItems: ParsedItem[] = []
  const versusItems: ParsedItem[] = []
  const wardItems: ParsedItem[] = []
  const courierItems: ParsedItem[] = []
  const announcerItems: ParsedItem[] = []
  const musicItems: ParsedItem[] = []

  function cleanRarity(r?: string | null): string {
    if (!r) return 'Common'
    return r.charAt(0).toUpperCase() + r.slice(1).toLowerCase()
  }

  while (i < content.length && depth > 0) {
    const c = content[i]
    if (c === '"') {
      const strStart = i + 1
      let strEnd = content.indexOf('"', strStart)
      while (strEnd !== -1 && content[strEnd - 1] === '\\') {
        strEnd = content.indexOf('"', strEnd + 1)
      }
      const token = content.slice(strStart, strEnd)
      i = strEnd + 1
      if (depth === 1 && /^\d+$/.test(token)) {
        currentItemId = token
        currentItemStart = content.indexOf('{', i)
      }
      continue
    } else if (c === '{') {
      depth++
    } else if (c === '}') {
      depth--
      if (depth === 1 && currentItemId && currentItemStart !== -1) {
        const block = content.slice(currentItemStart, i + 1)
        const idNum = parseInt(currentItemId, 10)

        const nameM = block.match(/"name"\s*"([^"]+)"/)
        const prefabM = block.match(/"prefab"\s*"([^"]+)"/)
        const imgM = block.match(/"image_inventory"\s*"([^"]+)"/)
        const rarityM = block.match(/"item_rarity"\s*"([^"]+)"/)
        const slotM = block.match(/"item_slot"\s*"([^"]+)"/)

        const name = nameM ? nameM[1] : `Item ${idNum}`
        const prefab = prefabM ? prefabM[1] : ''
        const img = imgM ? imgM[1] : ''
        const rarity = cleanRarity(rarityM ? rarityM[1] : null)
        const slot = slotM ? slotM[1] : ''

        const isDefault = name.toLowerCase().includes('default') || block.includes('"baseitem"\t\t"1"')

        const itemObj: ParsedItem = {
          id: idNum,
          name,
          tag: rarity,
          img
        }
        if (isDefault) itemObj.isDefault = true

        // Categorize
        if (prefab === 'terrain') {
          terrainItems.push(itemObj)
        } else if (slot === 'weather' || prefab === 'weather') {
          weatherItems.push(itemObj)
        } else if (prefab === 'radianttowers') {
          radiantTowers.push(itemObj)
        } else if (prefab === 'diretowers') {
          direTowers.push(itemObj)
        } else if (prefab === 'radiantcreeps') {
          radiantCreeps.push(itemObj)
        } else if (prefab === 'direcreeps') {
          direCreeps.push(itemObj)
        } else if (prefab === 'radiantsiegecreeps') {
          radiantSiege.push(itemObj)
        } else if (prefab === 'diresiegecreeps') {
          direSiege.push(itemObj)
        } else if (prefab === 'roshan') {
          roshanItems.push(itemObj)
        } else if (prefab === 'tormentor') {
          tormentorItems.push(itemObj)
        } else if (prefab === 'ancient') {
          ancientItems.push(itemObj)
        } else if (prefab === 'emblem') {
          emblemItems.push(itemObj)
        } else if (prefab === 'streak_effect') {
          killStreakItems.push(itemObj)
        } else if (prefab === 'map_effect') {
          shaderItems.push(itemObj)
        } else if (prefab === 'teleport_effect') {
          teleportItems.push(itemObj)
        } else if (prefab === 'blink_effect') {
          blinkItems.push(itemObj)
        } else if (prefab === 'loading_screen') {
          loadscreenItems.push(itemObj)
        } else if (prefab === 'hud_skin') {
          hudItems.push(itemObj)
        } else if (prefab === 'cursor_pack') {
          cursorItems.push(itemObj)
        } else if (prefab === 'versus_screen') {
          versusItems.push(itemObj)
        } else if (prefab === 'ward') {
          wardItems.push(itemObj)
        } else if (prefab === 'courier') {
          courierItems.push(itemObj)
        } else if (prefab === 'announcer') {
          announcerItems.push(itemObj)
        } else if (prefab === 'music') {
          musicItems.push(itemObj)
        }

        currentItemId = null
        currentItemStart = -1
      }
    }
    i++
  }

  // Sort and set best flag
  function polishList(list: ParsedItem[]): ParsedItem[] {
    if (list.length > 0 && !list.some((it) => it.best)) {
      list[0].best = true
    }
    return list
  }

  console.log(`Parsed items:
  - Loadscreens: ${loadscreenItems.length}
  - HUDs: ${hudItems.length}
  - Cursors: ${cursorItems.length}
  - Versus Screens: ${versusItems.length}
  - Wards: ${wardItems.length}
  - Couriers: ${courierItems.length}
  - Announcers: ${announcerItems.length}
  - Music Packs: ${musicItems.length}
  - Creeps (Radiant/Dire/Siege): ${radiantCreeps.length}/${direCreeps.length}/${radiantSiege.length}/${direSiege.length}
  - Towers (Radiant/Dire): ${radiantTowers.length}/${direTowers.length}
  - Terrains: ${terrainItems.length}
  - Weather: ${weatherItems.length}
  - Roshan: ${roshanItems.length}
  - Tormentor: ${tormentorItems.length}
  - Ancient: ${ancientItems.length}
  - Emblems: ${emblemItems.length}
  - Shaders: ${shaderItems.length}
  - Kill Streak: ${killStreakItems.length}
  - Teleport: ${teleportItems.length}
  - Blink: ${blinkItems.length}
  `)

  // Build the catalog object
  const catalog: Record<string, CategoryDefinition> = {
    loadscreens: {
      slots: [{ id: 'loading_screen', name: 'Loading Screen', icon: '🖼️' }],
      items: { loading_screen: polishList(loadscreenItems) }
    },
    huds: {
      slots: [{ id: 'hud_skin', name: 'HUD Layout Skin', icon: '🖥️' }],
      items: { hud_skin: polishList(hudItems) }
    },
    cursor: {
      slots: [{ id: 'cursor_pack', name: 'Cursor Style Pack', icon: '🖱️' }],
      items: { cursor_pack: polishList(cursorItems) }
    },
    versus_screen: {
      slots: [{ id: 'versus_screen', name: 'Versus Screen', icon: '⚔️' }],
      items: { versus_screen: polishList(versusItems) }
    },
    wards: {
      slots: [{ id: 'ward', name: 'Observer & Sentry Ward', icon: '👁️' }],
      items: { ward: polishList(wardItems) }
    },
    courier: {
      slots: [{ id: 'courier', name: 'Courier', icon: '🐴' }],
      items: { courier: polishList(courierItems) }
    },
    announcers: {
      slots: [{ id: 'announcer', name: 'Announcer Pack', icon: '🎙️' }],
      items: { announcer: polishList(announcerItems) }
    },
    music_packs: {
      slots: [{ id: 'music_pack', name: 'Soundtrack & Music Pack', icon: '🎵' }],
      items: { music_pack: polishList(musicItems) }
    },
    creeps: {
      slots: [
        { id: 'radiant_creeps', name: 'Radiant Creeps', icon: '🌲' },
        { id: 'dire_creeps', name: 'Dire Creeps', icon: '🔥' },
        { id: 'radiant_siege', name: 'Radiant Siege Creeps', icon: '🚜' },
        { id: 'dire_siege', name: 'Dire Siege Creeps', icon: '💣' }
      ],
      items: {
        radiant_creeps: polishList(radiantCreeps),
        dire_creeps: polishList(direCreeps),
        radiant_siege: polishList(radiantSiege),
        dire_siege: polishList(direSiege)
      }
    },
    weather: {
      slots: [{ id: 'weather_effect', name: 'Atmospheric Weather', icon: '🌧️' }],
      items: { weather_effect: polishList(weatherItems) }
    },
    tower: {
      slots: [
        { id: 'radiant_tower', name: 'Radiant Tower Model', icon: '🏰' },
        { id: 'dire_tower', name: 'Dire Tower Model', icon: '🏯' }
      ],
      items: {
        radiant_tower: polishList(radiantTowers),
        dire_tower: polishList(direTowers)
      }
    },
    roshan: {
      slots: [{ id: 'roshan_model', name: 'Roshan Skin & Statue', icon: '🐉' }],
      items: { roshan_model: polishList(roshanItems) }
    },
    teleport: {
      slots: [{ id: 'tp_effect', name: 'Teleport Scroll FX', icon: '🌀' }],
      items: { tp_effect: polishList(teleportItems) }
    },
    blink: {
      slots: [{ id: 'blink_effect', name: 'Blink Dagger Effect', icon: '⚡' }],
      items: { blink_effect: polishList(blinkItems) }
    },
    kill_streak: {
      slots: [{ id: 'streak_effect', name: 'Streak Particle Banner', icon: '⚡' }],
      items: { streak_effect: polishList(killStreakItems) }
    },
    tormentor: {
      slots: [{ id: 'tormentor', name: 'Tormentor Skin', icon: '💎' }],
      items: { tormentor: polishList(tormentorItems) }
    },
    ancient: {
      slots: [{ id: 'ancient', name: 'Ancient Structure Skin', icon: '🏛️' }],
      items: { ancient: polishList(ancientItems) }
    },
    shader: {
      slots: [{ id: 'map_effect', name: 'Map Shader Effect', icon: '🎨' }],
      items: { map_effect: polishList(shaderItems) }
    },
    emblem: {
      slots: [{ id: 'emblem', name: 'Hero Relic Aura Emblem', icon: '✨' }],
      items: { emblem: polishList(emblemItems) }
    },
    terrain: {
      slots: [{ id: 'map_terrain', name: 'Map Terrain Landscape', icon: '🗺️' }],
      items: { map_terrain: polishList(terrainItems) }
    }
  }

  // Create convenient aliases
  catalog.towers = catalog.tower
  catalog.maps = catalog.terrain
  catalog.loading = catalog.loadscreens
  catalog.loading_screen = catalog.loadscreens
  catalog.hud = catalog.huds
  catalog.cursor_pack = catalog.cursor
  catalog.couriers = catalog.courier
  catalog.announcer = catalog.announcers
  catalog.music = catalog.music_packs
  catalog.official_music_packs = catalog.music_packs
  catalog.streak_effect = catalog.kill_streak

  console.log(`Writing catalog to ${OUTPUT_PATH}...`)
  const tsContent = `// Catalog of Equipment Slots and Official Items for Non-Hero Categories
// Auto-generated from Valve official Dota 2 schema (items_game.txt)

export interface NonHeroSlot {
  id: string
  name: string
  icon: string
}

export interface NonHeroItem {
  id?: number | string
  name: string
  tag: string
  img?: string
  best?: boolean
  isDefault?: boolean
}

export interface NonHeroCategory {
  slots: NonHeroSlot[]
  items: Record<string, NonHeroItem[]>
}

export const NON_HERO_SLOTS_CATALOG: Record<string, NonHeroCategory> = ${JSON.stringify(catalog, null, 2)}
`

  fs.writeFileSync(OUTPUT_PATH, tsContent, 'utf8')
  console.log('Successfully generated nonHeroCatalog.ts!')
}

if (require.main === module) {
  buildNonHeroCatalog()
}
