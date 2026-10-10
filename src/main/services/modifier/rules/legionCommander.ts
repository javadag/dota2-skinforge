/**
 * Legion Commander Arcana (Blades of Voth Domosh) Special Rule
 * Ensures hero_base (5810) dualwield activities, particles, and custom voice
 * pair seamlessly with the dual swords model.
 */

import { normalizeName, normalizeSlot } from '../matcher'
import type { ModifierRule, RuleApplyParams } from './index'

export const legionCommanderRule: ModifierRule = {
  hero: 'legioncommander',
  apply({ slots, cosmetics, defaultItems, patchDefaultItem }: RuleApplyParams) {
    const arcanaEquippedInBase =
      slots['hero_base'] &&
      (normalizeName(slots['hero_base']).includes('vothdomosh') || normalizeName(slots['hero_base']).includes('arcana'))
    const arcanaEquippedInWeapon = slots['weapon'] && normalizeName(slots['weapon']).includes('vothdomosh')

    if (arcanaEquippedInBase || arcanaEquippedInWeapon) {
      const c5810 = cosmetics.find((c) => c.id === '5810')
      const defBase = defaultItems.find((d) => d.id === '847' || (d.hero.includes('legion') && normalizeSlot(d.slot) === 'hero_base'))
      const defWeapon = defaultItems.find((d) => d.id === '434' || (d.hero.includes('legion') && normalizeSlot(d.slot) === 'weapon'))

      // Ensure hero_base has Arcana visuals & particles
      if (c5810 && defBase) {
        patchDefaultItem(defBase, c5810)
      }

      const hasOtherCustomWeapon =
        slots['weapon'] &&
        !normalizeName(slots['weapon']).includes('vothdomosh') &&
        !normalizeName(slots['weapon']).includes('officialbase') &&
        !normalizeName(slots['weapon']).includes('default')

      if (!hasOtherCustomWeapon && defWeapon) {
        const c37140 = cosmetics.find((c) => c.id === '37140')
        const weaponModel = c37140?.model || 'models/items/legion_commander/voth_domosh/voth_domosh_polearm.vmdl'
        patchDefaultItem(defWeapon, {
          model: weaponModel,
          particleFolder: c37140?.particleFolder || 'particles/econ/items/legion/legion_weapon_voth_domosh'
        })
      }
    }
  }
}

export default legionCommanderRule
