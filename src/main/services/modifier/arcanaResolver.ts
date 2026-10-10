/**
 * Dota 2 SkinForge — Universal Arcana & Persona Set Auto-Resolver
 *
 * When an Arcana or Persona is equipped, this service automatically:
 * 1. Pairs all matching set pieces (head, shoulders, belt, weapon, cape, etc.)
 *    for unselected/default slots so underlying normal base skin layers NEVER mix or clip.
 * 2. Hides incompatible default base wearables for Personas (e.g. adult AM blades,
 *    adult Pudge hook) using prop_null.vmdl.
 * 3. Preserves user-customized slots if the user explicitly picked a non-default item.
 */

import { normalizeName } from './matcher'

export interface ArcanaSetDefinition {
  hero: string
  matchKeywords: string[]
  slots: Record<string, string>
  hideBaseSlots?: string[]
}

export interface PersonaDefinition {
  hero: string
  matchKeywords: string[]
  personaSlots: Record<string, string>
  hideBaseSlots: string[]
}

export const ARCANA_SETS: ArcanaSetDefinition[] = [
  {
    hero: 'spectre',
    matchKeywords: ['phantomadvent'],
    slots: {
      head: 'Phantom Advent',
      belt: 'Phantom Advent - Belt',
      shoulder: 'Phantom Advent - Shoulders',
      weapon: 'Phantom Advent - Weapon',
      misc: 'Phantom Advent - Bracers',
      voice: 'Phantom Advent - Voice'
    }
  },
  {
    hero: 'windrunner',
    matchKeywords: ['compassoftherisinggale', 'risinggale'],
    slots: {
      hero_base: 'Compass of the Rising Gale',
      head: 'Hair of the Rising Gale',
      shoulder: 'Armor of the Rising Gale',
      back: 'Cape of the Rising Gale',
      offhand_weapon: 'Quiver of the Rising Gale',
      weapon: 'Longbow of the Rising Gale'
    }
  },
  {
    hero: 'queenofpain',
    matchKeywords: ['eminenceofristul', 'ristul'],
    slots: {
      back: 'Eminence of Ristul',
      weapon: 'Grace of the Eminence of Ristul',
      shoulder: 'Raiments of the Eminence of Ristul',
      head: 'Crown of the Eminence of Ristul'
    }
  },
  {
    hero: 'skeleton_king',
    matchKeywords: ['onetrueking', 'crownoftheonetrueking'],
    slots: {
      head: 'Crown of the One True King',
      weapon: 'Sword of the One True King',
      shoulder: 'Pauldrons of the One True King',
      arms: 'Bracers of the One True King',
      back: 'Cloak of the One True King',
      armor: 'Armor of the One True King'
    }
  },
  {
    hero: 'drow_ranger',
    matchKeywords: ['dreadretribution'],
    slots: {
      hero_base: 'Dread Retribution',
      weapon: 'Dread Retribution - Weapon',
      arms: 'Dread Retribution - Bracers',
      back: 'Dread Retribution - Cape',
      legs: 'Dread Retribution - Leg Armor',
      misc: 'Dread Retribution - Quiver',
      shoulder: 'Dread Retribution - Shoulder Armor',
      head: 'Dread Retribution - Headwear'
    }
  },
  {
    hero: 'faceless_void',
    matchKeywords: ['claszianapostasy'],
    slots: {
      body_head: 'Claszian Apostasy Head',
      head: 'Claszian Apostasy Head',
      weapon: 'Claszian Apostasy Weapon',
      shoulder: 'Claszian Apostasy Shoulder',
      arms: 'Claszian Apostasy Bracers',
      belt: 'Claszian Apostasy Belt'
    }
  },
  {
    hero: 'razor',
    matchKeywords: ['voidstormasylum'],
    slots: {
      weapon: 'Voidstorm Asylum Tormentor',
      head: 'Voidstorm Asylum Helm',
      armor: 'Voidstorm Asylum Armor',
      arms: 'Voidstorm Asylum Bracers',
      belt: 'Voidstorm Asylum Belt'
    }
  },
  {
    hero: 'skywrath_mage',
    matchKeywords: ['devotionsofdragonus', 'eyrieexile'],
    slots: {
      back: 'The Devotions of Dragonus - Wings',
      weapon: 'The Devotions of Dragonus - Weapon',
      head: 'The Devotions of Dragonus - Head',
      belt: 'The Devotions of Dragonus - Belt',
      shoulder: 'The Devotions of Dragonus - Shoulder',
      arms: 'The Devotions of Dragonus - Arms'
    }
  },
  {
    hero: 'vengefulspirit',
    matchKeywords: ['resurrectionofshen'],
    slots: {
      shoulder: 'The Resurrection of Shen - Wings',
      head: 'The Resurrection of Shen - Head',
      weapon: 'The Resurrection of Shen - Weapon',
      legs: 'The Resurrection of Shen - Legs'
    }
  },
  {
    hero: 'earthshaker',
    matchKeywords: ['planetfall'],
    slots: {
      hero_base: 'Planetfall',
      head: 'Planetfall - Head',
      weapon: 'Planetfall - Weapon',
      arms: 'Planetfall - Bracers',
      belt: 'Planetfall - Belt'
    }
  },
  {
    hero: 'nevermore',
    matchKeywords: ['demoneater'],
    slots: {
      hero_base: 'Demon Eater',
      head: 'Demon Eater - Head',
      shoulder: 'Demon Eater - Shoulders',
      arms: 'Demon Eater - Arms'
    }
  },
  {
    hero: 'terrorblade',
    matchKeywords: ['fractalhorns'],
    slots: {
      hero_base: 'Fractal Horns of Inner Abysm',
      head: 'Fractal Horns of Inner Abysm - Horns'
    }
  },
  {
    hero: 'monkey_king',
    matchKeywords: ['greatsage'],
    slots: {
      hero_base: "Great Sage's Reckoning",
      head: "Great Sage's Reckoning - Head"
    }
  },
  {
    hero: 'ogre_magi',
    matchKeywords: ['flockheart'],
    slots: {
      hero_base: "Flockheart's Gamble",
      head: "Flockheart's Gamble - Head"
    }
  },
  {
    hero: 'pudge',
    matchKeywords: ['feastofabscession', 'abscession'],
    slots: {
      hero_base: 'Feast of Abscession',
      back: 'Feast of Abscession - Back'
    }
  },
  {
    hero: 'juggernaut',
    matchKeywords: ['bladeformlegacy'],
    slots: {
      hero_base: 'Bladeform Legacy',
      head: 'Bladeform Legacy - Mask'
    }
  },
  {
    hero: 'tidehunter',
    matchKeywords: ['megalodon', 'mawofthemegalodon'],
    slots: {
      hero_base: 'Maw of the Megalodon - Base',
      weapon: 'Maw of the Megalodon - Weapon'
    },
    hideBaseSlots: ['arms', 'belt', 'offhand_weapon']
  },
  {
    hero: 'legion_commander',
    matchKeywords: ['vothdomosh'],
    slots: {
      hero_base: 'Blades of Voth Domosh',
      weapon: 'Blades of Voth Domosh - Swords'
    }
  }
]

