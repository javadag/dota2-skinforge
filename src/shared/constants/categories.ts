export type ArmoryCategoryGroup = 'hero' | 'world' | 'interface'

export interface ArmoryCategoryMeta {
  name: string
  title: string
  sub: string
}

export const CATEGORY_META: Record<ArmoryCategoryGroup, ArmoryCategoryMeta> = {
  hero: {
    name: 'Heroes',
    title: 'Heroes & Cosmetics',
    sub: 'Select a hero to configure per-slot equipment & Arcanas'
  },
  world: {
    name: 'World',
    title: 'World & Environment',
    sub: 'Couriers, Wards, Terrain, Creeps, Towers, Ancients, Roshan, Tormentor, Map & Weather Effects'
  },
  interface: {
    name: 'Interface',
    title: 'Interface & Audio',
    sub: 'Music Packs, Announcers, Versus Screens, HUD Skins, Killstreak Effects, and Cursors'
  }
}

export function isArmoryCategoryGroup(value: string): value is ArmoryCategoryGroup {
  return value in CATEGORY_META
}
