/**
 * Dota 2 SkinForge — Cosmetic Rarity Configuration & Classification
 */

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

export interface RarityConfigItem {
  name: string
  color: string
  glow: string
  bg1: string
  bg2: string
}

export interface ItemDescriptor {
  id?: string | number
  name?: string
  tag?: string
  rarity?: ItemRarity | string
  isDefault?: boolean
  img?: string
}

export interface HeroImageTarget {
  tag?: string
  img?: string
}

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

/** Rarest-first ordering used by "Unlock Best Set". */
export const RARITY_RANK: Record<string, number> = {
  arcana: 8,
  immortal: 7,
  legendary: 6,
  mythical: 5,
  rare: 4,
  uncommon: 3,
  common: 2,
  seasonal: 1,
  persona: 1,
  taunt: 0
}

export function rarityRank(rarity?: string): number {
  return RARITY_RANK[(rarity || '').toLowerCase()] ?? 0
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
