/**
 * Resolves particle conflicts when an overlay occupies a stock `.vpcf_c` path that an
 * explicitly selected wearable also redirects. Replaces the staged particle with the
 * selected wearable's donor effect and unifies the overlay's schema redirect for that hero.
 */

import { readEntry, type VpkIndex, type VpkPackEntry } from '../../dota/vpkService'
import type { AppliedPatch } from '../../modifier/compile'
import type { SchemaIndex } from '../../modifier/schema'
import { applySplices, escapeToken, find, getNode, getString, isNode, parseVdf, type Splice } from '../../modifier/vdf'
import { assetModifiers } from '../../modifier/visuals'
import { readItemsSection } from '../itemsGamePatcher'

const particlePath = /^particles\/.+\.vpcf$/

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
  if (!picks.length || ![...entries.keys()].some((path) => path.endsWith('.vpcf_c'))) return content

  const { blocks } = readItemsSection(content)
  function redirects(id: string) {
    const span = blocks.get(id)
    if (!span) return []
    const { root } = parseVdf(content.slice(span.start, span.end))
    return assetModifiers(getNode(root, 'visuals')).flatMap(({ value }) => {
      if (!isNode(value) || getString(value, 'type') !== 'particle') return []
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
      if (asset === donor || !stock.entries.has(destination) || !entries.has(destination)) continue
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
