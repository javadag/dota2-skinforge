/**
 * Equipment Slots Editor & Slot Picker Modal Component
 */

import { DOM } from '../utils/dom.js';
import { state, setHeroSlot, resetHeroSlot, resetAllHeroSlots } from '../state/store.js';
import { on } from '../state/events.js';
import { log } from '../utils/logger.js';
import { formatHeroName, getHeroSlotsDefinition } from './slotGenerator.js';
import { getItemImage, getRarityConfig, getItemRarityKey, generateItemSvg } from '../utils/itemImages.js';

let activeCatalog = null;
let activeModalHero = null;
let activeModalSlot = null;

export function renderHeroSlots(hero) {
  if (!hero) return;
  const catalog = getHeroSlotsDefinition(hero.tag, hero);
  activeCatalog = catalog;

  // Clean up any stale or non-existent slots for this hero from previous versions
  if (state.heroSlots[hero.tag]) {
    const validSlotIds = new Set(catalog.slots.map(s => s.id));
    let cleaned = false;
    for (const sid of Object.keys(state.heroSlots[hero.tag])) {
      if (!validSlotIds.has(sid)) {
        delete state.heroSlots[hero.tag][sid];
        cleaned = true;
      }
    }
  }

  const currentSlots = state.heroSlots[hero.tag] || {};

  DOM.slotsGrid.innerHTML = '';
  const frag = document.createDocumentFragment();

  let modifiedCount = 0;

  catalog.slots.forEach(slot => {
    const selectedItemName = currentSlots[slot.id];
    const isEquipped = !!selectedItemName;
    if (isEquipped) modifiedCount++;

    const equippedItemObj = isEquipped 
      ? ((catalog.items[slot.id] || []).find(it => it.name === selectedItemName) || { name: selectedItemName, tag: 'Custom' })
      : null;

    const conf = getRarityConfig(equippedItemObj);
    const itemImg = getItemImage(equippedItemObj, slot.id, hero.tag, hero);
    const fallbackSvg = generateItemSvg(equippedItemObj || { name: slot.name, tag: 'default', isDefault: true }, slot.id, hero.tag);

    const card = document.createElement('div');
    card.className = `slot-card ${isEquipped ? 'has-item' : ''}`;
    card.setAttribute('data-slot-id', slot.id);

    card.innerHTML = `
      <div class="slot-header">
        <span class="slot-name">${slot.name}</span>
        <span class="slot-badge" style="border-color:${isEquipped ? conf.color : 'rgba(255,255,255,0.1)'}; color:${isEquipped ? conf.color : 'var(--text-muted)'}; background:${isEquipped ? conf.bg1 : 'rgba(255,255,255,0.03)'}">
          ${isEquipped ? conf.name : 'Default'}
        </span>
      </div>
      <div class="slot-item-info">
        <div class="slot-thumb-container ${isEquipped ? 'equipped' : 'default-thumb'}" style="border-color: ${isEquipped ? conf.color : 'var(--border-subtle)'}; box-shadow: 0 0 14px ${isEquipped ? conf.glow : 'transparent'};">
          <img class="slot-thumb-img" src="${itemImg}" alt="${selectedItemName || slot.name}" onerror="this.onerror=null; this.src='${fallbackSvg}';">
          <span class="slot-thumb-slot-icon">${slot.icon || '⚔️'}</span>
        </div>
        <div class="slot-text-wrap">
          <div class="slot-item-name" style="color: ${isEquipped ? conf.color : 'var(--text-main)'}">${selectedItemName || 'Official Base Model'}</div>
          <div class="slot-item-status">${isEquipped ? `${conf.name} Cosmetic` : 'Valve Official Base'}</div>
        </div>
        ${isEquipped ? `
          <button class="slot-quick-reset" title="Reset to default Base" data-reset-slot="${slot.id}">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
          </button>
        ` : ''}
      </div>
    `;

    // Quick reset button handler
    const resetBtn = card.querySelector('.slot-quick-reset');
    if (resetBtn) {
      resetBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        resetHeroSlot(hero.tag, slot.id);
        renderHeroSlots(hero);
        log(`Reset ${formatHeroName(hero.tag)} [${slot.name}] to Default.`, 'info');
      });
    }

    card.addEventListener('click', () => openSlotPickerModal(hero, slot, catalog));
    frag.appendChild(card);
  });

  DOM.slotsGrid.appendChild(frag);

  // Update active set bar count
  if (DOM.asbSetName) {
    DOM.asbSetName.textContent = modifiedCount > 0 
      ? `Custom Loadout (${modifiedCount}/${catalog.slots.length} modified)` 
      : 'Default Equipment Loadout';
  }
}

