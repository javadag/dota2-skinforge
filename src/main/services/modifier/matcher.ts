/**
 * Cosmetic & Default Item Matching Heuristics
 */

import { getCanonicalHero } from '../../../shared/constants/heroAliases'
import type { CosmeticItemEntry, DefaultItemEntry } from './vdfParser'

export function normalizeName(str?: string | null): string {
  if (!str) return ''
  return str
    .toLowerCase()
    .replace(/\([^)]*\)/g, '')
    .replace(/[^a-z0-9]/g, '')
    .trim()
}

export function normalizeSlot(slot?: string | null): string {
  if (!slot) return ''
  const s = slot.toLowerCase().replace(/[^a-z0-9]/g, '')
  if (s === 'weapon' || s === 'primary') return 'weapon'
  if (s === 'offhand' || s === 'leftweapon') return 'offhand_weapon'
  if (s === 'herobase') return 'hero_base'
  return s
}

export function findBestCosmetic(
  cosmetics: CosmeticItemEntry[],
  heroTag: string,
  _slotId: string,
  itemName: string
): CosmeticItemEntry | null {
  const normTarget = normalizeName(itemName)
  if (!normTarget) return null

  const canonical = getCanonicalHero(heroTag)
  const cleanHero = canonical.replace(/[^a-z0-9]/g, '')

  // 1. Exact match on hero & normalized name
  let found = cosmetics.find((c) => c.norm === normTarget && (!c.hero || c.hero.replace(/[^a-z0-9]/g, '') === cleanHero))
  if (found) return found

  // 2. Starts with / includes match on hero & name
  found = cosmetics.find(
    (c) =>
      (c.norm.startsWith(normTarget) || normTarget.startsWith(c.norm) || c.norm.includes(normTarget)) &&
      (!c.hero || c.hero.replace(/[^a-z0-9]/g, '') === cleanHero)
  )
  if (found) return found

  // 3. Fallback to any hero match
  found = cosmetics.find((c) => c.norm === normTarget || c.norm.startsWith(normTarget) || normTarget.startsWith(c.norm))
  return found || null
}

export function findDefaultItem(defaultItems: DefaultItemEntry[], heroTag: string, slotId: string): DefaultItemEntry | null {
  const canonical = getCanonicalHero(heroTag)
  const cleanHero = canonical.replace(/[^a-z0-9]/g, '')
  const normSlot = normalizeSlot(slotId)

  const heroDefs = defaultItems.filter((d) => d.hero.replace(/[^a-z0-9]/g, '') === cleanHero || d.hero === 'all')
  if (heroDefs.length === 0) return null

  // 1. Exact slot match
  let matched = heroDefs.find((d) => normalizeSlot(d.slot) === normSlot)
  if (matched) return matched

  // 2. Name contains slot keyword fallback
  matched = heroDefs.find((d) => {
    const n = d.name.toLowerCase()
    if (normSlot === 'weapon') {
      if (cleanHero === 'tidehunter' && (d.id === '36' || n.includes('anchor'))) return true
      if (
        n.includes('weapon') ||
        n.includes('glaive') ||
        n.includes('axe') ||
        n.includes('hook') ||
        n.includes('blade') ||
        n.includes('sword') ||
        n.includes('bow') ||
        n.includes('gun') ||
        n.includes('staff') ||
        n.includes('dagger') ||
        n.includes('anchor') ||
        n.includes('mace') ||
        n.includes('flail') ||
        n.includes('cudgel') ||
        n.includes('spear') ||
        n.includes('hammer') ||
        n.includes('totem') ||
        n.includes('club')
      )
        return true
    }
    if (
      normSlot === 'mount' &&
      (n.includes('mount') || n.includes('bat') || n.includes('steed') || n.includes('beast') || n.includes('chameleon'))
    )
      return true
    if (
      normSlot === 'belt' &&
      (n.includes('belt') || n.includes('waist') || n.includes('sash') || n.includes('molotov') || n.includes('girth'))
    )
      return true
    if (
      normSlot === 'head' &&
      (n.includes('head') ||
        n.includes('hair') ||
        n.includes('mask') ||
        n.includes('helm') ||
        n.includes('toupee') ||
        n.includes('crown') ||
        n.includes('bandana') ||
        n.includes('hood'))
    )
      return true
    if (
      normSlot === 'back' &&
      (n.includes('back') || n.includes('cape') || n.includes('wings') || n.includes('quiver') || n.includes('cloak'))
    )
      return true
    if (normSlot === 'arms' && (n.includes('arm') || n.includes('bracer') || n.includes('glove') || n.includes('wrist'))) return true
    if (normSlot === 'shoulder' && (n.includes('shoulder') || n.includes('pauldron') || n.includes('spaulder'))) return true
    if (
      normSlot === 'armor' &&
      (n.includes('armor') ||
        n.includes('robe') ||
        n.includes('costume') ||
        n.includes('apron') ||
        n.includes('tunic') ||
        n.includes('body'))
    )
      return true
    if (normSlot === 'offhand' || normSlot === 'offhand_weapon') {
      if (
        n.includes('offhand') ||
        n.includes('shield') ||
        n.includes('cleaver') ||
        n.includes('buckler') ||
        n.includes('fish') ||
        n.includes('lunch')
      )
        return true
    }
    if (normSlot === 'tail' && n.includes('tail')) return true
    if (normSlot === 'legs' && (n.includes('legs') || n.includes('boots') || n.includes('feet') || n.includes('hakama'))) return true
    if (normSlot === 'misc' && (n.includes('misc') || n.includes('quiver') || n.includes('special'))) return true
    if (normSlot === 'taunt' && n.includes('taunt')) return true
    if (normSlot === 'persona_selector' && (n.includes('persona') || n.includes('base'))) return true
    return false
  })

  return matched || null
}
