import { getCanonicalHero } from './heroAliases'

export interface StyleOption {
  index: number
  name: string
  description?: string
  skin?: number
  model?: string
}

export interface CosmeticCustomizationInfo {
  hasStyles: boolean
  styles: StyleOption[]
  hasColorGem: boolean
  defaultGemColor?: string
}

export interface ArcanaRegistryEntry {
  hero: string
  slot: string
  matchKeywords: string[]
  styles?: StyleOption[]
  hasColorGem?: boolean
  defaultGemColor?: string
}

export const ARCANA_REGISTRY: ArcanaRegistryEntry[] = [
  {
    hero: 'vengefulspirit',
    slot: 'shoulder',
    matchKeywords: ['resurrection of shen', 'screeauk', 'shen', 'arcana'],
    styles: [
      { index: 0, name: 'Resurrection of Shen', skin: 0 },
      { index: 1, name: 'Servants of Scree’Auk', skin: 1 },
      { index: 2, name: 'Queen Imperia', skin: 0, model: 'models/items/vengefulspirit/imperia/imperia.vmdl' }
    ]
  },
  {
    hero: 'queenofpain',
    slot: 'back',
    matchKeywords: ['eminence of ristul', 'ristul'],
    styles: [
      { index: 0, name: 'The Eminence of Ristul', skin: 0 },
      { index: 1, name: 'Royal Decree', skin: 1 }
    ]
  },
  {
    hero: 'skeleton_king',
    slot: 'head',
    matchKeywords: ['one true king'],
    styles: [
      { index: 0, name: 'The One True King', skin: 0 },
      { index: 1, name: 'Malignant Monster', skin: 1 }
    ]
  },
  {
    hero: 'windrunner',
    slot: 'head',
    matchKeywords: ['compass of the rising gale'],
    styles: [
      { index: 0, name: 'Compass of the Rising Gale', skin: 0 },
      { index: 1, name: 'Reflections of the Gale', skin: 1 }
    ]
  },
  {
    hero: 'phantom_assassin',
    slot: 'weapon',
    matchKeywords: ['manifold paradox'],
    styles: [
      { index: 0, name: 'Asan’s Blade', skin: 0 },
      { index: 1, name: 'Elder Smith', skin: 1 },
      { index: 2, name: 'Nemesis Assassin', skin: 2 }
    ]
  },
  {
    hero: 'pudge',
    slot: 'back',
    matchKeywords: ['feast of abscession'],
    styles: [
      { index: 0, name: 'Feast of Abscession (Red)', skin: 0 },
      { index: 1, name: 'Grand Abscession (Green)', skin: 1 }
    ]
  },
  {
    hero: 'juggernaut',
    slot: 'head',
    matchKeywords: ['bladeform legacy'],
    styles: [
      { index: 0, name: 'Bladeform Legacy', skin: 0 },
      { index: 1, name: 'Origins', skin: 1 }
    ]
  },
  {
    hero: 'ogre_magi',
    slot: 'head',
    matchKeywords: ['flockheart'],
    styles: [
      { index: 0, name: 'Flockheart’s Gamble', skin: 0 },
      { index: 1, name: 'Resplendent', skin: 1 }
    ]
  },
  {
    hero: 'razor',
    slot: 'head',
    matchKeywords: ['voidstorm asylum'],
    styles: [
      { index: 0, name: 'Voidstorm Asylum', skin: 0 },
      { index: 1, name: 'Storm Surged', skin: 1 }
    ]
  },
  {
    hero: 'faceless_void',
    slot: 'head',
    matchKeywords: ['claszian apostasy'],
    styles: [
      { index: 0, name: 'Claszian Apostasy', skin: 0 },
      { index: 1, name: 'Claszian Supremacy', skin: 1 }
    ]
  },
  {
    hero: 'drow_ranger',
    slot: 'weapon',
    matchKeywords: ['dread retribution'],
    styles: [
      { index: 0, name: 'Dread Retribution', skin: 0 },
      { index: 1, name: 'Master of Madness', skin: 1 }
    ]
  },
  {
    hero: 'earthshaker',
    slot: 'head',
    matchKeywords: ['planetfall'],
    styles: [
      { index: 0, name: 'Planetfall', skin: 0 },
      { index: 1, name: 'Burning Descent', skin: 1 }
    ]
  },
  {
    hero: 'spectre',
    slot: 'head',
    matchKeywords: ['phantom advent'],
    styles: [
      { index: 0, name: 'Phantom Advent', skin: 0 },
      { index: 1, name: 'Volatile Elegance', skin: 1 }
    ]
  },
  {
    hero: 'rubick',
    slot: 'back',
    matchKeywords: ['magus cypher'],
    styles: [
      { index: 0, name: 'Standard', skin: 0 },
      { index: 1, name: 'Golden Resplendence (40 Spells)', skin: 1 }
    ]
  },
  {
    hero: 'skywrath_mage',
    slot: 'head',
    matchKeywords: ['devotions of dragonus'],
    styles: [
      { index: 0, name: 'The Devotions of Dragonus', skin: 0 },
      { index: 1, name: 'Servants of Scree’Auk', skin: 1 }
    ]
  },
  {
    hero: 'terrorblade',
    slot: 'hero_base',
    matchKeywords: ['fractal horns', 'abysm'],
    hasColorGem: true,
    defaultGemColor: '#FF3C28'
  },
  {
    hero: 'terrorblade',
    slot: 'head',
    matchKeywords: ['fractal horns', 'abysm'],
    hasColorGem: true,
    defaultGemColor: '#FF3C28'
  },
  {
    hero: 'techies',
    slot: 'hero_base',
    matchKeywords: ['sunken galley', 'swine'],
    hasColorGem: true,
    defaultGemColor: '#FFAF00'
  }
]

export function getCosmeticCustomizationInfo(heroTag?: string, slotId?: string, itemName?: string): CosmeticCustomizationInfo | null {
  if (!heroTag || !itemName) return null
  const cleanHero = getCanonicalHero(heroTag).replace(/[^a-z0-9]/g, '')
  const normItem = itemName.toLowerCase().replace(/[^a-z0-9]/g, '')

  const entry = ARCANA_REGISTRY.find((e) => {
    const eHero = e.hero.replace(/[^a-z0-9]/g, '')
    if (eHero !== cleanHero) return false
    if (slotId && e.slot !== slotId && e.slot !== 'hero_base' && slotId !== 'hero_base') return false
    return e.matchKeywords.some((kw) => normItem.includes(kw.replace(/[^a-z0-9]/g, '')))
  })

  if (!entry) return null

  return {
    hasStyles: !!(entry.styles && entry.styles.length > 0),
    styles: entry.styles || [],
    hasColorGem: !!entry.hasColorGem,
    defaultGemColor: entry.defaultGemColor
  }
}
