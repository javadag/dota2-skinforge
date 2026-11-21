import { getCanonicalHero } from '../constants/heroAliases'

interface ApplyTimeWearableMerge {
  stockBodySha256: string
  wearableSha256s: string[]
  /** Opt known model hashes into the weighted bind-pose checks used by the tested merges. */
  checkWeightedBind?: boolean | 'near'
  /** Merge this verified companion mesh together with the primary wearable. */
  additionalWearable?: { model: string; sha256: string }
}

type WearableMergeStrategy = {
  group: string
  guestStyle?: number
  bakedGuestSkin?: string
} & (
  | { hostSlot: string; hostModel?: never; applyTime?: never; preserveGuestVisuals?: boolean }
  | {
      hostModel: string
      hostSlot?: never
      preserveGuestVisuals?: never
      applyTime?: ApplyTimeWearableMerge
    }
)

interface ReconnectCompanions {
  hero: string
  slot: string
  /** Required same-set carriers. Order preserves conflict resolution across slot groups. */
  companions?: Array<{ set: string; slot: string; order: number }>
}

/** Selection requirements and model-generation strategies for one hero's affected slot. */
export interface ReconnectRule extends ReconnectCompanions {
  /** Global execution order matters when several selected pieces merge into one body. */
  merges?: Array<WearableMergeStrategy & { order: number }>
}

export type WearableModelMerge = WearableMergeStrategy & { hero: string; slot: string }

export function reconnectPairRules(rules: readonly ReconnectCompanions[]) {
  return rules
    .flatMap(({ hero, slot, companions }) =>
      (companions ?? []).map(({ set, slot: requiredSlot, order }) => ({ hero, set, dependentSlot: slot, requiredSlot, order }))
    )
    .sort((a, b) => a.order - b.order)
    .map(({ order: _order, ...pair }) => pair)
}

export function wearableMergeRules(rules: readonly ReconnectRule[]): WearableModelMerge[] {
  return rules
    .flatMap(({ hero, slot, merges }) => (merges ?? []).map((merge) => ({ ...merge, hero: getCanonicalHero(hero), slot })))
    .sort((a, b) => a.order - b.order)
    .map(({ order: _order, ...merge }) => merge)
}
