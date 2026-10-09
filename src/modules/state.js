// Global Application State & Storage Persistence
export const state = {
  dotaPath: '',
  status: null,
  heroes: [],
  selectedHero: null,
  activeTab: 'heroes',
  activeCategoryGroup: 'hero', // 'hero', 'maps', 'icons', 'ranged attack', 'cursor', 'all'
  attrFilter: 'all',
  searchQuery: '',
  isBusy: false,
  // Equipment slot mappings: { [heroTag]: { [slotKey]: itemName } }
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
}

export function savePresets() {
  localStorage.setItem('skinforge_presets', JSON.stringify(state.presets));
}

export function loadHeroSlots() {
  try {
    const data = localStorage.getItem('skinforge_hero_slots');
    state.heroSlots = data ? JSON.parse(data) : {};
  } catch (e) {
    state.heroSlots = {};
  }
}

export function saveHeroSlots() {
  localStorage.setItem('skinforge_hero_slots', JSON.stringify(state.heroSlots));
}