export const PERSONA_SETS: PersonaDefinition[] = [
  {
    hero: 'antimage',
    matchKeywords: ['disciple', 'wei', 'persona'],
    personaSlots: {
      weapon_persona_1: 'Anti-Mage Persona Weapon',
      offhand_weapon_persona_1: 'Anti-Mage Persona Offhand Weapon',
      armor_persona_1: 'Anti-Mage Persona Armor',
      head_persona_1: 'Anti-Mage Persona Hair'
    },
    hideBaseSlots: ['weapon', 'offhand_weapon', 'armor', 'head', 'shoulder', 'pack', 'arms', 'belt']
  },
  {
    hero: 'pudge',
    matchKeywords: ['toybutcher', 'persona'],
    personaSlots: {
      weapon_persona_1: 'Pudge Persona Weapon',
      offhand_weapon_persona_1: 'Pudge Persona Offhand Weapon',
      armor_persona_1: 'Pudge Persona Costume',
      head_persona_1: 'Pudge Persona Head',
      arms_persona_1: 'Pudge Persona Arms'
    },
    hideBaseSlots: ['weapon', 'offhand_weapon', 'armor', 'head', 'back', 'belt']
  },
  {
    hero: 'crystal_maiden',
    matchKeywords: ['conduitoftheblueheart', 'blueheart', 'persona'],
    personaSlots: {
      head_persona_1: "Crystal Maiden's Persona Mane",
      misc_persona_1: "Crystal Maiden's Persona Crystals",
      tail_persona_1: "Crystal Maiden's Persona Tail",
      armor_persona_1: "Crystal Maiden's Persona Armor"
    },
    hideBaseSlots: ['back', 'head', 'shoulder', 'arms']
  },
  {
    hero: 'phantom_assassin',
    matchKeywords: ['exileunveiled', 'asan', 'persona'],
    personaSlots: {
      head_persona_1: 'Phantom Assassin Persona Head',
      armor_persona_1: 'Phantom Assassin Persona Armor',
      legs_persona_1: 'Phantom Assassin Persona Legs',
      weapon_persona_1: 'Phantom Assassin Persona Weapon'
    },
    hideBaseSlots: ['weapon', 'head', 'shoulder', 'back']
  },
  {
    hero: 'dragon_knight',
    matchKeywords: ['davion', 'persona'],
    personaSlots: {
      head_persona_1: 'Dragon Knight Persona Head',
      armor_persona_1: 'Dragon Knight Persona Armor',
      weapon_persona_1: 'Dragon Knight Persona Weapon',
      shapeshift_persona_1: 'Dragon Knight Persona Dragon Form'
    },
    hideBaseSlots: ['weapon', 'shield', 'head', 'shoulder', 'back']
  },
  {
    hero: 'mirana',
    matchKeywords: ['nightsilver', 'persona'],
    personaSlots: {
      head_persona_1: 'Mirana Persona Head',
      mount_persona_1: 'Mirana Persona Mount',
      armor_persona_1: 'Mirana Persona Armor',
      back_persona_1: 'Mirana Persona Back',
      weapon_persona_1: 'Mirana Persona Weapon'
    },
    hideBaseSlots: ['weapon', 'mount', 'head', 'shoulder', 'quiver']
  },
  {
    hero: 'invoker',
    matchKeywords: ['acolyteofthelostarts', 'lostarts', 'persona'],
    personaSlots: {},
    hideBaseSlots: ['head', 'shoulder', 'back', 'arms']
  }
]

