import { DOM } from './dom.js';
import { state, savePresets, saveHeroSlots } from './state.js';
import { log } from './logger.js';
import { formatHeroName } from './slotGenerator.js';
import { renderHeroSlots } from './slotEditor.js';
import { renderHeroList } from './heroList.js';

// Presets System
export function renderPresetsList() {
  DOM.presetsList.innerHTML = '';
  if (state.presets.length === 0) {
    DOM.presetsEmpty.classList.remove('hidden');
    return;
  }

  DOM.presetsEmpty.classList.add('hidden');
  const frag = document.createDocumentFragment();

  state.presets.forEach(p => {
    const card = document.createElement('div');
    card.className = 'preset-card';

    const heroCount = Object.keys(p.heroSlots || {}).length;
    let totalSlots = 0;
    Object.values(p.heroSlots || {}).forEach(slots => {
      totalSlots += Object.keys(slots).length;
    });

    card.innerHTML = `
      <div class="preset-card-header">
        <span class="preset-name">${p.name}</span>
        <span class="preset-date">${new Date(p.timestamp).toLocaleDateString()}</span>
      </div>
      <div class="preset-stats">
        <span>👤 ${heroCount} heroes</span>
        <span>⚔️ ${totalSlots} items customized</span>
      </div>
      <div class="preset-actions">
        <button class="btn btn-primary btn-sm btn-apply-preset">Apply Preset</button>
        <button class="btn btn-danger btn-sm btn-delete-preset">Delete</button>
      </div>
    `;

    card.querySelector('.btn-apply-preset').addEventListener('click', () => {
      state.heroSlots = JSON.parse(JSON.stringify(p.heroSlots || {}));
      saveHeroSlots();
      if (state.selectedHero) renderHeroSlots(state.selectedHero);
      renderHeroList();
      log(`Applied preset "${p.name}".`, 'success');
      alert(`Preset "${p.name}" loaded! Click "Apply Mods" when ready to compile to game.`);
    });

    card.querySelector('.btn-delete-preset').addEventListener('click', () => {
      if (confirm(`Delete preset "${p.name}"?`)) {
        state.presets = state.presets.filter(x => x.id !== p.id);
        savePresets();
        renderPresetsList();
        log(`Deleted preset "${p.name}".`, 'info');
      }
    });

    frag.appendChild(card);
  });

  DOM.presetsList.appendChild(frag);
}

export function openPresetNameModal() {
  DOM.presetNameInput.value = state.selectedHero 
    ? `${formatHeroName(state.selectedHero.tag)} Custom Loadout`
    : `Custom Build ${new Date().toLocaleDateString()}`;
  DOM.presetNameModal.classList.remove('hidden');
  DOM.presetNameInput.focus();
}

export function saveCurrentAsPreset() {
  const name = DOM.presetNameInput.value.trim();
  if (!name) return;

  const newPreset = {
    id: 'preset_' + Date.now(),
    name,
    timestamp: Date.now(),
    heroSlots: JSON.parse(JSON.stringify(state.heroSlots))
  };

  state.presets.unshift(newPreset);
  savePresets();
  DOM.presetNameModal.classList.add('hidden');
  log(`Created new preset "${name}".`, 'success');
}
