/**
 * Windranger Arcana (Compass of the Rising Gale) Special Rule
 * Ensures hero_base (13806) entity_model, custom animations, sounds, icons,
 * and HUD portraits pair seamlessly with the Arcana head (32650 Hair of the Rising Gale),
 * armor (13807), cape (13804), quiver (13808), and bow (13805) without reverting to default head/face.
 */

import { normalizeName, normalizeSlot } from '../matcher'
import type { ModifierRule, RuleApplyParams } from './index'

export const windrangerRule: ModifierRule = {
  hero: 'windrunner',
  apply({ slots, cosmetics, defaultItems, patchDefaultItem }: RuleApplyParams) {
    const arcanaEquippedInBase =
      slots['hero_base'] &&
      (normalizeName(slots['hero_base']).includes('compass') ||
        normalizeName(slots['hero_base']).includes('risinggale') ||
        normalizeName(slots['hero_base']).includes('arcana'))
    const anyArcanaEquipped = Object.values(slots).some(
      (v) => typeof v === 'string' && (normalizeName(v).includes('compass') || normalizeName(v).includes('risinggale'))
    )

    if (arcanaEquippedInBase || anyArcanaEquipped) {
      const c13806 = cosmetics.find((c) => c.id === '13806')
      const defBase = defaultItems.find((d) => d.id === '828' || (d.hero.includes('wind') && normalizeSlot(d.slot) === 'hero_base'))
      const defHead = defaultItems.find((d) => d.id === '21' || (d.hero.includes('wind') && normalizeSlot(d.slot) === 'head'))
      const defShoulder = defaultItems.find((d) => d.id === '23' || (d.hero.includes('wind') && normalizeSlot(d.slot) === 'shoulder'))
      const defBack = defaultItems.find((d) => d.id === '24' || (d.hero.includes('wind') && normalizeSlot(d.slot) === 'back'))
      const defQuiver = defaultItems.find((d) => d.id === '25' || (d.hero.includes('wind') && normalizeSlot(d.slot) === 'offhand_weapon'))
      const defWeapon = defaultItems.find((d) => d.id === '22' || (d.hero.includes('wind') && normalizeSlot(d.slot) === 'weapon'))

      if (c13806 && defBase) {
        patchDefaultItem(defBase, c13806)
      }

      // Automatically pair the Arcana head unless the user explicitly chose a different custom head
      const hasOtherCustomHead =
        slots['head'] &&
        !normalizeName(slots['head']).includes('risinggale') &&
        !normalizeName(slots['head']).includes('compass') &&
        !normalizeName(slots['head']).includes('officialbase') &&
        !normalizeName(slots['head']).includes('default')

      if (!hasOtherCustomHead && defHead) {
        const c32650 = cosmetics.find((c) => c.id === '32650')
        if (c32650) {
          patchDefaultItem(defHead, c32650)
        } else {
          patchDefaultItem(defHead, {
            model: 'models/items/windrunner/windrunner_arcana/wr_arcana_head.vmdl'
          })
        }
      }

      // Automatically pair Arcana shoulder armor
      const hasOtherCustomShoulder =
        slots['shoulder'] &&
        !normalizeName(slots['shoulder']).includes('risinggale') &&
        !normalizeName(slots['shoulder']).includes('compass') &&
        !normalizeName(slots['shoulder']).includes('officialbase') &&
        !normalizeName(slots['shoulder']).includes('default')

      if (!hasOtherCustomShoulder && defShoulder) {
        const c13807 = cosmetics.find((c) => c.id === '13807')
        if (c13807) patchDefaultItem(defShoulder, c13807)
      }

      // Automatically pair Arcana cape
      const hasOtherCustomBack =
        slots['back'] &&
        !normalizeName(slots['back']).includes('risinggale') &&
        !normalizeName(slots['back']).includes('compass') &&
        !normalizeName(slots['back']).includes('officialbase') &&
        !normalizeName(slots['back']).includes('default')

      if (!hasOtherCustomBack && defBack) {
        const c13804 = cosmetics.find((c) => c.id === '13804')
        if (c13804) patchDefaultItem(defBack, c13804)
      }

      // Automatically pair Arcana quiver
      const hasOtherCustomQuiver =
        slots['offhand_weapon'] &&
        !normalizeName(slots['offhand_weapon']).includes('risinggale') &&
        !normalizeName(slots['offhand_weapon']).includes('compass') &&
        !normalizeName(slots['offhand_weapon']).includes('officialbase') &&
        !normalizeName(slots['offhand_weapon']).includes('default')

      if (!hasOtherCustomQuiver && defQuiver) {
        const c13808 = cosmetics.find((c) => c.id === '13808')
        if (c13808) patchDefaultItem(defQuiver, c13808)
      }

      // Automatically pair Arcana bow
      const hasOtherCustomWeapon =
        slots['weapon'] &&
        !normalizeName(slots['weapon']).includes('risinggale') &&
        !normalizeName(slots['weapon']).includes('compass') &&
        !normalizeName(slots['weapon']).includes('officialbase') &&
        !normalizeName(slots['weapon']).includes('default')

      if (!hasOtherCustomWeapon && defWeapon) {
        const c13805 = cosmetics.find((c) => c.id === '13805')
        if (c13805) patchDefaultItem(defWeapon, c13805)
      }
    }
  }
}

export default windrangerRule
