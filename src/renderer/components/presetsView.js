/**
 * Presets Management View Component
 */

import { DOM } from '../utils/dom.js';
import { state, saveHeroSlots, savePresets, addPreset, deletePreset } from '../state/store.js';
import { on, emit } from '../state/events.js';
import { log } from '../utils/logger.js';
import { formatHeroName } from './slotGenerator.js';

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
      emit('slots:updated', { heroTag: state.selectedHero ? state.selectedHero.tag : null });
      if (state.selectedHero) {
        emit('hero:selected', state.selectedHero);
      }
      log(`Applied preset "${p.name}".`, 'success');
      alert(`Preset "${p.name}" loaded! Click "Apply Mods" when ready to compile to game.`);
    });

    card.querySelector('.btn-delete-preset').addEventListener('click', () => {
      if (confirm(`Delete preset "${p.name}"?`)) {
        deletePreset(p.id);
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

  addPreset(name);
  DOM.presetNameModal.classList.add('hidden');
  log(`Created new preset "${name}".`, 'success');
}

// Auto-refresh when presets list changes
on('presets:updated', () => {
  renderPresetsList();
});
