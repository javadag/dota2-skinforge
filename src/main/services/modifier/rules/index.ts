/**
 * Special Cosmetic Rules Registry
 */

import { legionCommanderRule } from './legionCommander'
import { tidehunterRule } from './tidehunter'
import type { DefaultItemEntry, CosmeticItemEntry } from '../vdfParser'

export interface CosmeticPartial {
  id?: string
  model?: string
  particleFolder?: string
  visualsBlock?: string | null
}

export interface RuleApplyParams {
  heroTag: string
  slots: Record<string, string>
  cosmetics: CosmeticItemEntry[]
  defaultItems: DefaultItemEntry[]
  patchDefaultItem: (defaultItem: DefaultItemEntry, cosmetic: CosmeticPartial) => void
}

export interface ModifierRule {
  hero: string
  apply: (params: RuleApplyParams) => void
}

export const rules: ModifierRule[] = [legionCommanderRule, tidehunterRule]

export default rules