export const NULL_MODEL = 'models/props_nature/prop_null.vmdl'

/**
 * Universal resolver: takes user equipped map and automatically fills
 * in matching Arcana and Persona items while marking obsolete base slots for hiding.
 */
export function resolveEquippedArcanasAndPersonas(equipped: Record<string, Record<string, string>>): {
  resolvedEquipped: Record<string, Record<string, string>>
  slotsToHide: Record<string, Set<string>>
} {
  const resolvedEquipped: Record<string, Record<string, string>> = {}
  const slotsToHide: Record<string, Set<string>> = {}

  for (const [heroTag, slots] of Object.entries(equipped)) {
    if (!slots || typeof slots !== 'object') continue

    const currentSlots: Record<string, string> = { ...slots }
    const cleanHero = normalizeName(heroTag).replace(/[^a-z0-9]/g, '')
    const heroHideSet = new Set<string>()

    // Check for active Arcana
    const activeArcana = ARCANA_SETS.find((a) => {
      const aHero = normalizeName(a.hero).replace(/[^a-z0-9]/g, '')
      if (aHero !== cleanHero && !aHero.includes(cleanHero) && !cleanHero.includes(aHero)) return false
      return Object.values(currentSlots).some((val) => {
        if (typeof val !== 'string') return false
        const normVal = normalizeName(val)
        return a.matchKeywords.some((k) => normVal.includes(k))
      })
    })

    if (activeArcana) {
      for (const [slot, pieceName] of Object.entries(activeArcana.slots)) {
        const cur = currentSlots[slot]
        const isUnsetOrDefault =
          !cur ||
          typeof cur !== 'string' ||
          cur.toLowerCase().includes('official base') ||
          cur.toLowerCase().includes('default') ||
          cur.trim() === ''

        if (isUnsetOrDefault) {
          currentSlots[slot] = pieceName
        }
      }

      if (activeArcana.hideBaseSlots) {
        for (const slot of activeArcana.hideBaseSlots) {
          const cur = currentSlots[slot]
          const isUnsetOrDefault =
            !cur ||
            typeof cur !== 'string' ||
            cur.toLowerCase().includes('official base') ||
            cur.toLowerCase().includes('default') ||
            cur.trim() === ''
          if (isUnsetOrDefault) {
            heroHideSet.add(slot)
          }
        }
      }
    }

    // Check for active Persona
    const activePersona = PERSONA_SETS.find((p) => {
      const pHero = normalizeName(p.hero).replace(/[^a-z0-9]/g, '')
      if (pHero !== cleanHero && !pHero.includes(cleanHero) && !cleanHero.includes(pHero)) return false
      return Object.values(currentSlots).some((val) => {
        if (typeof val !== 'string') return false
        const normVal = normalizeName(val)
        return p.matchKeywords.some((k) => normVal.includes(k))
      })
    })

    if (activePersona) {
      for (const [pSlot, pieceName] of Object.entries(activePersona.personaSlots)) {
        const cur = currentSlots[pSlot]
        const isUnsetOrDefault =
          !cur ||
          typeof cur !== 'string' ||
          cur.toLowerCase().includes('official base') ||
          cur.toLowerCase().includes('default') ||
          cur.trim() === ''
        if (isUnsetOrDefault) {
          currentSlots[pSlot] = pieceName
        }
      }

      for (const baseSlot of activePersona.hideBaseSlots) {
        const cur = currentSlots[baseSlot]
        const isUnsetOrDefault =
          !cur ||
          typeof cur !== 'string' ||
          cur.toLowerCase().includes('official base') ||
          cur.toLowerCase().includes('default') ||
          cur.trim() === ''
        if (isUnsetOrDefault) {
          heroHideSet.add(baseSlot)
        }
      }
    }

    resolvedEquipped[heroTag] = currentSlots
    if (heroHideSet.size > 0) {
      slotsToHide[heroTag] = heroHideSet
    }
  }

  return { resolvedEquipped, slotsToHide }
}

export default resolveEquippedArcanasAndPersonas
