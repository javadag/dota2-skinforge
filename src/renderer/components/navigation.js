/**
 * Sidebar Navigation & View Routing Controller
 */

import { DOM } from '../utils/dom.js';
import { state } from '../state/store.js';
import { CATEGORY_META } from '../../data/categoryMeta.js';
import { renderHeroList } from './heroList.js';
import { renderPresetsList } from './presetsView.js';

export function updateTopbarForCategory(group) {
  const meta = CATEGORY_META[group] || CATEGORY_META.hero;
  DOM.topbarTitle.textContent = meta.title;
  DOM.topbarSub.textContent = meta.sub;
}

export function switchTab(tabId, category = null) {
  state.activeTab = tabId;
  if (category) {
    state.activeCategoryGroup = category;
  }

  DOM.navButtons.forEach(btn => {
    if (btn.dataset.tab === 'heroes') {
      const btnCat = btn.dataset.category || 'hero';
      btn.classList.toggle('active', tabId === 'heroes' && btnCat === state.activeCategoryGroup);
    } else {
      btn.classList.toggle('active', btn.dataset.tab === tabId);
    }
  });

  DOM.tabSections.forEach(section => {
    section.classList.remove('active');
  });

  const activeSection = document.getElementById(`tab${tabId.charAt(0).toUpperCase() + tabId.slice(1)}`);
  if (activeSection) {
    activeSection.classList.add('active');
  }

  // Update Topbar Title
  if (tabId === 'heroes') {
    updateTopbarForCategory(state.activeCategoryGroup);
    renderHeroList();
  } else {
    const appName = (window.appInfo && window.appInfo.name) || 'Dota 2 SkinForge';
    const titles = {
      presets: { title: 'Cosmetic Presets', sub: 'Manage and quickly apply full loadout presets' },
      launch: { title: 'Steam Launch Options', sub: 'Tweak launch flags for optimal FPS and engine startup' },
      settings: { title: 'Preferences & Storage', sub: 'Configure game directories and automation rules' },
      about: { title: `About ${appName}`, sub: 'Architecture and safety guarantees' }
    };
    const current = titles[tabId] || titles.presets;
    DOM.topbarTitle.textContent = current.title;
    DOM.topbarSub.textContent = current.sub;
  }

  if (tabId === 'presets') renderPresetsList();
}

export function setupNavigation() {
  DOM.navButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.tab;
      const category = btn.dataset.category;
      if (tab === 'heroes' && category) {
        state.activeCategoryGroup = category;
      }
      switchTab(tab, category);
    });
  });
}
