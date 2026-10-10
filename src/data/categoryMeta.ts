// Category Metadata and Descriptions
export type CategoryKey = 'hero' | 'world' | 'interface' | 'all';

export interface CategoryMetaItem {
  name: string;
  title: string;
  sub: string;
  badge: string;
}

export const CATEGORY_META: Record<CategoryKey, CategoryMetaItem> = {
  hero: {
    name: 'Heroes',
    title: 'Heroes & Cosmetics',
    sub: 'Select a hero to configure per-slot equipment & Arcanas',
    badge: 'Hero',
  },
  world: {
    name: 'World',
    title: 'World & Environment',
    sub: 'Couriers, Wards, Terrain, Creeps, Towers, Ancients, Roshan, Tormentor, Map & Weather Effects',
    badge: 'World',
  },
  interface: {
    name: 'Interface',
    title: 'Interface & Audio',
    sub: 'Music Packs, Announcers, Loading Screens, Versus Screens, HUD Skins, Killstreak Effects, and Cursors',
    badge: 'Interface',
  },
  all: {
    name: 'All Items',
    title: 'All Dota 2 Cosmetics',
    sub: 'Browse all official heroes and global items',
    badge: 'Dota 2',
  },
};

export function isCategoryKey(value: string): value is CategoryKey {
  return value in CATEGORY_META;
}

