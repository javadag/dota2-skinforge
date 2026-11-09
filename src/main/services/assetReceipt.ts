/**
 * Item asset receipt.
 *
 * For one cosmetic, work out every file the game would have to load to draw it, by
 * following the item's own declarations and then following the files themselves:
 *
 *   item block -> model -> its materials -> their textures
 *              -> effect entries -> their particle files -> their child particles + materials
 *
 * This is the answer to "what does this item actually need", computed from the game's data
 * instead of a hand-written list. It is read-only: it never changes a pack.
 */

import { baseModelForHero } from './modifier/heroBaseModels'
import { buildSchema, defaultFor, type SchemaIndex, type SchemaItem } from './modifier/schema'
import { getNode, getString, isNode, materializeDeep } from './modifier/vdf'
import { assetModifiers } from './modifier/visuals'
import { readEntry, type VpkIndex } from './vpkIndex'

export interface AssetFile {
  /** Path inside the pack. */
  dest: string
  /** Where the bytes come from in Valve's archive, or null when nothing provides them. */
  source: string | null
  kind: 'model' | 'effect' | 'material' | 'texture' | 'sound' | 'soundevent' | 'snapshot'
  /** What pulled it in. */
  via: string
}

export interface SpawnEffect {
  modifier: string
  present: boolean
}

export interface AssetReceipt {
  item: { id: string; name: string; hero: string; slot: string }
  target: { id: string; name: string; model: string | null }
  /**
   * How this item has to reach the game.
   *
   * `swap`     its own model exists in the game; copy it onto the slot path.
   * `prepared` it swaps the hero's whole body, so the model has to be authored (mesh merged
   *            onto the hero's skeleton, with the item's own animations). Nothing in the
   *            game can be copied into place, and a straight copy animates as a T-pose.
   * `data`     no model at all; item data only.
   */
  kind: 'swap' | 'prepared' | 'data'
  files: AssetFile[]
  /** Effects that create something new, so they have no vanilla file to replace. */
  spawns: SpawnEffect[]
  missing: string[]
}

const ASSET_REF = /[a-z0-9_][a-z0-9_./-]{5,}\.(?:vmdl|vmat|vtex|vpcf|vsnd|vsnap|vsndevts)/g

function kindOf(p: string): AssetFile['kind'] {
  if (p.endsWith('.vmdl')) return 'model'
  if (p.endsWith('.vpcf')) return 'effect'
  if (p.endsWith('.vmat')) return 'material'
  if (p.endsWith('.vtex')) return 'texture'
  if (p.endsWith('.vsnd')) return 'sound'
  if (p.endsWith('.vsndevts')) return 'soundevent'
  return 'snapshot'
}

