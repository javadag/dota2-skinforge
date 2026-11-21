export type AbilityIconOverrides = Record<string, string>
export type HeroAbilityIconOverrides = Record<string, AbilityIconOverrides>

export function countAbilityIconOverrides(overrides: HeroAbilityIconOverrides): number {
  return Object.values(overrides).reduce((total, icons) => total + Object.keys(icons).length, 0)
}

export interface AbilityIconPreview {
  id: string
  name: string
  slot: number
  defaultIcon: string
  equippedIcon: string
  source?: string
}

export interface HeroAbilityIcons {
  abilities: AbilityIconPreview[]
  catalog: string[]
  related: string[]
}
