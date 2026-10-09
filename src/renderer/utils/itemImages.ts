/**
 * Dota 2 SkinForge — Item Images & Official Valve Rarity Visual Engine
 */

export interface RarityConfigItem {
  name: string
  color: string
  glow: string
  bg1: string
  bg2: string
}

export type ItemRarity =
  | 'arcana'
  | 'persona'
  | 'immortal'
  | 'golden'
  | 'crimson'
  | 'legendary'
  | 'mythical'
  | 'rare'
  | 'uncommon'
  | 'common'
  | 'taunt'
  | 'voice'
  | 'ambient'
  | 'default'

export const RARITY_CONFIG: Record<ItemRarity, RarityConfigItem> = {
  arcana: {
    name: 'Arcana',
    color: '#00e5ff',
    glow: 'rgba(0, 229, 255, 0.55)',
    bg1: '#072b38',
    bg2: '#021219'
  },
  persona: {
    name: 'Persona',
    color: '#ec4899',
    glow: 'rgba(236, 72, 153, 0.55)',
    bg1: '#380a27',
    bg2: '#160410'
  },
  immortal: {
    name: 'Immortal',
    color: '#eab308',
    glow: 'rgba(234, 179, 8, 0.55)',
    bg1: '#362402',
    bg2: '#160e01'
  },
  golden: {
    name: 'Immortal',
    color: '#ffd700',
    glow: 'rgba(255, 215, 0, 0.65)',
    bg1: '#3a2902',
    bg2: '#181201'
  },
  crimson: {
    name: 'Crimson',
    color: '#ef4444',
    glow: 'rgba(239, 68, 68, 0.6)',
    bg1: '#360909',
    bg2: '#160303'
  },
  legendary: {
    name: 'Legendary',
    color: '#a855f7',
    glow: 'rgba(168, 85, 247, 0.55)',
    bg1: '#260a3a',
    bg2: '#10031a'
  },
  mythical: {
    name: 'Mythical',
    color: '#8b5cf6',
    glow: 'rgba(139, 92, 246, 0.5)',
    bg1: '#200e38',
    bg2: '#0d0518'
  },
  rare: {
    name: 'Rare',
    color: '#3b82f6',
    glow: 'rgba(59, 130, 246, 0.45)',
    bg1: '#0a1d3d',
    bg2: '#040d1a'
  },
  uncommon: {
    name: 'Uncommon',
    color: '#06b6d4',
    glow: 'rgba(6, 182, 212, 0.4)',
    bg1: '#06242c',
    bg2: '#020f12'
  },
  common: {
    name: 'Common',
    color: '#94a3b8',
    glow: 'rgba(148, 163, 184, 0.3)',
    bg1: '#141a29',
    bg2: '#090c13'
  },
  taunt: {
    name: 'Taunt',
    color: '#f97316',
    glow: 'rgba(249, 115, 22, 0.5)',
    bg1: '#331505',
    bg2: '#140802'
  },
  voice: {
    name: 'Voice',
    color: '#10b981',
    glow: 'rgba(16, 185, 129, 0.5)',
    bg1: '#06261c',
    bg2: '#02120d'
  },
  ambient: {
    name: 'Ambient',
    color: '#e879f9',
    glow: 'rgba(232, 121, 249, 0.5)',
    bg1: '#2e0a35',
    bg2: '#130417'
  },
  default: {
    name: 'Base',
    color: '#64748b',
    glow: 'rgba(100, 116, 139, 0.25)',
    bg1: '#0f1422',
    bg2: '#070a12'
  }
}

export interface ItemDescriptor {
  id?: string | number
  name?: string
  tag?: string
  rarity?: ItemRarity | string
  isDefault?: boolean
  best?: boolean
  img?: string
}

export interface HeroImageTarget {
  tag?: string
  img?: string
}