/** Every asset path mentioned inside a compiled file. */
function refsInside(bytes: Buffer): string[] {
  const text = bytes.toString('latin1')
  const out = new Set<string>()
  for (const m of text.matchAll(ASSET_REF)) {
    const ref = m[0].replace(/^[^a-z0-9]+/, '')
    if (ref.startsWith('dota_addons/') || ref.startsWith('#')) continue
    if (!/^(materials|models|particles|sounds|soundevents)\//.test(ref)) continue
    // `.vsnap` only lives under particles/; anything else is a mis-joined string.
    if (ref.endsWith('.vsnap') && !ref.startsWith('particles/')) continue
    out.add(ref)
  }
  return [...out]
}

export interface ReceiptOptions {
  index?: VpkIndex
  indexes?: VpkIndex[]
  /** Cache of archive lookups, so a whole build reuses one pass. */
  cache?: Map<string, Buffer | null>
}

function readerFor(options: ReceiptOptions) {
  const cache = options.cache ?? new Map<string, Buffer | null>()
  const indices: VpkIndex[] = [...(options.indexes ?? []), ...(options.index ? [options.index] : [])]
  return (rel: string): Buffer | null => {
    const clean = rel.replace(/\\/g, '/')
    if (cache.has(clean)) return cache.get(clean) ?? null
    let found: Buffer | null = null
    for (const candidate of clean.endsWith('_c') ? [clean] : [`${clean}_c`, clean]) {
      for (const idx of indices) {
        const bytes = readEntry(idx, candidate)
        if (bytes) {
          found = bytes
          break
        }
      }
      if (found) break
    }
    cache.set(clean, found)
    return found
  }
}

export function receiptFor(schemaText: string, itemId: string, options: ReceiptOptions, prebuilt?: SchemaIndex): AssetReceipt | null {
  const schema = prebuilt ?? buildSchema(schemaText)
  const item: SchemaItem | undefined = schema.items.get(itemId)
  if (!item) return null

  const readValveFile = readerFor(options)
  const hero = item.heroes[0] ?? ''
  const slot = item.resolvedSlot || item.slot
  const target = hero && slot ? defaultFor(schema, hero, slot) : undefined

  const node = item.entry.value
  if (typeof node === 'string') return null
  materializeDeep(schemaText, node)
  const visuals = getNode(node, 'visuals')

  const files = new Map<string, AssetFile>()
  const spawns: SpawnEffect[] = []

  const follow = (start: string, depth: number): void => {
    if (depth < 0) return
    const bytes = readValveFile(start)
    if (!bytes) return
    for (const ref of refsInside(bytes)) {
      if (files.has(ref)) continue
      files.set(ref, { dest: ref, source: readValveFile(ref) ? ref : null, kind: kindOf(ref), via: start })
      follow(ref, depth - 1)
    }
  }

  const vanillaModel = target ? (target.model ?? null) : null
  const cosmeticModel = item.model ?? null
  if (cosmeticModel) {
    const dest = vanillaModel && vanillaModel !== cosmeticModel ? vanillaModel : cosmeticModel
    files.set(dest, { dest, source: readValveFile(cosmeticModel) ? cosmeticModel : null, kind: 'model', via: 'model_player' })
    follow(cosmeticModel, 2)
  }

  let bodySwap = false
  if (slot === 'hero_base') {
    // An arcana that changes the body through a model skin still needs an authored model:
    // the skin selects a mesh variant, but the arcana's animations and weapon attachment
    // are not in the game's base model. Verified in game — skin 1 alone gives the right
    // look in the armory and the default stance with a detached weapon in a match.
    if (visuals && !visuals.opaque && assetModifiers(visuals).some((e) => isNode(e.value) && getString(e.value, 'type') === 'model_skin')) {
      bodySwap = true
    }
  }

  if (visuals && !visuals.opaque) {
    for (const entry of assetModifiers(visuals)) {
      if (!isNode(entry.value)) continue
      const modifier = getString(entry.value, 'modifier')
      if (!modifier || !/\.(vpcf|vsnd|vsndevts|vsnap|vmdl)$/.test(modifier)) continue
      const asset = getString(entry.value, 'asset')
      const type = getString(entry.value, 'type') ?? ''

      // A body swap: the modifier is the arcana body, delivered at the hero's own model path.
      if (type === 'entity_model' && asset?.startsWith('npc_dota_hero_')) {
        const dest = baseModelForHero(asset.slice('npc_dota_hero_'.length))
        if (modifier !== dest) bodySwap = true
        if (!files.has(dest)) {
          files.set(dest, { dest, source: readValveFile(modifier) ? modifier : null, kind: 'model', via: modifier })
          follow(modifier, 2)
        }
        continue
      }

      // `asset` is a file path only for `particle`/`model` style entries. For the rest it is
      // an entity name, so the file keeps its own path.
      const assetIsPath = asset !== undefined && /^(materials|models|particles|sounds|soundevents)\//.test(asset)
      if (!assetIsPath) {
        spawns.push({ modifier, present: Boolean(readValveFile(modifier)) })
        follow(modifier, 2)
        continue
      }
      if (!files.has(asset)) {
        files.set(asset, { dest: asset, source: readValveFile(modifier) ? modifier : null, kind: kindOf(asset), via: modifier })
        follow(modifier, 2)
      }
    }
  }

  const all = [...files.values()]
  return {
    item: { id: itemId, name: item.name, hero, slot },
    target: { id: target?.id ?? '-', name: target?.name ?? '-', model: vanillaModel },
    kind: bodySwap ? 'prepared' : cosmeticModel ? 'swap' : 'data',
    files: all,
    spawns,
    missing: all.filter((f) => !f.source).map((f) => f.dest)
  }
}
