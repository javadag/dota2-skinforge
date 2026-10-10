/**
 * Universal Valve Hero Internal Aliases Map
 * Maps Dota 2 cosmetic schema internal hero names to UI tags.
 */
export const HERO_ALIASES: Record<string, string> = {
  zeus: 'zuus',
  windranger: 'windrunner',
  necrophos: 'necrolyte',
  wraith_king: 'skeleton_king',
  'wraith king': 'skeleton_king',
  clockwerk: 'rattletrap',
  timbersaw: 'shredder',
  natures_prophet: 'furion',
  "nature's_prophet": 'furion',
  "nature's prophet": 'furion',
  underlord: 'abyssal_underlord',
  io: 'wisp',
  magnus: 'magnataur',
  shadow_fiend: 'nevermore',
  'shadow fiend': 'nevermore',
  doom: 'doom_bringer',
  lifestealer: 'life_stealer',
  treant_protector: 'treant',
  'treant protector': 'treant',
  queen_of_pain: 'queenofpain',
  'queen of pain': 'queenofpain',
  outworld_destroyer: 'obsidian_destroyer',
  'outworld destroyer': 'obsidian_destroyer',
  outworld_devourer: 'obsidian_destroyer',
  'outworld devourer': 'obsidian_destroyer',
  vengeful_spirit: 'vengefulspirit',
  'vengeful spirit': 'vengefulspirit',
  centaur_warrunner: 'centaur',
  'centaur warrunner': 'centaur',
  'anti-mage': 'antimage',
  antimage: 'antimage',
  music: 'music_packs',
  music_packs: 'music_packs',
  official_music_packs: 'music_packs',
  towers: 'towers',
  tower: 'towers',
  creeps: 'creeps',
  couriers: 'courier',
  courier: 'courier',
  ward: 'wards',
  wards: 'wards',
  loading: 'loadscreens',
  loading_screen: 'loadscreens',
  loadscreens: 'loadscreens',
  hud: 'huds',
  huds: 'huds',
  cursor_pack: 'cursor',
  cursor: 'cursor',
  maps: 'terrain',
  terrain: 'terrain',
  announcer: 'announcers',
  announcers: 'announcers',
  roshan: 'roshan'
}

export function getCanonicalHero(heroTag?: string): string {
  if (!heroTag) return ''
  const raw = heroTag.toLowerCase().trim()
  const norm = raw.replace(/\s+/g, '_').replace(/-/g, '_')
  const clean = raw.replace(/[^a-z0-9]/g, '')
  return HERO_ALIASES[raw] || HERO_ALIASES[norm] || HERO_ALIASES[clean] || norm
}