export function getItemRarityKey(item?: ItemDescriptor | null): ItemRarity {
  if (!item) return 'default'
  if (item.isDefault) return 'common'
  const tag = (item.tag || item.rarity || '').toLowerCase().trim()

  // 1. Prioritize authoritative Valve tag / rarity
  if (tag.includes('arcana')) return 'arcana'
  if (tag.includes('persona')) return 'persona'
  if (tag.includes('immortal')) return 'immortal'
  if (tag.includes('legendary')) return 'legendary'
  if (tag.includes('mythical')) return 'mythical'
  if (tag.includes('uncommon')) return 'uncommon'
  if (tag.includes('common')) return 'common'
  if (tag.includes('rare')) return 'rare'
  if (tag.includes('seasonal') || tag.includes('ancient')) return 'rare'
  if (tag.includes('taunt')) return 'taunt'
  if (tag.includes('voice') || tag.includes('sound')) return 'voice'
  if (tag.includes('gem') || tag.includes('ambient') || tag.includes('particle')) return 'ambient'

  // 2. Fallback heuristic ONLY when tag is completely absent
  // Never infer 'immortal' or 'golden' from item names (e.g. "Immortals Pride", "Golden Walrus Whacker")
  if (!tag) {
    const name = (item.name || '').toLowerCase()
    if (name.includes('taunt:') || name.startsWith('taunt')) return 'taunt'
    if (name.includes('voice pack') || name.includes('announcer')) return 'voice'
    if (name.includes('ambient') || name.includes('particle')) return 'ambient'
    if (name.includes('arcana')) return 'arcana'
    if (name.includes('persona')) return 'persona'
  }

  return 'rare'
}

export function getRarityConfig(item?: ItemDescriptor | null): RarityConfigItem {
  const key = getItemRarityKey(item)
  return RARITY_CONFIG[key] || RARITY_CONFIG.rare
}

export const CATEGORY_SVG_MAP: Record<string, string> = {
  creeps: '../assets/categories/creeps.svg',
  radiant_creeps: '../assets/categories/creeps.svg',
  dire_creeps: '../assets/categories/creeps.svg',
  courier: '../assets/categories/courier.svg',
  couriers: '../assets/categories/courier.svg',
  wards: '../assets/categories/wards.svg',
  ward: '../assets/categories/wards.svg',
  music: '../assets/categories/music.svg',
  music_packs: '../assets/categories/music.svg',
  official_music_packs: '../assets/categories/music.svg',
  weather: '../assets/categories/weather.svg',
  announcers: '../assets/categories/announcers.svg',
  announcer: '../assets/categories/announcers.svg',
  roshan: '../assets/categories/roshan.svg',
  tower: '../assets/categories/tower.svg',
  towers: '../assets/categories/tower.svg',
  river: '../assets/categories/river.svg',
  cursor: '../assets/categories/interface.svg',
  huds: '../assets/categories/interface.svg',
  hud: '../assets/categories/interface.svg',
  loadscreens: '../assets/categories/interface.svg',
  loading: '../assets/categories/interface.svg',
  loading_screen: '../assets/categories/interface.svg',
  versus_screen: '../assets/categories/interface.svg',
  versus: '../assets/categories/interface.svg',
  tormentor: '../assets/categories/maps.svg',
  ancient: '../assets/categories/maps.svg',
  kill_streak: '../assets/categories/effects.svg',
  streak_effect: '../assets/categories/effects.svg',
  shader: '../assets/categories/interface.svg',
  emblem: '../assets/categories/effects.svg',
  interface: '../assets/categories/interface.svg',
  teleport: '../assets/categories/effects.svg',
  blink: '../assets/categories/effects.svg',
  effects: '../assets/categories/effects.svg',
  maps: '../assets/categories/maps.svg',
  world: '../assets/categories/maps.svg',
  default: '../assets/categories/default.svg'
}

export function getCategorySvg(tagOrSlot?: string | null): string | null {
  if (!tagOrSlot) return null
  const key = tagOrSlot.toLowerCase().replace(/\s+/g, '_').replace(/-/g, '_')
  if (CATEGORY_SVG_MAP[key]) return CATEGORY_SVG_MAP[key]
  for (const [k, v] of Object.entries(CATEGORY_SVG_MAP)) {
    if (key.includes(k)) return v
  }
  return null
}

