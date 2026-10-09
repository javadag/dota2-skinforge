import { DOM } from './dom.js';
import { state } from './state.js';
import { getHeroAttribute, getAttrLabel } from '../data/attributes.js';
import { CATEGORY_META } from '../data/categoryMeta.js';
import { formatHeroName } from './slotGenerator.js';
import { renderHeroSlots } from './slotEditor.js';

// Hero & Category List & Selection
export function renderHeroList() {
  const query = state.searchQuery.toLowerCase().trim();
  const attr = state.attrFilter;
  const catGroup = state.activeCategoryGroup;

  // Toggle visibility of attribute filters bar: only show if category is hero
  if (DOM.heroAttrFilters) {
    DOM.heroAttrFilters.style.display = (catGroup === 'hero') ? 'flex' : 'none';
  }

  const filtered = state.heroes.filter(h => {
    const itemGroup = h.g || 'hero';

    // Group filter: if catGroup is not 'all', constrain to group
    if (catGroup !== 'all') {
      if (catGroup === 'hero' && itemGroup !== 'hero') return false;
      if (catGroup !== 'hero' && itemGroup !== catGroup) return false;
    }

    // Hero attribute filter (applies when viewing Heroes)
    if (itemGroup === 'hero' && catGroup === 'hero') {
      const heroAttr = getHeroAttribute(h.tag);
      if (attr !== 'all' && heroAttr !== attr) return false;
    }

    if (query) {
      const matchName = h.tag.toLowerCase().includes(query) || formatHeroName(h.tag).toLowerCase().includes(query);
      const matchAlias = h.alias && h.alias.some(a => a.toLowerCase().includes(query));
      if (!matchName && !matchAlias) return false;
    }
    return true;
  });

  DOM.heroListScroll.innerHTML = '';
  const frag = document.createDocumentFragment();

  filtered.forEach(h => {
    const isHero = !h.g || h.g === 'hero';
    const heroAttr = getHeroAttribute(h.tag);
    const item = document.createElement('div');
    const isSelected = state.selectedHero && state.selectedHero.tag === h.tag;
    const heroModCount = Object.keys(state.heroSlots[h.tag] || {}).length;

    item.className = `hero-list-item ${isSelected ? 'active' : ''} ${heroModCount > 0 ? 'has-modded-slots' : ''}`;
    
    // Fallback image path
    const imgSrc = h.img || (isHero ? `../assets/heroes/${h.tag.replace(/\s+/g, '_')}.png` : `../assets/categories/default.svg`);
    const thumbClass = isHero ? 'hero-item-thumb' : 'hero-item-thumb is-category';

    const subHtml = isHero 
      ? `<span class="hero-attr-dot ${heroAttr}"></span><span>${getAttrLabel(heroAttr)}</span>`
      : `<span style="font-size:12px;">${(CATEGORY_META[h.g] || {}).icon || '✨'}</span><span>${(CATEGORY_META[h.g] || {}).name || 'Item'}</span>`;

    item.innerHTML = `
      <img src="${imgSrc}" class="${thumbClass}" onerror="this.src='../assets/categories/default.svg'">
      <div class="hero-item-meta">
        <span class="hero-item-name">${formatHeroName(h.tag)}</span>
        <div class="hero-item-sub">
          ${subHtml}
        </div>
      </div>
      <span class="hero-item-badge">${heroModCount > 0 ? `${heroModCount} slots` : `${h.mods || '★'}`}</span>
    `;

    item.addEventListener('click', () => selectHero(h));
    frag.appendChild(item);
  });

  DOM.heroListScroll.appendChild(frag);
}

export function selectHero(hero) {
  state.selectedHero = hero;
  renderHeroList();

  DOM.hspEmpty.classList.add('hidden');
  DOM.hspContent.classList.remove('hidden');

  const isHero = !hero.g || hero.g === 'hero';
  const heroAttr = getHeroAttribute(hero.tag);
  const imgSrc = hero.img || (isHero ? `../assets/heroes/${hero.tag.replace(/\s+/g, '_')}.png` : `../assets/categories/default.svg`);

  DOM.hspHeroImg.src = imgSrc;
  DOM.hspHeroImg.className = isHero ? 'hsp-hero-portrait' : 'hsp-hero-portrait is-category';
  DOM.hspHeroName.textContent = formatHeroName(hero.tag);

  if (isHero) {
    DOM.hspHeroAttr.className = `hsp-hero-attr-badge ${heroAttr}`;
    DOM.hspHeroAttr.textContent = getAttrLabel(heroAttr);
  } else {
    const meta = CATEGORY_META[hero.g] || { badge: 'Cosmetic', name: 'Item' };
    DOM.hspHeroAttr.className = `hsp-hero-attr-badge int`;
    DOM.hspHeroAttr.textContent = meta.name;
  }

  renderHeroSlots(hero);
}
