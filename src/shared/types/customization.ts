export interface ItemCustomization {
  style?: number
}

export type HeroCustomizationsMap = Record<string, Record<string, ItemCustomization>>