function getSlotSvgIcon(slotId: string, color: string): string {
  const s = slotId ? slotId.toLowerCase() : ''

  // Non-hero slot icons
  if (s.includes('creep') || s.includes('siege')) {
    return `<path d="M22 24 L40 14 L58 24 L54 52 L40 68 L26 52 Z M32 30 L48 30 L44 48 L40 56 L36 48 Z" fill="${color}" filter="drop-shadow(0 0 5px ${color})"/>
            <line x1="30" y1="20" x2="50" y2="20" stroke="#ffffff" stroke-width="2" opacity="0.6"/>`
  }
  if (s.includes('music') || s.includes('soundtrack') || s.includes('audio')) {
    return `<path d="M28 54 A8 8 0 1 1 20 46 L20 22 L52 14 L52 46 A8 8 0 1 1 44 38 L44 20 L28 26 Z" fill="${color}" filter="drop-shadow(0 0 5px ${color})"/>`
  }
  if (s.includes('announcer') || s.includes('mega_kill') || s.includes('voice')) {
    return `<rect x="32" y="16" width="16" height="30" rx="8" fill="${color}" filter="drop-shadow(0 0 5px ${color})"/>
            <path d="M22 36 C22 48 30 54 40 54 C50 54 58 48 58 36 M40 54 L40 66 M28 66 L52 66" stroke="${color}" stroke-width="4" stroke-linecap="round" fill="none"/>`
  }
  if (s.includes('courier')) {
    return `<path d="M20 44 C20 32 30 22 44 22 C56 22 62 30 62 44 L60 62 C52 66 28 66 20 62 Z M34 32 C38 32 40 36 38 40 C34 40 32 36 34 32 Z" fill="${color}" filter="drop-shadow(0 0 5px ${color})"/>
            <path d="M16 32 C12 24 18 16 28 18 C34 20 32 28 26 30 Z" fill="${color}" opacity="0.8"/>
            <path d="M64 32 C68 24 62 16 52 18 C46 20 48 28 54 30 Z" fill="${color}" opacity="0.8"/>`
  }
  if (s.includes('weather') || s.includes('atmosphere')) {
    return `<path d="M26 44 C20 44 16 38 18 32 C20 26 26 24 30 26 C34 20 44 18 50 24 C56 24 62 28 62 36 C62 44 56 44 50 44 Z" fill="${color}" filter="drop-shadow(0 0 5px ${color})"/>
            <line x1="28" y1="52" x2="24" y2="62" stroke="${color}" stroke-width="3" stroke-linecap="round"/>
            <line x1="40" y1="52" x2="36" y2="62" stroke="${color}" stroke-width="3" stroke-linecap="round"/>
            <line x1="52" y1="52" x2="48" y2="62" stroke="${color}" stroke-width="3" stroke-linecap="round"/>`
  }
  if (s.includes('ward')) {
    return `<ellipse cx="40" cy="30" rx="18" ry="12" fill="none" stroke="${color}" stroke-width="3.5" filter="drop-shadow(0 0 5px ${color})"/>
            <circle cx="40" cy="30" r="6" fill="${color}"/>
            <circle cx="42" cy="28" r="2" fill="#ffffff"/>
            <path d="M40 42 L40 68 M32 68 L48 68" stroke="${color}" stroke-width="4" stroke-linecap="round"/>`
  }
  if (s.includes('cursor')) {
    return `<path d="M24 16 L24 58 L36 46 L48 64 L54 60 L42 42 L58 42 Z" fill="${color}" stroke="#0f172a" stroke-width="2" filter="drop-shadow(0 0 5px ${color})"/>`
  }
  if (s.includes('hud')) {
    return `<rect x="16" y="20" width="48" height="34" rx="4" fill="none" stroke="${color}" stroke-width="3.5" filter="drop-shadow(0 0 5px ${color})"/>
            <line x1="40" y1="54" x2="40" y2="66" stroke="${color}" stroke-width="4"/>
            <line x1="28" y1="66" x2="52" y2="66" stroke="${color}" stroke-width="3.5" stroke-linecap="round"/>
            <rect x="22" y="26" width="16" height="8" rx="2" fill="${color}" opacity="0.7"/>`
  }
  if (s.includes('loading') || s.includes('loadscreen')) {
    return `<rect x="14" y="18" width="52" height="38" rx="4" fill="none" stroke="${color}" stroke-width="3" filter="drop-shadow(0 0 5px ${color})"/>
            <polygon points="22,46 34,32 44,40 54,28 62,46" fill="${color}" opacity="0.8"/>
            <circle cx="28" cy="28" r="4" fill="${color}"/>`
  }
  if (s.includes('versus')) {
    return `<path d="M22 22 L36 36 M36 22 L22 36 M44 26 L56 38 L48 42 Z" stroke="${color}" stroke-width="3" filter="drop-shadow(0 0 5px ${color})"/>`
  }
  if (s.includes('teleport') || s.includes('tp_effect')) {
    return `<circle cx="40" cy="40" r="22" fill="none" stroke="${color}" stroke-width="3" stroke-dasharray="8 4" filter="drop-shadow(0 0 6px ${color})"/>
            <circle cx="40" cy="40" r="12" fill="none" stroke="${color}" stroke-width="2.5"/>
            <circle cx="40" cy="40" r="4" fill="${color}"/>
            <path d="M40 18 C46 26 50 34 50 40 C50 46 44 50 40 50 C36 50 32 44 34 40 C36 36 40 36 40 40" fill="none" stroke="#ffffff" stroke-width="2" opacity="0.8"/>`
  }
  if (s.includes('blink')) {
    return `<polygon points="44,12 24,40 38,40 32,68 56,34 42,34" fill="${color}" filter="drop-shadow(0 0 6px ${color})"/>`
  }
  if (s.includes('river') || s.includes('vial')) {
    return `<path d="M34 16 L46 16 L46 26 L56 46 C60 54 54 66 40 66 C26 66 20 54 24 46 L34 26 Z" fill="none" stroke="${color}" stroke-width="3.5" filter="drop-shadow(0 0 5px ${color})"/>
            <path d="M26 50 C28 54 34 60 40 60 C46 60 52 54 54 50 Z" fill="${color}" opacity="0.8"/>`
  }
  if (s.includes('roshan')) {
    return `<path d="M20 30 C18 20 28 14 34 22 C38 18 42 18 46 22 C52 14 62 20 60 30 C64 42 56 60 40 68 C24 60 16 42 20 30 Z M30 36 A4 4 0 1 1 30 44 A4 4 0 1 1 30 36 M50 36 A4 4 0 1 1 50 44 A4 4 0 1 1 50 36" fill="${color}" filter="drop-shadow(0 0 6px ${color})"/>`
  }
  if (s.includes('tower')) {
    return `<path d="M26 18 L32 18 L32 24 L38 24 L38 18 L42 18 L42 24 L48 24 L48 18 L54 18 L50 66 L30 66 Z M36 40 A4 8 0 0 1 44 40 L44 56 L36 56 Z" fill="${color}" filter="drop-shadow(0 0 5px ${color})"/>`
  }

  // Hero slot icons
  if (s.includes('weapon') || s.includes('sword') || s.includes('blade') || s.includes('staff')) {
    return `<path d="M48 16 L56 24 L34 46 L26 38 Z M32 48 L18 62 L12 66 L16 70 L20 66 L34 52 Z M14 68 L10 72 L12 74 L16 70 Z M52 20 L44 12 L38 18 L46 26 Z" fill="${color}" filter="drop-shadow(0 0 5px ${color})"/>`
  }
  if (s.includes('mount') || s.includes('bat') || s.includes('steed')) {
    return `<path d="M22 60 C16 48 18 32 28 22 C36 14 50 16 56 26 C60 34 56 46 48 52 L48 62 C38 66 26 68 22 60 Z M34 30 C32 30 30 28 32 26 C34 24 38 24 38 28 C38 30 36 30 34 30 Z" fill="${color}" filter="drop-shadow(0 0 5px ${color})"/>`
  }
  if (s.includes('offhand') || s.includes('shield')) {
    return `<path d="M40 16 C22 16 14 26 14 44 C14 66 40 78 40 78 C40 78 66 66 66 44 C66 26 58 16 40 16 Z M40 24 C52 24 58 31 58 44 C58 60 40 70 40 70 C40 70 22 60 22 44 C22 31 28 24 40 24 Z" fill="${color}" filter="drop-shadow(0 0 5px ${color})"/>`
  }
  if (s.includes('head') || s.includes('helm') || s.includes('crown') || s.includes('mask')) {
    return `<path d="M18 28 L28 18 L40 26 L52 18 L62 28 L58 56 C58 64 40 70 40 70 C40 70 22 64 22 56 Z M26 38 L54 38 L52 50 C48 54 40 56 40 56 C40 56 32 54 28 50 Z" fill="${color}" filter="drop-shadow(0 0 5px ${color})"/>`
  }
  if (s.includes('shoulder') || s.includes('pauldron')) {
    return `<path d="M16 28 C24 18 42 18 50 22 L64 32 L68 52 L52 60 L32 56 L18 46 Z M26 30 C36 28 50 32 54 40 L34 52 Z" fill="${color}" filter="drop-shadow(0 0 5px ${color})"/>`
  }
  if (s.includes('armor') || s.includes('robe') || s.includes('costume') || s.includes('chest')) {
    return `<path d="M26 18 L34 24 L46 24 L54 18 L64 30 L58 64 L40 72 L22 64 L16 30 Z M32 30 L48 30 L52 58 L40 64 L28 58 Z" fill="${color}" filter="drop-shadow(0 0 5px ${color})"/>`
  }
  if (s.includes('arms') || s.includes('bracer') || s.includes('glove')) {
    return `<path d="M24 22 L56 22 L52 68 L28 68 Z M30 30 L50 30 L48 46 L32 46 Z M32 52 L48 52 L46 62 L34 62 Z" fill="${color}" filter="drop-shadow(0 0 5px ${color})"/>`
  }
  if (s.includes('back') || s.includes('cape') || s.includes('wings')) {
    return `<path d="M28 18 C36 16 44 16 52 18 L64 68 C52 74 40 72 40 72 C40 72 28 74 16 68 Z M32 26 L48 26 L54 62 C46 64 40 64 40 64 C40 64 34 64 26 62 Z" fill="${color}" filter="drop-shadow(0 0 5px ${color})"/>`
  }
  if (s.includes('belt') || s.includes('waist')) {
    return `<path d="M20 26 L60 26 L62 42 L48 46 L42 68 L38 68 L32 46 L18 42 Z M26 32 L54 32 L52 40 L28 40 Z" fill="${color}" filter="drop-shadow(0 0 5px ${color})"/>`
  }
  if (s.includes('legs') || s.includes('boots')) {
    return `<path d="M24 18 L56 18 L52 48 L46 72 L34 72 L28 48 Z M30 24 L50 24 L46 44 L34 44 Z" fill="${color}" filter="drop-shadow(0 0 5px ${color})"/>`
  }
  if (s.includes('persona') || s.includes('herobase') || s.includes('hero_base')) {
    return `<circle cx="40" cy="28" r="12" fill="${color}" filter="drop-shadow(0 0 4px ${color})"/>
            <path d="M18 64 C18 48 28 42 40 42 C52 42 62 48 62 64 Z" fill="${color}" filter="drop-shadow(0 0 4px ${color})"/>
            <polygon points="40,12 43,18 50,19 45,24 46,31 40,27 34,31 35,24 30,19 37,18" fill="#ffffff" opacity="0.9"/>`
  }
  if (s.includes('taunt')) {
    return `<path d="M20 22 C20 18 60 18 60 22 L58 54 C58 64 40 68 40 68 C40 68 22 64 22 54 Z" fill="${color}" filter="drop-shadow(0 0 5px ${color})"/>
            <circle cx="30" cy="34" r="4" fill="#0d111a"/>
            <circle cx="50" cy="34" r="4" fill="#0d111a"/>
            <path d="M30 46 Q40 56 50 46" stroke="#0d111a" stroke-width="3" stroke-linecap="round" fill="none"/>`
  }
  if (s.includes('summon') || s.includes('pet')) {
    return `<circle cx="40" cy="38" r="14" fill="${color}" filter="drop-shadow(0 0 4px ${color})"/>
            <circle cx="28" cy="22" r="7" fill="${color}"/>
            <circle cx="52" cy="22" r="7" fill="${color}"/>
            <ellipse cx="40" cy="56" rx="18" ry="10" fill="${color}" opacity="0.75"/>`
  }
  if (s.includes('ambient') || s.includes('particle')) {
    return `<polygon points="40,12 48,28 66,32 52,44 56,62 40,52 24,62 28,44 14,32 32,28" fill="${color}" filter="drop-shadow(0 0 6px ${color})"/>
            <circle cx="40" cy="38" r="6" fill="#ffffff" opacity="0.9"/>`
  }

  return `<polygon points="40,16 62,24 58,58 40,68 22,58 18,24" fill="${color}" filter="drop-shadow(0 0 5px ${color})"/>
          <polygon points="40,22 54,28 50,52 40,60 30,52 26,28" fill="#0f1524" opacity="0.6"/>`
}

