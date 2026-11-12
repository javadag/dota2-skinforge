/**
 * Collects the `img` paths that `getItemImage` resolves through the
 * `skinforge-icon://` protocol. Kept in one place so the icon pack build and
 * the runtime resolver cannot drift apart.
 */

const ICON_PREFIX = /^(econ|loadingscreens|compendium|teamfancontent|talentcontent|events|stickers|materials)\//

// `img` is an item/set icon; `empty_img` is the default base-model texture an
// empty slot renders. Both resolve through the skinforge-icon:// protocol.
const ICON_KEYS = new Set(['img', 'empty_img'])

/** Maps a `skinforge-icon://` URL to the `.webp` path stored in cache and packs. */
export function normalizeIconPath(uri: string): string {
  let clean = uri.replace(/^skinforge-icon:\/\/+/, '')
  clean = clean.split('?')[0].split('#')[0]
  if (clean.endsWith('.png') || clean.endsWith('.vtex_c')) {
    clean = clean.replace(/\.(png|vtex_c)$/i, '.webp')
  }
  if (!clean.endsWith('.webp')) {
    clean = `${clean}.webp`
  }
  return clean
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
      const img = value.trim().replace(/\.(png|vtex_c)$/i, '')
      if (ICON_PREFIX.test(img)) out.add(img)
    } else if (value && typeof value === 'object') {
      collectIconKeys(value, out)
    }
  }
  return out
}
