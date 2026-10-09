/**
 * Sidebar Navigation & View Routing Controller
 */

import { CATEGORY_META, isCategoryKey } from '../../data/categoryMeta'
import { state, type AppTab, type CategoryGroup } from '../state/store'
import { DOM } from '../utils/dom'
import { renderHeroList } from './heroList'
import { renderPresetsList } from './presetsView'

export function updateTopbarForCategory(group: CategoryGroup): void {
  const meta = CATEGORY_META[group] || CATEGORY_META.hero
  if (DOM.topbarTitle) DOM.topbarTitle.textContent = meta.title
  if (DOM.topbarSub) DOM.topbarSub.textContent = meta.sub
}

export function switchTab(tabId: AppTab, category: CategoryGroup | null = null): void {
  state.activeTab = tabId
  if (category) {
    state.activeCategoryGroup = category
  }

  DOM.navButtons.forEach((btn) => {
    if (btn.dataset.tab === 'heroes') {
      const btnCat = btn.dataset.category || 'hero'
      btn.classList.toggle('active', tabId === 'heroes' && btnCat === state.activeCategoryGroup)
    } else {
      btn.classList.toggle('active', btn.dataset.tab === tabId)
    }
  })

  DOM.tabSections.forEach((section) => {
    section.classList.remove('active')
  })

  const activeSection = document.getElementById(`tab${tabId.charAt(0).toUpperCase() + tabId.slice(1)}`)
  if (activeSection) {
    activeSection.classList.add('active')
  }

  // Update Topbar Title
  if (tabId === 'heroes') {
    updateTopbarForCategory(state.activeCategoryGroup)
    renderHeroList()
  } else {
    const appName = (window.appInfo && window.appInfo.name) || 'Dota 2 SkinForge'
    const titles: Record<Exclude<AppTab, 'heroes'>, { title: string; sub: string }> = {
      presets: { title: 'Cosmetic Presets', sub: 'Manage and quickly apply full loadout presets' },
      launch: {
        title: 'Steam Launch Options',
        sub: 'Tweak launch flags for optimal FPS and engine startup'
      },
      settings: {
        title: 'Preferences & Storage',
        sub: 'Configure game directories and automation rules'
      },
      about: { title: `About ${appName}`, sub: 'Architecture and safety guarantees' }
    }
    const current = titles[tabId]
    if (DOM.topbarTitle) DOM.topbarTitle.textContent = current.title
    if (DOM.topbarSub) DOM.topbarSub.textContent = current.sub
  }

  if (tabId === 'presets') renderPresetsList()
}

function isAppTab(value: string): value is AppTab {
  return ['heroes', 'presets', 'launch', 'settings', 'about'].includes(value)
}

export function setupNavigation(): void {
  DOM.navButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      const tabStr = btn.dataset.tab || 'heroes'
      const catStr = btn.dataset.category || null
      const tab: AppTab = isAppTab(tabStr) ? tabStr : 'heroes'
      const category: CategoryGroup | null = catStr && isCategoryKey(catStr) ? catStr : null

      if (tab === 'heroes' && category) {
        state.activeCategoryGroup = category
      }
      switchTab(tab, category)
    })
  })
}
