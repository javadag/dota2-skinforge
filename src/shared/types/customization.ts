export interface ItemCustomization {
  style?: number
  gemColor?: string
  gemName?: string
}

export type HeroCustomizationsMap = Record<string, Record<string, ItemCustomization>>
