/**
 * Resolves `ability_icon` conflicts between an active overlay (Arcana/Persona) and an
 * explicitly selected wearable. When the overlay declares `preferWearableAbilityIcons` for
 * an ability, the overlay's schema redirect is updated to match the user's chosen wearable.
 */

import type { AppliedPatch } from '../../modifier/compile'
import type { SchemaIndex } from '../../modifier/schema'
import { applySplices, escapeToken, find, getNode, getString, isNode, parseVdf, type Splice } from '../../modifier/vdf'
import { assetModifiers } from '../../modifier/visuals'
import { readItemsSection } from '../itemsGamePatcher'

export function resolveOverlayAbilityIcons(
  content: string,
  schema: SchemaIndex,
  applied: AppliedPatch[],
  overlayTargets: ReadonlySet<string>,
  preferredIcons: ReadonlyMap<string, ReadonlySet<string>>
): string {
  if (!preferredIcons.size) return content

  const picks = applied.filter(
    ({ reason, targetId }) => (reason === 'requested' || reason === 'model-swap') && !overlayTargets.has(targetId)
  )
  if (!picks.length) return content

  const { blocks } = readItemsSection(content)
  function redirects(id: string) {
    const span = blocks.get(id)
    if (!span) return []
    const { root } = parseVdf(content.slice(span.start, span.end))
    return assetModifiers(getNode(root, 'visuals')).flatMap(({ value }) => {
      if (!isNode(value) || getString(value, 'type') !== 'ability_icon') return []
      const ability = getString(value, 'asset')?.toLowerCase()
      const modifier = find(value, 'modifier')
      if (!ability || typeof modifier?.value !== 'string' || !modifier.value) return []
      return [{ ability, icon: modifier.value, start: span.start + modifier.valueStart, end: span.start + modifier.valueEnd }]
    })
  }

  const icons = new Map<string, string | null>()
  for (const { hero, targetId } of picks) {
    for (const { ability, icon } of redirects(targetId)) {
      const key = `${hero}/${ability}`
      const previous = icons.get(key)
      // Leave the overlay rule as-is when selected wearables disagree.
      if (previous !== icon) icons.set(key, previous === undefined ? icon : null)
    }
  }

  const splices: Splice[] = []
  for (const [id, abilities] of preferredIcons) {
    const heroes = schema.items.get(id)?.heroes
    if (heroes?.length !== 1) continue
    for (const { ability, icon, start, end } of redirects(id)) {
      if (!abilities.has(ability)) continue
      const selected = icons.get(`${heroes[0]}/${ability}`)
      if (selected && selected !== icon) splices.push({ start, end, text: escapeToken(selected) })
    }
  }
  return applySplices(content, splices)
}
