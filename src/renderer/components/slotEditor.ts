/**
 * Equipment Slots Editor & Slot Picker Modal Component
 */

import { DOM } from '../utils/dom'
import { state, setHeroSlot, resetHeroSlot, resetAllHeroSlots } from '../state/store'
import { on } from '../state/events'
import { log } from '../utils/logger'
import { formatHeroName, getHeroSlotsDefinition, type HeroSlotsCatalogEntry, type HeroSlot, type SlotItem } from './slotGenerator'
import { getItemImage, getRarityConfig, generateItemSvg, type ItemDescriptor } from '../utils/itemImages'
import type { HeroEntry } from '../env'

let activeCatalog: HeroSlotsCatalogEntry | null = null
let activeModalHero: HeroEntry | null = null
let activeModalSlot: HeroSlot | null = null

export function renderHeroSlots(hero?: HeroEntry | null): void {
  if (!hero) return
  const catalog = getHeroSlotsDefinition(hero.tag, hero)
  activeCatalog = catalog

  // Clean up any stale or non-existent slots for this hero from previous versions
  if (state.heroSlots[hero.tag]) {
    const validSlotIds = new Set(catalog.slots.map((s) => s.id))
    for (const sid of Object.keys(state.heroSlots[hero.tag])) {
      if (!validSlotIds.has(sid)) {
        delete state.heroSlots[hero.tag][sid]
      }
    }
  }

  const currentSlots = state.heroSlots[hero.tag] || {}

  if (!DOM.slotsGrid) return
  DOM.slotsGrid.innerHTML = ''
  const frag = document.createDocumentFragment()

  let modifiedCount = 0

  catalog.slots.forEach((slot) => {
    const selectedItemName = currentSlots[slot.id]
    const isEquipped = !!selectedItemName
    if (isEquipped) modifiedCount++

    const equippedItemObj: ItemDescriptor | null = isEquipped
      ? (catalog.items[slot.id] || []).find((it) => it.name === selectedItemName) || {
          name: selectedItemName,
          tag: 'Custom'
        }
      : null

    const conf = getRarityConfig(equippedItemObj)
    const itemImg = getItemImage(equippedItemObj, slot.id, hero.tag, hero)
    const fallbackSvg = generateItemSvg(equippedItemObj || { name: slot.name, tag: 'default', isDefault: true }, slot.id, hero.tag)

    const card = document.createElement('div')
    card.className = `slot-card ${isEquipped ? 'has-item' : ''}`
    card.setAttribute('data-slot-id', slot.id)

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
        ${
          isEquipped
            ? `
          <button class="slot-quick-reset" title="Reset to default Base" data-reset-slot="${slot.id}">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
          </button>
        `
            : ''
        }
      </div>
    `

    // Quick reset button handler
    const resetBtn = card.querySelector('.slot-quick-reset')
    if (resetBtn) {
      resetBtn.addEventListener('click', (e) => {
        e.stopPropagation()
        resetHeroSlot(hero.tag, slot.id)
        renderHeroSlots(hero)
        log(`Reset ${formatHeroName(hero.tag)} [${slot.name}] to Default.`, 'info')
      })
    }

    card.addEventListener('click', () => openSlotPickerModal(hero, slot, catalog))
    frag.appendChild(card)
  })

  DOM.slotsGrid.appendChild(frag)

  // Update active set bar count
  if (DOM.asbSetName) {
    DOM.asbSetName.textContent =
      modifiedCount > 0 ? `Custom Loadout (${modifiedCount}/${catalog.slots.length} modified)` : 'Default Equipment Loadout'
  }
}

export function openSlotPickerModal(hero: HeroEntry, slot: HeroSlot, catalog: HeroSlotsCatalogEntry): void {
  activeModalHero = hero
  activeModalSlot = slot
  activeCatalog = catalog

  if (DOM.slotModalTitle) DOM.slotModalTitle.textContent = `${formatHeroName(hero.tag)} Equipment`
  if (DOM.slotModalSlotName) DOM.slotModalSlotName.textContent = slot.name
  if (DOM.slotModalSearch) DOM.slotModalSearch.value = ''

  renderSlotItemsList()
  DOM.slotModal?.classList.remove('hidden')
}

export function closeSlotModal(): void {
  DOM.slotModal?.classList.add('hidden')
  activeModalHero = null
  activeModalSlot = null
}

export function renderSlotItemsList(): void {
  if (!activeModalHero || !activeModalSlot || !activeCatalog || !DOM.slotModalList) return

  const query = DOM.slotModalSearch ? DOM.slotModalSearch.value.toLowerCase().trim() : ''
  const currentSlots = state.heroSlots[activeModalHero.tag] || {}
  const currentEquippedName = currentSlots[activeModalSlot.id]

  const items: SlotItem[] = activeCatalog.items[activeModalSlot.id] || []
  DOM.slotModalList.innerHTML = ''
  const frag = document.createDocumentFragment()

  // 1. Default Base Item Entry
  const isDefaultSelected = !currentEquippedName
  const defEntry = document.createElement('div')
  defEntry.className = `slot-item-option ${isDefaultSelected ? 'active' : ''}`
  defEntry.innerHTML = `
    <div class="sio-thumb-box default-thumb">
      <img src="${activeModalHero.img || `../assets/heroes/${activeModalHero.tag.replace(/\s+/g, '_')}.png`}" class="sio-thumb-img" onerror="this.src='../assets/categories/default.svg'">
    </div>
    <div class="sio-meta">
      <div class="sio-name">Official Base Model</div>
      <div class="sio-rarity" style="color: var(--text-muted)">Default</div>
    </div>
    ${isDefaultSelected ? '<span class="sio-equipped-tag">Active</span>' : ''}
  `

  const heroRef = activeModalHero
  const slotRef = activeModalSlot

  defEntry.addEventListener('click', () => {
    resetHeroSlot(heroRef.tag, slotRef.id)
    renderHeroSlots(heroRef)
    closeSlotModal()
    log(`Reset ${formatHeroName(heroRef.tag)} [${slotRef.name}] to Official Base.`, 'info')
  })
  frag.appendChild(defEntry)

  // 2. Official Cosmetic Items
  items.forEach((it) => {
    if (query && !it.name.toLowerCase().includes(query) && !(it.tag && it.tag.toLowerCase().includes(query))) {
      return
    }

    const conf = getRarityConfig(it)
    const itemImg = getItemImage(it, slotRef.id, heroRef.tag, heroRef)
    const isSelected = currentEquippedName === it.name

    const opt = document.createElement('div')
    opt.className = `slot-item-option ${isSelected ? 'active' : ''}`
    opt.innerHTML = `
      <div class="sio-thumb-box" style="border-color:${conf.color}; box-shadow: 0 0 10px ${conf.glow}">
        <img src="${itemImg}" class="sio-thumb-img" onerror="this.onerror=null; this.src='${generateItemSvg(it, slotRef.id, heroRef.tag)}';">
      </div>
      <div class="sio-meta">
        <div class="sio-name" style="color: ${isSelected ? conf.color : 'var(--text-main)'}">${it.name}</div>
        <div class="sio-rarity" style="color: ${conf.color}">${conf.name}</div>
      </div>
      ${isSelected ? '<span class="sio-equipped-tag">Active</span>' : ''}
    `

    opt.addEventListener('click', () => {
      setHeroSlot(heroRef.tag, slotRef.id, it.name)
      renderHeroSlots(heroRef)
      closeSlotModal()
      log(`Equipped ${it.name} on ${formatHeroName(heroRef.tag)} [${slotRef.name}].`, 'success')
    })

    frag.appendChild(opt)
  })

  DOM.slotModalList.appendChild(frag)
}

export function unlockBestSet(hero: HeroEntry): void {
  const catalog = getHeroSlotsDefinition(hero.tag, hero)
  let count = 0

  catalog.slots.forEach((slot) => {
    const items = catalog.items[slot.id] || []
    const bestItem = items.find((it) => it.best) || items[0]
    if (bestItem) {
      setHeroSlot(hero.tag, slot.id, bestItem.name)
      count++
    }
  })

  renderHeroSlots(hero)
  log(`Equipped best cosmetics set for ${formatHeroName(hero.tag)} (${count} slots).`, 'success')
}

export function resetHeroSlots(hero: HeroEntry): void {
  resetAllHeroSlots(hero.tag)
  renderHeroSlots(hero)
  log(`Reset all slots for ${formatHeroName(hero.tag)} to default.`, 'info')
}

// Listen to hero selection event to automatically render slots
on<HeroEntry>('hero:selected', (hero) => {
  renderHeroSlots(hero)
})
