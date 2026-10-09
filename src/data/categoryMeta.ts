// Category Metadata and Descriptions
export type CategoryKey = 'hero' | 'maps' | 'icons' | 'ranged attack' | 'cursor' | 'all';

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
  maps: {
    name: 'World & Creeps',
    title: 'World, Creeps & Maps',
    sub: 'Configure creeps, couriers, towers, weather, and world maps',
    badge: 'World',
  },
  icons: {
    name: 'Music & Sounds',
    title: 'Music Packs & Sounds',
    sub: 'Customize official soundtrack packs, voice lines, and sound effects',
    badge: 'Audio',
  },
  'ranged attack': {
    name: 'Effects & Items',
    title: 'Spell Effects & Items',
    sub: 'Modify teleport animations, blink effects, and spell particles',
    badge: 'Effect',
  },
  cursor: {
    name: 'Interface & HUD',
    title: 'Interface & HUD Skins',
    sub: 'Change cursor themes, custom HUD skins, and loading screens',
    badge: 'Interface',
  },
  all: {
    name: 'All Items',
    title: 'All Dota 2 Cosmetics',
    sub: 'Browse all 180+ heroes and game categories',
    badge: 'Dota 2',
  },
};

export function isCategoryKey(value: string): value is CategoryKey {
  return value in CATEGORY_META;
}
