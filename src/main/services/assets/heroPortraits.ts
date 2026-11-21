import { applySplices, detectEol, isNode, parseVdf, serializeValue, type Splice } from '../modifier/vdf'

export const HERO_PORTRAITS_PATH = 'scripts/npc/portraits.txt'

export interface HeroPortraitRemap {
  /** Vanilla hero root model path (e.g. `models/heroes/axe/axe.vmdl`). */
  baseModel: string
  /** Cosmetic entity_model path whose camera/lighting block should be copied (e.g. `models/items/axe/ti9_jungle_axe/axe_bare.vmdl`). */
  overrideModel: string
}

function normalizeModelKey(modelPath: string): string {
  return modelPath.replace(/\\/g, '/').toLowerCase()
}

/**
 * Remap in-game HUD portrait entries in Valve's `scripts/npc/portraits.txt` for heroes
 * whose root `.vmdl_c` is replaced on disk (e.g. Axe Unleashed, Arcanas, Personas).
 *
 * Because SkinForge replaces the vanilla root model file on disk for reconnect safety
 * rather than relying on `entity_model` at runtime, Dota 2 looks up the hero's vanilla
 * model path in `portraits.txt`. Copying the cosmetic model's portrait block onto the
 * vanilla model key restores its official camera position, angles, lighting, and activity.
 */
export function remapHeroPortraits(stockText: string, remaps: Iterable<HeroPortraitRemap>): Buffer | null {
  const remapList = [...remaps]
  if (remapList.length === 0) return null

  const stock = parseVdf(stockText)
  if (stock.key.toLowerCase() !== 'portraits') return null

  const entriesByKey = new Map(stock.root.entries.map((entry) => [normalizeModelKey(entry.key), entry]))
  const splices: Splice[] = []
  const additions: string[] = []
  const handledBases = new Set<string>()
  const eol = detectEol(stockText)

  for (const { baseModel, overrideModel } of remapList) {
    const baseKey = normalizeModelKey(baseModel)
    const overrideKey = normalizeModelKey(overrideModel)
    if (!baseKey || !overrideKey || baseKey === overrideKey || handledBases.has(baseKey)) continue

    const source = entriesByKey.get(overrideKey)
    if (!source || !isNode(source.value)) continue
    handledBases.add(baseKey)

    const replacement = stockText.slice(source.valueStart, source.valueEnd)
    const target = entriesByKey.get(baseKey)
    if (!target) {
      additions.push(`\t"${baseModel.replace(/\\/g, '/')}"${eol}\t${replacement}${eol}`)
    } else if (isNode(target.value) && serializeValue(target.value, 1, eol) !== serializeValue(source.value, 1, eol)) {
      splices.push({ start: target.valueStart, end: target.valueEnd, text: replacement })
    }
  }

  if (additions.length) {
    const end = stock.root.end - 1
    splices.push({ start: end, end, text: `${eol}${additions.join('')}` })
  }

  return splices.length ? Buffer.from(applySplices(stockText, splices), 'utf8') : null
}
