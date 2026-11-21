/**
 * Applies the user's explicit custom ability-icon overrides (chosen in the Ability Icons bar).
 * Runs last in the post-compile pipeline so manual user choices override both wearables and overlays.
 */

import type { HeroAbilityIconOverrides } from '../../../../shared/types/abilityIcons'
import { getHeroAbilitySlots, hasAbilityIconTexture, readAbilityIconModifiers } from '../../assets/abilityIconResolver'
import { getAbilityIconManifest } from '../../assets/iconPackService'
import type { VpkIndex } from '../../dota/vpkService'
import { ownerFor, type SchemaIndex } from '../../modifier'
import { applySplices, detectEol, getNode, parseVdf, serializeValue, setEntry, type Splice } from '../../modifier/vdf'
import { mergeAssetModifiers } from '../../modifier/visuals'
import { readItemsSection } from '../itemsGamePatcher'

export function applyAbilityIconOverrides(
  content: string,
  schema: SchemaIndex,
  stock: VpkIndex,
  overrides: HeroAbilityIconOverrides,
  warnings: string[]
): { content: string; targets: string[] } {
  if (!Object.keys(overrides).length) return { content, targets: [] }
  const { blocks } = readItemsSection(content)
  const available = new Set(getAbilityIconManifest().icons)
  const edits: Splice[] = []
  const targets = new Set<string>()
  const eol = detectEol(content)
  for (const [tag, choices] of Object.entries(overrides)) {
    const hero = ownerFor(schema, tag)
    if (!hero || !choices || typeof choices !== 'object') continue
    const abilities = new Set(getHeroAbilitySlots(stock, hero).map(({ id }) => id))
    const valid = new Map<string, string>()
    for (const [ability, icon] of Object.entries(choices)) {
      if (abilities.has(ability) && typeof icon === 'string' && available.has(`spellicons/${icon}`) && hasAbilityIconTexture(stock, icon)) {
        valid.set(ability, icon)
      } else {
        warnings.push(`${tag}/${ability}: the selected ability icon is unavailable in this Dota 2 installation.`)
      }
    }
    if (!valid.size) continue
    const added = [...valid].map(
      ([ability, icon]) => parseVdf(`"asset_modifier" { "type" "ability_icon" "asset" "${ability}" "modifier" "${icon}" }`).root
    )
    for (const item of schema.defaults.get(hero)?.values() ?? []) {
      if (item.heroes.length !== 1 || targets.has(item.id)) continue
      const span = blocks.get(item.id)
      if (!span) continue
      const { root } = parseVdf(content.slice(span.start, span.end))
      const redirects = readAbilityIconModifiers(getNode(root, 'visuals'))
      let changed = false
      for (const redirect of redirects) {
        const icon = valid.get(redirect.ability)
        if (!icon || icon === redirect.icon) continue
        setEntry(redirect.node, 'modifier', icon)
        changed = true
      }
      // Modeled default wearables are the fallback carriers when an ability has no redirect.
      if (item.model) {
        mergeAssetModifiers(root, added)
        changed = true
      }
      if (!changed) continue
      edits.push({ start: span.start, end: span.end, text: serializeValue(root, 2, eol) })
      targets.add(item.id)
    }
  }
  return { content: applySplices(content, edits), targets: [...targets] }
}
