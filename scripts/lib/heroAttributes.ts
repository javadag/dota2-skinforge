/**
 * Primary attributes, read from the installed game.
 *
 * `items_game.txt` carries no attribute data at all: the game keeps `AttributePrimary` in
 * each hero's own file under `scripts/npc/heroes/`. Reading it here is what lets the armory
 * carry the attribute instead of a hand-maintained map — and it is the only source that
 * tracks patches, which is exactly where the old map drifted (7 heroes had no entry and
 * ~16 disagreed with the game).
 *
 * The game spells the four values its own way; `DOTA_ATTRIBUTE_ALL` is the universal
 * attribute ("all three attributes gain"), which is also why it needs a mapping table.
 */
import path from 'path'

import type { HeroAttribute } from '../../src/shared/constants/attributes'
import { detectDotaPath } from '../../src/main/services/dotaPathService'
import { getNode, getString, parseVdf } from '../../src/main/services/modifier/vdf'
import { getOrLoadVpkIndex } from '../../src/main/services/vpkService'
import { readEntry } from '../../src/main/services/vpkIndex'

const PRIMARY_BY_TOKEN: Record<string, HeroAttribute> = {
  DOTA_ATTRIBUTE_STRENGTH: 'str',
  DOTA_ATTRIBUTE_AGILITY: 'agi',
  DOTA_ATTRIBUTE_INTELLECT: 'int',
  DOTA_ATTRIBUTE_ALL: 'uni'
}

/** The attribute a hero file declares, or undefined when it declares nothing we know. */
export function attributeFromHeroFile(text: string, internalName: string): HeroAttribute | undefined {
  const doc = parseVdf(text, {})
  const hero = getNode(doc.root, internalName) ?? getNode(getNode(doc.root, 'DOTAHeroes'), internalName)
  if (!hero) return undefined
  const token = getString(hero, 'AttributePrimary')
  return token ? PRIMARY_BY_TOKEN[token] : undefined
}

/**
 * Attributes for the given heroes, keyed by their canonical (schema) name.
 *
 * Reads in memory — no temp files — and returns an empty map when no game install can be
 * found, so callers keep whatever they already had instead of failing the run.
 */
export function loadHeroAttributes(canonicalNames: Iterable<string>): Map<string, HeroAttribute> {
  const out = new Map<string, HeroAttribute>()
  const gameDir = detectDotaPath()
  if (!gameDir) return out

  let index: ReturnType<typeof getOrLoadVpkIndex>
  try {
    index = getOrLoadVpkIndex(path.join(gameDir, 'dota', 'pak01_dir.vpk'))
  } catch {
    return out
  }

  for (const canonical of canonicalNames) {
    if (out.has(canonical)) continue
    const bytes = readEntry(index, `scripts/npc/heroes/npc_dota_hero_${canonical}.txt`)
    if (!bytes) continue
    const attribute = attributeFromHeroFile(bytes.toString('utf8'), `npc_dota_hero_${canonical}`)
    if (attribute) out.set(canonical, attribute)
  }
  return out
}