export function openSlotPickerModal(hero, slot, catalog) {
  activeModalHero = hero;
  activeModalSlot = slot;
  activeCatalog = catalog;

  DOM.slotModalTitle.textContent = `${formatHeroName(hero.tag)} Equipment`;
  DOM.slotModalSlotName.textContent = slot.name;
  DOM.slotModalSearch.value = '';

  renderSlotItemsList();
  DOM.slotModal.classList.remove('hidden');
}

export function closeSlotModal() {
  DOM.slotModal.classList.add('hidden');
  activeModalHero = null;
  activeModalSlot = null;
}

export function renderSlotItemsList() {
  if (!activeModalHero || !activeModalSlot || !activeCatalog) return;

  const query = DOM.slotModalSearch.value.toLowerCase().trim();
  const currentSlots = state.heroSlots[activeModalHero.tag] || {};
  const currentEquippedName = currentSlots[activeModalSlot.id];

  const items = activeCatalog.items[activeModalSlot.id] || [];
  DOM.slotModalList.innerHTML = '';
  const frag = document.createDocumentFragment();

  // 1. Default Base Item Entry
  const isDefaultSelected = !currentEquippedName;
  const defEntry = document.createElement('div');
  defEntry.className = `slot-item-option ${isDefaultSelected ? 'active' : ''}`;
  defEntry.innerHTML = `
    <div class="sio-thumb-box default-thumb">
      <img src="${activeModalHero.img || `../assets/heroes/${activeModalHero.tag.replace(/\s+/g, '_')}.png`}" class="sio-thumb-img" onerror="this.src='../assets/categories/default.svg'">
    </div>
    <div class="sio-meta">
      <div class="sio-name">Official Base Model</div>
      <div class="sio-rarity" style="color: var(--text-muted)">Default</div>
    </div>
    ${isDefaultSelected ? '<span class="sio-equipped-tag">Active</span>' : ''}
  `;
  defEntry.addEventListener('click', () => {
    resetHeroSlot(activeModalHero.tag, activeModalSlot.id);
    renderHeroSlots(activeModalHero);
    closeSlotModal();
    log(`Reset ${formatHeroName(activeModalHero.tag)} [${activeModalSlot.name}] to Official Base.`, 'info');
  });
  frag.appendChild(defEntry);

  // 2. Official Cosmetic Items
  items.forEach(it => {
    if (query && !it.name.toLowerCase().includes(query) && !(it.tag && it.tag.toLowerCase().includes(query))) {
      return;
    }

    const conf = getRarityConfig(it);
    const itemImg = getItemImage(it, activeModalSlot.id, activeModalHero.tag, activeModalHero);
    const isSelected = currentEquippedName === it.name;

    const opt = document.createElement('div');
    opt.className = `slot-item-option ${isSelected ? 'active' : ''}`;
    opt.innerHTML = `
      <div class="sio-thumb-box" style="border-color:${conf.color}; box-shadow: 0 0 10px ${conf.glow}">
        <img src="${itemImg}" class="sio-thumb-img" onerror="this.onerror=null; this.src='${generateItemSvg(it, activeModalSlot.id, activeModalHero.tag)}';">
      </div>
      <div class="sio-meta">
        <div class="sio-name" style="color: ${isSelected ? conf.color : 'var(--text-main)'}">${it.name}</div>
        <div class="sio-rarity" style="color: ${conf.color}">${conf.name}</div>
      </div>
      ${isSelected ? '<span class="sio-equipped-tag">Active</span>' : ''}
    `;

    opt.addEventListener('click', () => {
      setHeroSlot(activeModalHero.tag, activeModalSlot.id, it.name);
      renderHeroSlots(activeModalHero);
      closeSlotModal();
      log(`Equipped ${it.name} on ${formatHeroName(activeModalHero.tag)} [${activeModalSlot.name}].`, 'success');
    });

    frag.appendChild(opt);
  });

  DOM.slotModalList.appendChild(frag);
}

export function unlockBestSet(hero) {
  const catalog = getHeroSlotsDefinition(hero.tag, hero);
  let count = 0;

  catalog.slots.forEach(slot => {
    const items = catalog.items[slot.id] || [];
    const bestItem = items.find(it => it.best) || items[0];
    if (bestItem) {
      setHeroSlot(hero.tag, slot.id, bestItem.name);
      count++;
    }
  });

  renderHeroSlots(hero);
  log(`Equipped best cosmetics set for ${formatHeroName(hero.tag)} (${count} slots).`, 'success');
}

export function resetHeroSlots(hero) {
  resetAllHeroSlots(hero.tag);
  renderHeroSlots(hero);
  log(`Reset all slots for ${formatHeroName(hero.tag)} to default.`, 'info');
}

// Listen to hero selection event to automatically render slots
on('hero:selected', (hero) => {
  renderHeroSlots(hero);
});
