export interface PrismaticGem {
  id: string
  name: string
  hex: string
  rgb: [number, number, number]
  colorName: string
  isDefault?: boolean
}

export function hexToRgb(hex: string): string {
  const clean = hex.replace('#', '').trim()
  if (clean.length !== 6) return '255 255 255'
  const r = parseInt(clean.substring(0, 2), 16) || 0
  const g = parseInt(clean.substring(2, 4), 16) || 0
  const b = parseInt(clean.substring(4, 6), 16) || 0
  return `${r} ${g} ${b}`
}

export const PRISMATIC_GEMS: PrismaticGem[] = [
  { id: 'unusual_red', name: 'Red', hex: '#D03D33', rgb: [208, 61, 51], colorName: 'UnusualRed' },
  { id: 'unusual_rubiline', name: 'Rubiline', hex: '#D11FA1', rgb: [209, 31, 161], colorName: 'UnusualRubiline' },
  { id: 'unusual_gold', name: 'Gold', hex: '#CFAB31', rgb: [207, 171, 49], colorName: 'UnusualGold' },
  { id: 'unusual_blue', name: 'Blue', hex: '#0097CE', rgb: [0, 151, 206], colorName: 'UnusualBlue' },
  { id: 'unusual_purple', name: 'Purple', hex: '#8232CF', rgb: [130, 50, 207], colorName: 'UnusualPurple' },
  { id: 'unusual_orange', name: 'Orange', hex: '#D07733', rgb: [208, 119, 51], colorName: 'UnusualOrange' },
  { id: 'unusual_light_green', name: 'Light Green', hex: '#B7CF33', rgb: [183, 207, 51], colorName: 'UnusualLightGreen' },
  { id: 'unusual_deep_blue', name: 'Deep Blue', hex: '#3D68C4', rgb: [61, 104, 196], colorName: 'UnusualDeepBlue' },
  { id: 'unusual_sea_green', name: 'Sea Green', hex: '#4AB78D', rgb: [74, 183, 141], colorName: 'UnusualSeaGreen' },
  { id: 'unusual_verdant_green', name: 'Verdant Green', hex: '#51B350', rgb: [81, 179, 80], colorName: 'UnusualVerdantGreen' },
  { id: 'unusual_deep_green', name: 'Deep Green', hex: '#37864D', rgb: [55, 134, 77], colorName: 'UnusualDeepGreen' },
  { id: 'unusual_bright_purple', name: 'Bright Purple', hex: '#8232ED', rgb: [130, 50, 237], colorName: 'UnusualBrightPurple' },
  { id: 'unusual_bright_green', name: 'Bright Green', hex: '#A1FF59', rgb: [161, 255, 89], colorName: 'UnusualBrightGreen' },
  { id: 'unusual_placid_blue', name: 'Placid Blue', hex: '#94CAD0', rgb: [148, 202, 208], colorName: 'UnusualPlacidBlue' },
  { id: 'unusual_summer_warmth', name: 'Summer Warmth', hex: '#FFEEBC', rgb: [255, 238, 188], colorName: 'UnusualSummerWarmth' },
  { id: 'unusual_defensive_red', name: 'Defensive Red', hex: '#FF4200', rgb: [255, 66, 0], colorName: 'UnusualDefensiveRed' },
  { id: 'unusual_creators_light', name: "Creator's Light", hex: '#DCF2FF', rgb: [220, 242, 255], colorName: 'UnusualCreatorsLight' },
  { id: 'unusual_blossom_red', name: 'Blossom Red', hex: '#D76092', rgb: [215, 96, 146], colorName: 'UnusualBlossomRed' },
  { id: 'unusual_crystalline_blue', name: 'Crystalline Blue', hex: '#1A3D85', rgb: [26, 61, 133], colorName: 'UnusualCrystallineBlue' },
  { id: 'unusual_cursed_black', name: 'Cursed Black', hex: '#060606', rgb: [6, 6, 6], colorName: 'UnusualCursedBlack' },
  { id: 'unusual_plague_grey', name: 'Plague Grey', hex: '#626E5B', rgb: [98, 110, 91], colorName: 'UnusualPlagueGrey' },
  {
    id: 'unusual_international_2012',
    name: 'Champion’s Blue (TI2)',
    hex: '#507DFE',
    rgb: [80, 125, 254],
    colorName: 'UnusualInternational2012'
  },
  {
    id: 'unusual_international_2013',
    name: 'Champion’s Green (TI3)',
    hex: '#15A515',
    rgb: [21, 165, 21],
    colorName: 'UnusualInternational2013'
  },
  { id: 'unusual_midas_gold', name: 'Midas Gold', hex: '#FFCA15', rgb: [255, 202, 21], colorName: 'UnusualMidasGold' },
  { id: 'unusual_earth_green', name: 'Earth Green', hex: '#5AC355', rgb: [90, 195, 85], colorName: 'UnusualEarthGreen' },
  { id: 'unusual_ember_flame', name: 'Ember Flame', hex: '#FFC604', rgb: [255, 198, 4], colorName: 'UnusualEmberFlame' },
  { id: 'unusual_diretide_orange', name: 'Diretide Orange', hex: '#F79D00', rgb: [247, 157, 0], colorName: 'UnusualDiretideOrange' },
  { id: 'unusual_dredge_earth', name: 'Dredge Earth', hex: '#BDB76B', rgb: [189, 183, 107], colorName: 'UnusualDredgeEarth' },
  { id: 'unusual_dungeon_doom', name: 'Dungeon Doom', hex: '#7B68EE', rgb: [123, 104, 238], colorName: 'UnusualDungeonDoom' },
  { id: 'unusual_manns_mint', name: "Mann's Mint", hex: '#BCDDB3', rgb: [188, 221, 179], colorName: 'UnusualMannsMint' },
  { id: 'unusual_business_pants', name: 'Business Pants', hex: '#F0E68C', rgb: [240, 230, 140], colorName: 'UnusualBusinessPants' },
  { id: 'unusual_unhallowed_ground', name: 'Unhallowed Ground', hex: '#808000', rgb: [128, 128, 0], colorName: 'UnusualUnhallowedGround' },
  { id: 'unusual_ship', name: 'Ships in the Night', hex: '#191970', rgb: [25, 25, 112], colorName: 'UnusualShips' },
  { id: 'unusual_miasma', name: 'Miasma', hex: '#C0C0C0', rgb: [192, 192, 192], colorName: 'UnusualMiasma' },
  {
    id: 'unusual_pristine_platinum',
    name: 'Pristine Platinum',
    hex: '#D5E3F5',
    rgb: [213, 227, 245],
    colorName: 'UnusualPristinePlatinum'
  },
  { id: 'unusual_vermilion_renewal', name: 'Vermilion Renewal', hex: '#CA0123', rgb: [202, 1, 35], colorName: 'UnusualVermilionRenewal' },
  {
    id: 'unusual_terrorblade_abysm',
    name: "Reflection's Shade (Default)",
    hex: '#FF3C28',
    rgb: [255, 60, 40],
    colorName: 'UnusualAbysm',
    isDefault: true
  },
  { id: 'unusual_lava_roshan', name: 'Lava Flame', hex: '#FF7832', rgb: [255, 120, 50], colorName: 'UnusualLavaRoshan' },
  { id: 'unusual_ice_roshan', name: 'Frost Glacier', hex: '#32ABDC', rgb: [50, 171, 220], colorName: 'UnusualIceRoshan' },
  { id: 'unusual_plush_shagbark', name: 'Plush Shagbark Pink', hex: '#FFC1DC', rgb: [255, 193, 220], colorName: 'UnusualPlushShagbark' },
  {
    id: 'unusual_international_courier_2014',
    name: 'Champion’s Purple (TI4)',
    hex: '#7F48C3',
    rgb: [127, 72, 195],
    colorName: 'UnusualInternational2014'
  },
  { id: 'unusual_techies_swine', name: 'Explosive Gold (Techies)', hex: '#FFAF00', rgb: [255, 175, 0], colorName: 'UnusualSwine' }
]

export function getGemByHex(hex?: string): PrismaticGem | undefined {
  if (!hex) return undefined
  const norm = hex.toLowerCase().trim()
  return PRISMATIC_GEMS.find((g) => g.hex.toLowerCase() === norm)
}
