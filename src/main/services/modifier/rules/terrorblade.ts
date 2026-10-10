import { hexToRgb } from '../../../../shared/constants/prismaticGems'
import { normalizeName } from '../matcher'
import type { ModifierRule, RuleApplyParams } from './index'

export const terrorbladeRule: ModifierRule = {
  hero: 'terrorblade',
  apply({ slots, cosmetics, defaultItems, patchDefaultItem, customizations }: RuleApplyParams) {
    const baseEquipped = slots['hero_base'] && normalizeName(slots['hero_base']).includes('fractal')
    const headEquipped = slots['head'] && normalizeName(slots['head']).includes('fractal')

    if (baseEquipped || headEquipped) {
      const tbCustomization = customizations?.['terrorblade']?.['hero_base'] || customizations?.['terrorblade']?.['head']
      const gemColor = tbCustomization?.gemColor || '#FF3C28'
      const rgbVector = hexToRgb(gemColor)

      const c5957 = cosmetics.find((c) => c.id === '5957')
      const defBase = defaultItems.find((d) => d.hero.includes('terrorblade') && (d.slot === 'hero_base' || d.id === '913'))
      const defAmbient = defaultItems.find((d) => d.hero.includes('terrorblade') && (d.slot === 'ambient_effects' || d.id === '540'))

      if (c5957 && defBase) {
        let baseVisuals = c5957.visualsBlock || ''
        const cpSnippet = `\t\t\t"asset_modifier"\n\t\t\t{\n\t\t\t\t"type"\t\t"particle_control_point"\n\t\t\t\t"asset"\t\t"particles/econ/items/terrorblade/terrorblade_horns_arcana/terrorblade_ambient_body_arcana_horns.vpcf"\n\t\t\t\t"control_point_number"\t\t"15"\n\t\t\t\t"cp_position"\t\t"${rgbVector}"\n\t\t\t}\n`

        if (baseVisuals.includes('{')) {
          baseVisuals = baseVisuals.replace(/(\t*\}\s*)$/, `${cpSnippet}$1`)
        }

        patchDefaultItem(defBase, {
          ...c5957,
          visualsBlock: baseVisuals
        })
      }

      if (defAmbient) {
        const ambientVisuals = `\t\t"visuals"\n\t\t{\n\t\t\t"asset_modifier"\n\t\t\t{\n\t\t\t\t"type"\t\t"particle_create"\n\t\t\t\t"modifier"\t\t"particles/units/heroes/hero_terrorblade/terrorblade_feet_effects.vpcf"\n\t\t\t\t"affected_by_color_gems"\t\t"1"\n\t\t\t}\n\t\t\t"asset_modifier"\n\t\t\t{\n\t\t\t\t"type"\t\t"particle_control_point"\n\t\t\t\t"asset"\t\t"particles/units/heroes/hero_terrorblade/terrorblade_feet_effects.vpcf"\n\t\t\t\t"control_point_number"\t\t"15"\n\t\t\t\t"cp_position"\t\t"${rgbVector}"\n\t\t\t}\n\t\t}`

        patchDefaultItem(defAmbient, {
          visualsBlock: ambientVisuals
        })
      }
    }
  }
}

export default terrorbladeRule
