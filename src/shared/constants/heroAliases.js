/**
 * Universal Valve Hero Internal Aliases Map
 * Maps Dota 2 cosmetic schema internal hero names to UI tags.
 */
const HERO_ALIASES = {
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
};

function getCanonicalHero(heroTag) {
  if (!heroTag) return '';
  const raw = heroTag.toLowerCase().trim();
  const norm = raw.replace(/\s+/g, '_').replace(/-/g, '_');
  const clean = raw.replace(/[^a-z0-9]/g, '');
  return HERO_ALIASES[raw] || HERO_ALIASES[norm] || HERO_ALIASES[clean] || norm;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { HERO_ALIASES, getCanonicalHero };
}
