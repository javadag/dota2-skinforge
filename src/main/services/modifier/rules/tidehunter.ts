/**
 * Tidehunter Arcana (Maw of the Megalodon) Special Rule
 * Handles entity_model override (37143), prop_null bracers hiding, and shark weapon.
 */

import { normalizeName, normalizeSlot } from '../matcher'
import type { ModifierRule, RuleApplyParams } from './index'

export const tidehunterRule: ModifierRule = {
  hero: 'tidehunter',
  apply({ slots, cosmetics, defaultItems, patchDefaultItem }: RuleApplyParams) {
    const arcanaEquippedInBase =
      slots['hero_base'] &&
      (normalizeName(slots['hero_base']).includes('megalodon') || normalizeName(slots['hero_base']).includes('arcana'))
    const anyArcanaEquipped = Object.values(slots).some((v) => typeof v === 'string' && normalizeName(v).includes('megalodon'))

    if (arcanaEquippedInBase || anyArcanaEquipped) {
      const c37143 = cosmetics.find((c) => c.id === '37143')
      const defBase = defaultItems.find((d) => normalizeSlot(d.slot) === 'hero_base' || d.id === '904')
      const defWeapon = defaultItems.find((d) => d.id === '36' || normalizeSlot(d.slot) === 'weapon')
      const defArms = defaultItems.find((d) => d.id === '34' || normalizeSlot(d.slot) === 'arms')
      const defBelt = defaultItems.find((d) => d.id === '35' || normalizeSlot(d.slot) === 'belt')
      const defOffhand = defaultItems.find((d) => d.id === '37' || normalizeSlot(d.slot) === 'offhand_weapon')

      if (c37143 && defBase) {
        patchDefaultItem(defBase, c37143)
      }

      const hasOtherCustomWeapon =
        slots['weapon'] &&
        !normalizeName(slots['weapon']).includes('megalodon') &&
        !normalizeName(slots['weapon']).includes('officialbase') &&
        !normalizeName(slots['weapon']).includes('default')

      if (!hasOtherCustomWeapon && defWeapon) {
        const c34483 = cosmetics.find((c) => c.id === '34483')
        if (c34483) {
          patchDefaultItem(defWeapon, c34483)
        } else {
          patchDefaultItem(defWeapon, {
            model: 'models/items/tidehunter/tidehunter_arcana/tidehunter_arcana_weapon.vmdl'
          })
        }
      }

      const hasOtherCustomArms =
        slots['arms'] &&
        !normalizeName(slots['arms']).includes('megalodon') &&
        !normalizeName(slots['arms']).includes('officialbase') &&
        !normalizeName(slots['arms']).includes('default')

      if (!hasOtherCustomArms && defArms) {
        patchDefaultItem(defArms, { model: 'models/props_nature/prop_null.vmdl' })
      }

      const hasOtherCustomBelt =
        slots['belt'] &&
        !normalizeName(slots['belt']).includes('megalodon') &&
        !normalizeName(slots['belt']).includes('officialbase') &&
        !normalizeName(slots['belt']).includes('default')

      if (!hasOtherCustomBelt && defBelt) {
        const c34484 = cosmetics.find((c) => c.id === '34484')
        if (c34484) {
          patchDefaultItem(defBelt, c34484)
        }
      }

      const hasOtherCustomOffhand =
        slots['offhand_weapon'] &&
        !normalizeName(slots['offhand_weapon']).includes('megalodon') &&
        !normalizeName(slots['offhand_weapon']).includes('officialbase') &&
        !normalizeName(slots['offhand_weapon']).includes('default')

      if (!hasOtherCustomOffhand && defOffhand) {
        const c34485 = cosmetics.find((c) => c.id === '34485')
        if (c34485) {
          patchDefaultItem(defOffhand, c34485)
        }
      }
    }
  }
}

export default tidehunterRule
