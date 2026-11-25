/**
 * Stages donor `.vpcf_c` files over stock hero ability/projectile particle paths for
 * explicitly selected wearables, and resolves conflicts when an overlay also occupies
 * or redirects the same stock `.vpcf_c` path.
 *
 * Why file staging is needed in addition to `items_game.txt` `type: "particle"` entries:
 * Dota 2's server resolves many ability effects and projectiles (e.g. tracking/linear
 * projectiles and server-spawned ability particles) against its own stock `items_game.txt`
 * and sends the stock `.vpcf` path to the client, bypassing client-side `asset_modifier`
 * substitution. Staging the selected wearable's donor `.vpcf_c` at the hero's stock path
 * ensures both client- and server-resolved ability effects render in-game.
 */

import { readEntry, type VpkIndex, type VpkPackEntry } from '../../dota/vpkService'
import type { AppliedPatch } from '../../modifier/compile'
import type { SchemaIndex } from '../../modifier/schema'
import { applySplices, escapeToken, find, getNode, getString, isNode, parseVdf, type Splice } from '../../modifier/vdf'
import { assetModifiers } from '../../modifier/visuals'
import { readItemsSection } from '../itemsGamePatcher'

const particlePath = /^particles\/.+\.vpcf$/
const heroStockParticlePath = /^particles\/units\/heroes\/.+\.vpcf$/

export function resolveOverlayParticleConflicts(
  content: string,
  schema: SchemaIndex,
  applied: AppliedPatch[],
  overlayTargets: ReadonlySet<string>,
  entries: Map<string, VpkPackEntry>,
  stock: VpkIndex,
  warnings: string[]
): string {
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
      if (!isNode(value) || getString(value, 'type') !== 'particle') return []
      if (getString(value, 'replacement_type')?.toUpperCase() === 'PARTICLE_REPLACE_NONE') return []
      if (getString(value, 'criteria') !== undefined) return []
      const asset = getString(value, 'asset')?.toLowerCase()
      const modifier = find(value, 'modifier')
      if (!asset || !particlePath.test(asset) || typeof modifier?.value !== 'string') return []
      const donor = modifier.value.toLowerCase()
      if (!particlePath.test(donor)) return []
      return [{ asset, donor, start: span.start + modifier.valueStart, end: span.start + modifier.valueEnd }]
    })
  }

  const candidates = new Map<string, Array<{ hero: string; donor: string }>>()
  for (const pick of picks) {
    for (const { asset, donor } of redirects(pick.targetId)) {
      const destination = `${asset}_c`
      if (asset === donor || !stock.entries.has(destination)) continue
      // Stage when an overlay already occupies this path (conflict resolution) or when
      // the target is a hero-specific stock particle (`particles/units/heroes/...`).
      // Skip shared non-hero paths (e.g. `particles/items_fx/...`) unless an overlay
      // already claimed them, so one hero's cosmetic does not alter global item effects.
      if (!entries.has(destination) && !heroStockParticlePath.test(asset)) continue
      const claims = candidates.get(asset) ?? []
      claims.push({ hero: pick.hero, donor })
      candidates.set(asset, claims)
    }
  }

  const replacements = new Map<string, VpkPackEntry>()
  const winners = new Map<string, { donor: string; heroes: Set<string> }>()
  for (const [asset, claims] of candidates) {
    const { donor } = claims[0]
    if (claims.some((claim) => claim.donor !== donor)) {
      warnings.push(`Selected cosmetics disagree on the particle replacement for ${asset}.`)
      continue
    }
    const source = entries.get(`${donor}_c`)?.source ?? readEntry(stock, `${donor}_c`)
    if (!source) {
      warnings.push(`Missing particle ${donor} for ${asset}.`)
      continue
    }
    const vpkPath = `${asset}_c`
    replacements.set(vpkPath, { vpkPath, source })
    winners.set(asset, { donor, heroes: new Set(claims.map(({ hero }) => hero)) })
  }
  if (!winners.size) return content

  // Replace the file at the path the overlay already occupies and unify the overlay's
  // schema redirects for that hero, so either lookup displays the selected effect.
  const splices: Splice[] = []
  for (const id of overlayTargets) {
    const heroes = schema.items.get(id)?.heroes
    if (heroes?.length !== 1) continue
    for (const redirect of redirects(id)) {
      const winner = winners.get(redirect.asset)
      if (winner?.heroes.has(heroes[0]) && winner.donor !== redirect.donor) {
        splices.push({ start: redirect.start, end: redirect.end, text: escapeToken(winner.donor) })
      }
    }
  }
  for (const [path, replacement] of replacements) entries.set(path, replacement)
  return applySplices(content, splices)
}
