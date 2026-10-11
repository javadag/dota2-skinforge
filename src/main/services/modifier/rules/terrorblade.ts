import { normalizeName } from '../matcher'
import type { ModifierRule, RuleApplyParams } from './index'

export const terrorbladeRule: ModifierRule = {
  hero: 'terrorblade',
  apply({ slots, cosmetics, defaultItems, patchDefaultItem }: RuleApplyParams) {
    const baseEquipped = slots['hero_base'] && normalizeName(slots['hero_base']).includes('fractal')
    const headEquipped = slots['head'] && normalizeName(slots['head']).includes('fractal')

    if (baseEquipped || headEquipped) {
      const c5957 = cosmetics.find((c) => c.id === '5957')
      const c37161 = cosmetics.find((c) => c.id === '37161')
      const defBase = defaultItems.find((d) => d.hero.includes('terrorblade') && (d.slot === 'hero_base' || d.id === '913'))
      const defHead = defaultItems.find((d) => d.hero.includes('terrorblade') && (d.slot === 'head' || d.id === '478'))

      if (c5957 && defBase) {
        patchDefaultItem(defBase, {
          ...c5957
        })
      }

      if (defHead) {
        const headItemName = slots['head']
        const isArcanaHead = !headItemName || normalizeName(headItemName).includes('fractal') || headItemName.toLowerCase() === 'default'

        if (isArcanaHead && c37161) {
          patchDefaultItem(defHead, {
            ...c37161
          })
        } else if (!isArcanaHead && headItemName) {
          const otherHeadCosmetic = cosmetics.find((c) => c.norm === normalizeName(headItemName))
          patchDefaultItem(defHead, {
            ...(otherHeadCosmetic || {})
          })
        }
      }
    }
  }
}

export default terrorbladeRule
