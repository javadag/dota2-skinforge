import { getCanonicalHero } from '../../../shared/constants/heroAliases'
import { applySplices, detectEol, isNode, parseVdf, serializeValue, type Splice } from '../modifier/vdf'

export const LOADOUT_PORTRAITS_PATH = 'scripts/npc/portraits_full_body_loadout.txt'

const extraPortraits: Record<string, string[]> = {
  broodmother: ['npc_dota_broodmother_spiderling_persona-1'],
  dragon_knight: ['models/heroes/dragon_knight/dragon_knight_dragon.vmdl'],
  shadow_shaman: ['npc_dota_shadow_shaman_ward']
}

/** Keep Valve's config and replace only the preview blocks for the active overlays. */
export function mergeLoadoutPortraits(stockText: string, bundledText: string, heroes: Iterable<string>): Buffer | null {
  const stock = parseVdf(stockText)
  const bundled = parseVdf(bundledText)
  const rootKey = 'dotafullbodyloadoutportraitinfo'
  if (stock.key.toLowerCase() !== rootKey || bundled.key.toLowerCase() !== rootKey) return null

  const selectedKeys = new Set<string>()
  for (const tag of heroes) {
    const hero = getCanonicalHero(tag)
    selectedKeys.add(`npc_dota_hero_${hero}`)
    for (const key of extraPortraits[hero] ?? []) selectedKeys.add(key)
  }

  const stockEntries = new Map(stock.root.entries.map((entry) => [entry.key.toLowerCase(), entry]))
  const splices: Splice[] = []
  const additions: string[] = []
  const eol = detectEol(stockText)
  for (const entry of bundled.root.entries) {
    const key = entry.key.toLowerCase()
    if (!isNode(entry.value) || !selectedKeys.delete(key)) continue

    const replacement = bundledText.slice(entry.valueStart, entry.valueEnd)
    const original = stockEntries.get(key)
    if (!original) {
      additions.push(`\t${bundledText.slice(entry.keyStart, entry.valueEnd)}${eol}`)
    } else if (serializeValue(original.value, 1, eol) !== serializeValue(entry.value, 1, eol)) {
      splices.push({ start: original.valueStart, end: original.valueEnd, text: replacement })
    }
  }

  if (additions.length) {
    const end = stock.root.end - 1
    splices.push({ start: end, end, text: `${eol}${additions.join('')}` })
  }
  return splices.length ? Buffer.from(applySplices(stockText, splices), 'utf8') : null
}
