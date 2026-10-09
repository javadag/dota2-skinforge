// Hero Attributes Map & Attribute Utility Helpers
const HERO_ATTRIBUTES = {
  // Strength
  'abaddon': 'str', 'alchemist': 'str', 'axe': 'str', 'beastmaster': 'str',
  'brewmaster': 'str', 'bristleback': 'str', 'centaur_warrunner': 'str', 'centaur': 'str',
  'chaos_knight': 'str', 'clockwerk': 'str', 'dawnbreaker': 'str', 'doom': 'str',
  'dragon_knight': 'str', 'earth_spirit': 'str', 'earthshaker': 'str', 'elder_titan': 'str',
  'huskar': 'str', 'kunkka': 'str', 'legion_commander': 'str', 'lifestealer': 'str',
  'lycan': 'str', 'magnus': 'str', 'marci': 'str', 'mars': 'str', 'night_stalker': 'str',
  'omniknight': 'str', 'primal_beast': 'str', 'pudge': 'str', 'slardar': 'str',
  'spirit_breaker': 'str', 'sven': 'str', 'tidehunter': 'str', 'timbersaw': 'str',
  'tiny': 'str', 'treant_protector': 'str', 'tusk': 'str', 'underlord': 'str',
  'undying': 'str', 'wraith_king': 'str',

  // Agility
  'antimage': 'agi', 'anti-mage': 'agi', 'arc_warden': 'agi', 'bloodseeker': 'agi',
  'bounty_hunter': 'agi', 'clinkz': 'agi', 'drow_ranger': 'agi', 'ember_spirit': 'agi',
  'faceless_void': 'agi', 'gyrocopter': 'agi', 'hoodwink': 'agi', 'juggernaut': 'agi',
  'luna': 'agi', 'medusa': 'agi', 'meepo': 'agi', 'monkey_king': 'agi', 'morphling': 'agi',
  'naga_siren': 'agi', 'phantom_assassin': 'agi', 'phantom_lancer': 'agi', 'razor': 'agi',
  'riki': 'agi', 'shadow_fiend': 'agi', 'slark': 'agi', 'sniper': 'agi', 'spectre': 'agi',
  'terrorblade': 'agi', 'troll_warlord': 'agi', 'ursa': 'agi', 'viper': 'agi', 'weaver': 'agi',

  // Intelligence
  'ancient_apparition': 'int', 'crystal_maiden': 'int', 'death_prophet': 'int',
  'disruptor': 'int', 'enchantress': 'int', 'grimstroke': 'int', 'invoker': 'int',
  'jakiro': 'int', 'keeper_of_the_light': 'int', 'leshrac': 'int', 'lich': 'int',
  'lina': 'int', 'lion': 'int', 'muerta': 'int', 'necrophos': 'int', 'oracle': 'int',
  'outworld_destroyer': 'int', 'puck': 'int', 'pugna': 'int', 'queenofpain': 'int',
  'queen_of_pain': 'int', 'rubick': 'int', 'shadow_demon': 'int', 'shadow_shaman': 'int',
  'silencer': 'int', 'skywrath_mage': 'int', 'storm_spirit': 'int', 'tinker': 'int',
  'warlock': 'int', 'witch_doctor': 'int', 'zeus': 'int',

  // Universal
  'bane': 'uni', 'batrider': 'uni', 'broodmother': 'uni', 'chen': 'uni',
  'dark_seer': 'uni', 'dark_willow': 'uni', 'dazzle': 'uni', 'enigma': 'uni',
  'io': 'uni', 'lone_druid': 'uni', 'mirana': 'uni', 'nyx_assassin': 'uni',
  'pangolier': 'uni', 'phoenix': 'uni', 'sand_king': 'uni', 'snapfire': 'uni',
  'techies': 'uni', 'vengefulspirit': 'uni', 'vengeful_spirit': 'uni',
  'venomancer': 'uni', 'visage': 'uni', 'void_spirit': 'uni', 'windranger': 'uni',
  'winter_wyvern': 'uni'
};

function getHeroAttribute(tag) {
  if (!tag) return 'str';
  const key = tag.toLowerCase().replace(/\s+/g, '_');
  return HERO_ATTRIBUTES[key] || 'str';
}

function getAttrLabel(attr) {
  switch (attr) {
    case 'str': return 'Strength';
    case 'agi': return 'Agility';
    case 'int': return 'Intelligence';
    case 'uni': return 'Universal';
    default: return 'Strength';
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { HERO_ATTRIBUTES, getHeroAttribute, getAttrLabel };
}
