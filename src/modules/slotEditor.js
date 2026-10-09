// ============================================================================
// Dota 2 SkinForge — Equipment Slots Editor & Item Selector Modal
// High-fidelity Dota 2 Armory UI with item thumbnail previews, rarity badges,
// and instant single-slot quick reset capabilities.
// ============================================================================

import { DOM } from './dom.js';
import { state, saveHeroSlots } from './state.js';
import { log } from './logger.js';
import { formatHeroName, getHeroSlotsDefinition } from './slotGenerator.js';
import { renderHeroList } from './heroList.js';
import { getItemImage, getRarityConfig, getItemRarityKey, generateItemSvg } from './itemImages.js';

// Equipment Slots Grid
export function renderHeroSlots(hero) {
  const catalog = getHeroSlotsDefinition(hero.tag, hero);
  
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
    if (cleaned) saveHeroSlots();
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
        if (state.heroSlots[hero.tag]) {
          delete state.heroSlots[hero.tag][slot.id];
          saveHeroSlots();
          renderHeroSlots(hero);
          renderHeroList();
          log(`Reset ${formatHeroName(hero.tag)} [${slot.name}] to Default.`, 'info');
        }
      });
    }

    card.addEventListener('click', () => openSlotPickerModal(hero, slot, catalog));
    frag.appendChild(card);
  });

  DOM.slotsGrid.appendChild(frag);

  // Update bottom active set bar
  DOM.asbSetName.textContent = modifiedCount > 0 
    ? `Custom Loadout (${modifiedCount} customized slots)` 
    : 'Default (Valve base)';
}

// Slot Picker Modal
export function openSlotPickerModal(hero, slot, catalog) {
  state.activeModalSlot = { hero, slot, catalog };
  state.activeModalRarityFilter = 'all';

  DOM.slotModalTitle.textContent = `Choose ${slot.name}`;
  DOM.slotModalSlotName.textContent = `${formatHeroName(hero.tag)} · ${slot.name}`;
  DOM.slotModalSearch.value = '';

  // Reset rarity buttons in modal
  const mrfBtns = document.querySelectorAll('.mrf-btn');
  mrfBtns.forEach(btn => {
    btn.classList.toggle('active', btn.dataset.rarity === 'all');
    btn.onclick = () => {
      mrfBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.activeModalRarityFilter = btn.dataset.rarity;
      renderSlotItemsList();
    };
  });

  renderSlotItemsList();
  DOM.slotModal.classList.remove('hidden');
}