export function generateItemSvg(item: ItemDescriptor, slotId = 'weapon', _heroTag = ''): string {
  const conf = getRarityConfig(item)
  const iconSvg = getSlotSvgIcon(slotId, conf.color)
  const rarityName = conf.name.toUpperCase()

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 80" width="80" height="80">
  <defs>
    <radialGradient id="cardBg_${slotId}_${conf.name}" cx="50%" cy="38%" r="65%">
      <stop offset="0%" stop-color="${conf.bg1}" stop-opacity="1"/>
      <stop offset="100%" stop-color="${conf.bg2}" stop-opacity="1"/>
    </radialGradient>
    <linearGradient id="cardBorder_${slotId}_${conf.name}" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${conf.color}" stop-opacity="0.95"/>
      <stop offset="50%" stop-color="${conf.color}" stop-opacity="0.25"/>
      <stop offset="100%" stop-color="${conf.color}" stop-opacity="0.9"/>
    </linearGradient>
  </defs>

  <rect x="1" y="1" width="78" height="78" rx="7" fill="url(#cardBg_${slotId}_${conf.name})"/>
  <rect x="1" y="1" width="78" height="78" rx="7" fill="none" stroke="url(#cardBorder_${slotId}_${conf.name})" stroke-width="1.5"/>

  <line x1="8" y1="20" x2="72" y2="20" stroke="rgba(255,255,255,0.03)" stroke-width="1"/>
  <line x1="8" y1="58" x2="72" y2="58" stroke="rgba(255,255,255,0.03)" stroke-width="1"/>

  <g transform="translate(0, 0)">
    ${iconSvg}
  </g>

  <polygon points="68,6 74,12 68,18 62,12" fill="${conf.color}" opacity="0.95"/>
  <polygon points="68,8 72,12 68,16 64,12" fill="#ffffff" opacity="0.4"/>

  <rect x="8" y="71" width="64" height="2.5" rx="1.25" fill="${conf.color}" opacity="0.9"/>

  <rect x="6" y="58" width="34" height="10" rx="3" fill="rgba(0,0,0,0.7)"/>
  <text x="23" y="65.5" fill="${conf.color}" font-family="system-ui, sans-serif" font-size="6" font-weight="800" text-anchor="middle" letter-spacing="0.5">${rarityName}</text>
</svg>`

  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`
}

