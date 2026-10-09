/**
 * Dota 2 SkinForge — Central Application State Store
 * Manages reactive state updates and persistence with event broadcasting.
 */

import { emit } from './events.js';

export const state = {
  dotaPath: '',
  status: null,
  heroes: [],
  selectedHero: null,
  activeTab: 'heroes',
  activeCategoryGroup: 'hero',
  attrFilter: 'all',
  searchQuery: '',
  isBusy: false,
  heroSlots: {},
  presets: [],
  settings: {
    dotaPath: '',
    modFolder: 'skinforge',
    autoDetect: true,
    launchAfter: false,
    confirmRestore: true
  },
  activeModalSlot: null
};

export function loadPresets() {
  try {
    const data = localStorage.getItem('skinforge_presets');
    state.presets = data ? JSON.parse(data) : [];
  } catch (e) {
    state.presets = [];
  }
  emit('presets:updated', state.presets);
  return state.presets;
}

export function savePresets() {
  localStorage.setItem('skinforge_presets', JSON.stringify(state.presets));
  emit('presets:updated', state.presets);
}

export function addPreset(name) {
  const newPreset = {
    id: 'preset_' + Date.now(),
    name,
    timestamp: Date.now(),
    heroSlots: JSON.parse(JSON.stringify(state.heroSlots))
  };
  state.presets.unshift(newPreset);
  savePresets();
  return newPreset;
}

export function deletePreset(presetId) {
  state.presets = state.presets.filter(p => p.id !== presetId);
  savePresets();
}

export function loadHeroSlots() {
  try {
    const data = localStorage.getItem('skinforge_hero_slots');
    state.heroSlots = data ? JSON.parse(data) : {};
  } catch (e) {
    state.heroSlots = {};
  }
  return state.heroSlots;
}

export function saveHeroSlots() {
  localStorage.setItem('skinforge_hero_slots', JSON.stringify(state.heroSlots));
}

export function setHeroSlot(heroTag, slotId, itemName) {
  if (!state.heroSlots[heroTag]) {
    state.heroSlots[heroTag] = {};
  }
  state.heroSlots[heroTag][slotId] = itemName;
  saveHeroSlots();
  emit('slots:updated', { heroTag, slots: state.heroSlots[heroTag] });
}

export function resetHeroSlot(heroTag, slotId) {
  if (state.heroSlots[heroTag]) {
    delete state.heroSlots[heroTag][slotId];
    saveHeroSlots();
    emit('slots:updated', { heroTag, slots: state.heroSlots[heroTag] });
  }
}

export function resetAllHeroSlots(heroTag) {
  if (state.heroSlots[heroTag]) {
    delete state.heroSlots[heroTag];
    saveHeroSlots();
    emit('slots:updated', { heroTag, slots: {} });
  }
}

export function setSelectedHero(hero) {
  state.selectedHero = hero;
  emit('hero:selected', hero);
}