export function renderSlotItemsList() {
  if (!state.activeModalSlot) return;
  const { hero, slot, catalog } = state.activeModalSlot;
  const filter = DOM.slotModalSearch.value.toLowerCase().trim();
  const rarityFilter = state.activeModalRarityFilter || 'all';

  const currentSelection = (state.heroSlots[hero.tag] || {})[slot.id];
  const items = catalog.items[slot.id] || [];

  DOM.slotModalList.innerHTML = '';
  const frag = document.createDocumentFragment();

  // 1. Always offer "Default Base Item" (show if filter matches or all)
  if (rarityFilter === 'all' || rarityFilter === 'common') {
    const defaultImg = getItemImage(null, slot.id, hero.tag, hero);
    const defaultRow = document.createElement('div');
    defaultRow.className = `modal-item ${!currentSelection ? 'selected' : ''}`;
    defaultRow.innerHTML = `
      <div class="modal-item-left">
        <div class="modal-item-thumb-box default-thumb-box">
          <img class="modal-item-thumb" src="${defaultImg}" alt="Default Valve Base">
        </div>
        <div class="modal-item-details">
          <div class="modal-item-name">Default (Valve Base)</div>
          <div class="modal-item-tag-row">
            <span class="modal-item-tag default-tag">Official Base Asset</span>
          </div>
        </div>
      </div>
      ${!currentSelection ? '<span class="modal-item-check">✓</span>' : ''}
    `;
    defaultRow.addEventListener('click', () => {
      delete (state.heroSlots[hero.tag] || {})[slot.id];
      saveHeroSlots();
      renderHeroSlots(hero);
      renderHeroList();
      closeSlotModal();
      log(`Reset ${formatHeroName(hero.tag)} [${slot.name}] to Default.`, 'info');
    });
    frag.appendChild(defaultRow);
  }

  // 2. Specific available cosmetic items with own image & rarity badge
  items.filter(it => {
    if (rarityFilter !== 'all') {
      const rKey = getItemRarityKey(it);
      if (rKey !== rarityFilter) return false;
    }
    if (filter) {
      const matchName = it.name.toLowerCase().includes(filter);
      const matchTag = it.tag && it.tag.toLowerCase().includes(filter);
      if (!matchName && !matchTag) return false;
    }
    return true;
  }).forEach(it => {
    const isSelected = currentSelection === it.name;
    const conf = getRarityConfig(it);
    const itImg = getItemImage(it, slot.id, hero.tag, hero);
    const itFallback = generateItemSvg(it, slot.id, hero.tag);

    const row = document.createElement('div');
    row.className = `modal-item ${isSelected ? 'selected' : ''}`;
    row.style.setProperty('--rarity-color', conf.color);
    row.style.setProperty('--rarity-glow', conf.glow);

    row.innerHTML = `
      <div class="modal-item-left">
        <div class="modal-item-thumb-box" style="border-color:${conf.color}; box-shadow: 0 0 10px ${conf.glow}">
          <img class="modal-item-thumb" src="${itImg}" alt="${it.name}" onerror="this.onerror=null; this.src='${itFallback}';">
        </div>
        <div class="modal-item-details">
          <div class="modal-item-name" style="color:${conf.color}">${it.name}</div>
          <div class="modal-item-tag-row">
            <span class="modal-item-tag" style="color:${conf.color}; background:${conf.bg1}; border: 1px solid ${conf.color}44">${it.tag || conf.name}</span>
            ${it.best ? '<span class="modal-item-best-badge">★ Recommended</span>' : ''}
          </div>
        </div>
      </div>
      ${isSelected ? '<span class="modal-item-check">✓</span>' : ''}
    `;

    row.addEventListener('click', () => {
      if (!state.heroSlots[hero.tag]) state.heroSlots[hero.tag] = {};
      state.heroSlots[hero.tag][slot.id] = it.name;
      saveHeroSlots();
      renderHeroSlots(hero);
      renderHeroList();
      closeSlotModal();
      log(`Equipped ${it.name} on ${formatHeroName(hero.tag)} [${slot.name}].`, 'success');
    });

    frag.appendChild(row);
  });

  DOM.slotModalList.appendChild(frag);
}

export function closeSlotModal() {
  DOM.slotModal.classList.add('hidden');
  state.activeModalSlot = null;
}

// Hero Loadout Actions
export function unlockBestSet(hero) {
  const catalog = getHeroSlotsDefinition(hero.tag, hero);
  if (!state.heroSlots[hero.tag]) state.heroSlots[hero.tag] = {};

  catalog.slots.forEach(slot => {
    const available = catalog.items[slot.id] || [];
    const best = available.find(x => x.best) || available[0];
    if (best) {
      state.heroSlots[hero.tag][slot.id] = best.name;
    }
  });

  saveHeroSlots();
  renderHeroSlots(hero);
  renderHeroList();
  log(`Applied complete unlocked set for ${formatHeroName(hero.tag)}!`, 'success');
}

export function resetHeroSlots(hero) {
  if (state.heroSlots[hero.tag]) {
    delete state.heroSlots[hero.tag];
    saveHeroSlots();
    renderHeroSlots(hero);
    renderHeroList();
    log(`Reset all slots for ${formatHeroName(hero.tag)} to default.`, 'info');
  }
}
