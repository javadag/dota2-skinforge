/**
 * Dota 2 SkinForge — Equipment Slots Catalog & Slot Definition Resolver
 */

import { NON_HERO_SLOTS_CATALOG } from '../../data/nonHeroCatalog.js';
import { HERO_ALIASES } from '../../shared/constants/heroAliases.js';
import { state } from '../state/store.js';

let valveCatalog = {};

export async function initCatalog() {
  if (Object.keys(valveCatalog).length > 0) return valveCatalog;
  try {
    const res = await fetch('../data/valveHeroCatalog.json');
    valveCatalog = await res.json();
  } catch (e) {
    console.error('Failed to load valveHeroCatalog.json:', e);
  }
  return valveCatalog;
}

export function formatHeroName(tag) {
  if (!tag) return '';
  return tag.split(/[_\s-]+/).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

export function getGenericCategorySlotDefinition(item) {
  const name = formatHeroName(item.tag);
  const group = item.g || 'maps';
  
  let slotType = 'Cosmetic Skin';
  let icon = '✨';
  if (group === 'maps') { slotType = 'Model & Texture'; icon = '🗺️'; }
  else if (group === 'cursor') { slotType = 'Interface Pack'; icon = '🖥️'; }
  else if (group === 'ranged attack') { slotType = 'Particle FX'; icon = '🪄'; }
  else if (group === 'icons') { slotType = 'Sound & Voice Pack'; icon = '🎵'; }

  return {
    slots: [
      { id: 'primary', name: `${name} — ${slotType}`, icon: icon },
      { id: 'variant', name: `${name} — Deluxe Variant`, icon: '💎' },
      { id: 'ambient', name: `${name} — Special FX`, icon: '✨' }
    ],
    items: {
      'primary': [
        { name: `The International Deluxe ${name}`, tag: 'Immortal', best: true },
        { name: `Mythical Enhanced ${name}`, tag: 'Mythical' },
        { name: `Collector's Cache ${name}`, tag: 'Mythical' },
        { name: `Classic Vintage ${name}`, tag: 'Rare' }
      ],
      'variant': [
        { name: `Golden Edition ${name}`, tag: 'Golden', best: true },
        { name: `Crimson Witness Variant ${name}`, tag: 'Crimson' },
        { name: `Celestial Astral ${name}`, tag: 'Mythical' }
      ],
      'ambient': [
        { name: 'Crimson Witness Ambient Aura', tag: 'Crimson', best: true },
        { name: 'Golden Particle Aura', tag: 'Golden' },
        { name: 'Ethereal Flame Infusion', tag: 'Mythical' }
      ]
    }
  };
}

export function getHeroSlotsDefinition(heroTag, heroObj = null) {
  if (!heroTag) return { slots: [], items: {} };

  const rawKey = heroTag.toLowerCase();
  const normalized = rawKey.replace(/\s+/g, '_').replace(/-/g, '_');
  const aliasKey = HERO_ALIASES[rawKey] || HERO_ALIASES[normalized];

  // 1. Check official Valve Hero Catalog
  if (valveCatalog[normalized]) {
    return valveCatalog[normalized];
  }
  if (valveCatalog[rawKey]) {
    return valveCatalog[rawKey];
  }
  if (aliasKey && valveCatalog[aliasKey]) {
    return valveCatalog[aliasKey];
  }

  // 2. Check Non-Hero Categories Catalog
  if (NON_HERO_SLOTS_CATALOG[normalized]) {
    return NON_HERO_SLOTS_CATALOG[normalized];
  }
  if (NON_HERO_SLOTS_CATALOG[rawKey]) {
    return NON_HERO_SLOTS_CATALOG[rawKey];
  }

  // 3. Check if non-hero item from state
  const obj = heroObj || (state.heroes && state.heroes.find(h => h.tag.toLowerCase() === rawKey || h.tag.toLowerCase() === normalized));
  if (obj && obj.g && obj.g !== 'hero') {
    return getGenericCategorySlotDefinition(obj);
  }

  // 4. Default fallback: only base weapon
  const name = formatHeroName(heroTag);
  return {
    slots: [
      { id: 'weapon', name: 'Weapon / Armament', icon: '⚔️' }
    ],
    items: {
      'weapon': [
        { name: `Official Base Armament — ${name}`, tag: 'Common', best: true }
      ]
    }
  };
}
