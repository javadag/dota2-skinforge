// Category Metadata and Descriptions
export interface CategoryMetaItem {
  name: string;
  title: string;
  sub: string;
  icon: string;
  badge: string;
}

export const CATEGORY_META: Record<string, CategoryMetaItem> = {
  hero: {
    name: 'Heroes',
    title: 'Heroes & Cosmetics',
    sub: 'Select a hero to configure per-slot equipment & Arcanas',
    icon: '👑',
    badge: 'Hero',
  },
  maps: {
    name: 'World & Creeps',
    title: 'World, Creeps & Maps',
    sub: 'Configure creeps, couriers, towers, weather, and world maps',
    icon: '🧟',
    badge: 'World',
  },
  icons: {
    name: 'Music & Sounds',
    title: 'Music Packs & Sounds',
    sub: 'Customize official soundtrack packs, voice lines, and sound effects',
    icon: '🎵',
    badge: 'Audio',
  },
  'ranged attack': {
    name: 'Effects & Items',
    title: 'Spell Effects & Items',
    sub: 'Modify teleport animations, blink effects, and spell particles',
    icon: '✨',
    badge: 'Effect',
  },
  cursor: {
    name: 'Interface & HUD',
    title: 'Interface & HUD Skins',
    sub: 'Change cursor themes, custom HUD skins, and loading screens',
    icon: '🖥️',
    badge: 'Interface',
  },
  all: {
    name: 'All Items',
    title: 'All Dota 2 Cosmetics',
    sub: 'Browse all 180+ heroes and game categories',
    icon: '🌟',
    badge: 'Dota 2',
  },
};
