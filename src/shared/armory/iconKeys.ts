/**
 * Collects the `img` paths that `getItemImage` resolves through the
 * `skinforge-icon://` protocol. Kept in one place so the icon pack build and
 * the runtime resolver cannot drift apart.
 */

const ICON_PREFIX = /^(econ|loadingscreens|compendium|teamfancontent|talentcontent|events|stickers|materials|spellicons)\//
const WINDOWS_DEVICE = /(?:^|\/)(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:[./]|$)/i

// `img` is an item/set icon; `empty_img` is the default base-model texture an
// empty slot renders. Both resolve through the skinforge-icon:// protocol.
const ICON_KEYS = new Set(['img', 'empty_img'])

// These schema paths have no matching texture in Valve's VPK. Use the base
// texture where available, or let the renderer display its item or slot art.
const ICON_FALLBACKS: Record<string, string | null> = {
  'econ/items/keeper_of_the_light/cradle_of_lights_mount/cradle_of_lights_mount_style1':
    'econ/items/keeper_of_the_light/cradle_of_lights_mount/cradle_of_lights_mount',
  'econ/items/medusa/emerald_ocean_tail_lvl_02/emerald_ocean_tail_lvl_021':
    'econ/items/medusa/emerald_ocean_tail_lvl_02/emerald_ocean_tail_lvl_02',
  'econ/items/mirana/mirana_dark_carnival/mirana_dark_carnival_mount_style1':
    'econ/items/mirana/mirana_dark_carnival/mirana_dark_carnival_mount',
  'econ/items/mirana/sukumo_the_moon_cloud/tsukumo_the_moon_cloud': null,
  'econ/items/mirana/sukumo_the_moon_cloud_2/tsukumo_the_moon_cloud_2': null,
  'econ/items/phantom_assassin/armor_reprisal_weapon/armor_reprisal_weapon': null,
  'econ/items/primal_beast/frostivus_pb/frostivus_pb_head_style1': 'econ/items/primal_beast/frostivus_pb/frostivus_pb_head',
  'econ/items/pudge_cute/pudgette_arms/pudgette_arms': null,
  'econ/items/rattletrap/clockwerk_ti10_immortal_weapon/clockwerk_ti10_immortal_weapon1':
    'econ/items/rattletrap/clockwerk_ti10_immortal_weapon/clockwerk_ti10_immortal_weapon',
  'econ/items/witchdoctor/teller_of_the_auspice_weapon/teller_of_the_auspice_weapon_style1':
    'econ/items/witchdoctor/teller_of_the_auspice_weapon/teller_of_the_auspice_weapon',
  'econ/leagues/subscriptions_i_league_season_2': null
}

export function getIconFallback(key: string): string | null | undefined {
  return Object.hasOwn(ICON_FALLBACKS, key) ? ICON_FALLBACKS[key] : undefined
}

export function getIconKey(value: string): string | null {
  const key = value.trim().replace(/\.(png|vtex_c|webp)$/i, '')
  return ICON_PREFIX.test(key) && /^[\w-]+(?:\/[\w.-]*[\w-])+$/.test(key) && !WINDOWS_DEVICE.test(key) ? key : null
}

export function normalizeIconPath(uri: string): string | null {
  if (!uri.startsWith('skinforge-icon://')) return null
  const key = getIconKey(uri.slice('skinforge-icon://'.length).split(/[?#]/, 1)[0])
  return key === null ? null : `${key}.webp`
}

/** Recursively collects unique icon paths from any armory/style data tree. */
export function collectIconKeys(node: unknown, out = new Set<string>()): Set<string> {
  if (!node || typeof node !== 'object') return out
  if (Array.isArray(node)) {
    for (const child of node) collectIconKeys(child, out)
    return out
  }
  for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
    if (ICON_KEYS.has(key) && typeof value === 'string') {
      const img = getIconKey(value)
      if (img) out.add(img)
    } else if (value && typeof value === 'object') {
      collectIconKeys(value, out)
    }
  }
  return out
}