export function getItemImage(item?: ItemDescriptor | null, slotId = 'weapon', heroTag = '', heroObj?: HeroImageTarget | null): string {
  if (!item || item.isDefault || (item.name && item.name.toLowerCase().includes('official base'))) {
    if (heroObj && heroObj.img) {
      return heroObj.img
    }
    if (heroTag) {
      const catSvg = getCategorySvg(heroTag)
      if (catSvg) return catSvg
      const cleanTag = heroTag.toLowerCase().replace(/\s+/g, '_').replace(/-/g, '_')
      return `../assets/heroes/${cleanTag}.png`
    }
    return generateItemSvg({ name: 'Default Base', tag: 'default', isDefault: true }, slotId, heroTag)
  }

  // Tier 1: Official Valve econ cosmetic asset -> skinforge-icon protocol
  if (
    item &&
    item.img &&
    typeof item.img === 'string' &&
    (item.img.startsWith('econ/') ||
      item.img.startsWith('loadingscreens/') ||
      item.img.startsWith('compendium/') ||
      item.img.startsWith('teamfancontent/') ||
      item.img.startsWith('talentcontent/') ||
      item.img.startsWith('events/') ||
      item.img.startsWith('stickers/') ||
      item.img.startsWith('materials/'))
  ) {
    const cleanImg = item.img.replace(/\.(png|vtex_c)$/i, '')
    return `skinforge-icon://${cleanImg}.webp`
  }

  // Tier 2: Direct custom image path / URL / SVG
  if (item && item.img && typeof item.img === 'string' && item.img.length > 0 && !item.img.includes('cloudflare')) {
    return item.img
  }

  // Tier 3: Procedural SVG Fallback
  return generateItemSvg(item, slotId, heroTag)
}
