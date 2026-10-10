import { hexToRgb } from '../../../../shared/constants/prismaticGems'
import { normalizeName } from '../matcher'
import type { ModifierRule, RuleApplyParams } from './index'

export const TB_ARCANA_PARTICLES = [
  'particles/econ/items/terrorblade/terrorblade_horns_arcana/terrorblade_ambient_body_arcana_horns.vpcf',
  'particles/econ/items/terrorblade/terrorblade_horns_arcana/terrorblade_ambient_eyes_arcana_horns.vpcf',
  'particles/units/heroes/hero_terrorblade/terrorblade_ambient_eyes.vpcf',
  'particles/econ/items/terrorblade/dreadhunt/dreadhunt_arcana_head_ambient.vpcf',
  'particles/units/heroes/hero_terrorblade/terrorblade_feet_effects.vpcf'
]

function generateCpModifiers(rgbVector: string, particles: string[]): string {
  return (
    particles
      .map(
        (p) =>
          `\t\t\t"asset_modifier"\n\t\t\t{\n\t\t\t\t"type"\t\t"particle_control_point"\n\t\t\t\t"asset"\t\t"${p}"\n\t\t\t\t"control_point_number"\t\t"15"\n\t\t\t\t"cp_position"\t\t"${rgbVector}"\n\t\t\t}\n\t\t\t"asset_modifier"\n\t\t\t{\n\t\t\t\t"type"\t\t"particle_control_point"\n\t\t\t\t"asset"\t\t"${p}"\n\t\t\t\t"control_point_number"\t\t"16"\n\t\t\t\t"cp_position"\t\t"1 0 0"\n\t\t\t}`
      )
      .join('\n') + '\n'
  )
}

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
      const c37161 = cosmetics.find((c) => c.id === '37161')
      const defBase = defaultItems.find((d) => d.hero.includes('terrorblade') && (d.slot === 'hero_base' || d.id === '913'))
      const defAmbient = defaultItems.find((d) => d.hero.includes('terrorblade') && (d.slot === 'ambient_effects' || d.id === '540'))
      const defHead = defaultItems.find((d) => d.hero.includes('terrorblade') && (d.slot === 'head' || d.id === '478'))

      const cpSnippet = generateCpModifiers(rgbVector, TB_ARCANA_PARTICLES)

      if (c5957 && defBase) {
        let baseVisuals = c5957.visualsBlock || `\t\t"visuals"\n\t\t{\n\t\t}`
        if (baseVisuals.includes('{')) {
          baseVisuals = baseVisuals.replace(/(\t*\}\s*)$/, `${cpSnippet}$1`)
        }

        patchDefaultItem(defBase, {
          ...c5957,
          visualsBlock: baseVisuals
        })
      }

      if (defHead) {
        const headItemName = slots['head']
        const isArcanaHead = !headItemName || normalizeName(headItemName).includes('fractal') || headItemName.toLowerCase() === 'default'

        if (isArcanaHead && c37161) {
          let headVisuals = c37161.visualsBlock || `\t\t"visuals"\n\t\t{\n\t\t}`
          if (headVisuals.includes('{')) {
            headVisuals = headVisuals.replace(/(\t*\}\s*)$/, `${cpSnippet}$1`)
          }
          patchDefaultItem(defHead, {
            ...c37161,
            visualsBlock: headVisuals
          })
        } else if (!isArcanaHead && headItemName) {
          const otherHeadCosmetic = cosmetics.find((c) => c.norm === normalizeName(headItemName))
          let headVisuals =
            otherHeadCosmetic?.visualsBlock || defHead.block.match(/"visuals"[\s\S]*?\n\t\t\}/)?.[0] || `\t\t"visuals"\n\t\t{\n\t\t}`
          if (headVisuals.includes('{')) {
            headVisuals = headVisuals.replace(/(\t*\}\s*)$/, `${cpSnippet}$1`)
          }
          patchDefaultItem(defHead, {
            ...(otherHeadCosmetic || {}),
            visualsBlock: headVisuals
          })
        }
      }

      if (defAmbient) {
        const ambientVisuals = `\t\t"visuals"\n\t\t{\n\t\t\t"asset_modifier"\n\t\t\t{\n\t\t\t\t"type"\t\t"particle_create"\n\t\t\t\t"modifier"\t\t"particles/units/heroes/hero_terrorblade/terrorblade_feet_effects.vpcf"\n\t\t\t\t"affected_by_color_gems"\t\t"1"\n\t\t\t}\n\t\t\t"asset_modifier"\n\t\t\t{\n\t\t\t\t"type"\t\t"particle_control_point"\n\t\t\t\t"asset"\t\t"particles/units/heroes/hero_terrorblade/terrorblade_feet_effects.vpcf"\n\t\t\t\t"control_point_number"\t\t"15"\n\t\t\t\t"cp_position"\t\t"${rgbVector}"\n\t\t\t}\n\t\t\t"asset_modifier"\n\t\t\t{\n\t\t\t\t"type"\t\t"particle_control_point"\n\t\t\t\t"asset"\t\t"particles/units/heroes/hero_terrorblade/terrorblade_feet_effects.vpcf"\n\t\t\t\t"control_point_number"\t\t"16"\n\t\t\t\t"cp_position"\t\t"1 0 0"\n\t\t\t}\n\t\t}`

        patchDefaultItem(defAmbient, {
          visualsBlock: ambientVisuals
        })
      }
    }
  }
}

export default terrorbladeRule
