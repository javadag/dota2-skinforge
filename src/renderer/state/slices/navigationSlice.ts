import type { StateCreator } from 'zustand'
import type { CategoryKey } from '../../../data/categoryMeta'
import type { HeroAttribute } from '../../../shared/constants/attributes'
import { getHeroSlotsDefinition, type ArmorySlot } from '../../components/slotGenerator'
import type { HeroEntry } from '../../env'
import type { AppStoreState } from '../useAppStore'

export type AppTab = 'heroes' | 'presets' | 'launch' | 'settings' | 'about'
export type AttributeFilter = 'all' | HeroAttribute
export type CategoryGroup = CategoryKey

export interface NavigationSlice {
  // Navigation & Filtering State
  activeTab: AppTab
  activeCategoryGroup: CategoryGroup
  attrFilter: AttributeFilter
  searchQuery: string

  // Modals & Panels State
  activeModalSlot: ArmorySlot | null
  modalRarityFilter: string
  modalSearchQuery: string
  isPresetModalOpen: boolean
  patchAlertVisible: boolean
  isConsoleOpen: boolean
  isUpdateModalOpen: boolean
  isBugReportOpen: boolean

  // Navigation Actions
  setTab: (tab: AppTab, category?: CategoryGroup | null) => void
  setCategoryGroup: (group: CategoryGroup) => void
  setAttrFilter: (attr: AttributeFilter) => void
  setSearchQuery: (query: string) => void

  // Modal Actions
  openSlotModal: (hero: HeroEntry, slot: ArmorySlot) => void
  closeSlotModal: () => void
  setModalRarityFilter: (rarity: string) => void
  setModalSearchQuery: (query: string) => void
  openPresetModal: () => void
  closePresetModal: () => void
  toggleConsole: () => void
  setPatchAlertVisible: (visible: boolean) => void
  setUpdateModalOpen: (open: boolean) => void
  setBugReportOpen: (open: boolean) => void
}

export const createNavigationSlice: StateCreator<AppStoreState, [], [], NavigationSlice> = (set) => ({
  activeTab: 'heroes',
  activeCategoryGroup: 'hero',
  attrFilter: 'all',
  searchQuery: '',

  activeModalSlot: null,
  modalRarityFilter: 'all',
  modalSearchQuery: '',
  isPresetModalOpen: false,
  patchAlertVisible: false,
  isConsoleOpen: false,
  isUpdateModalOpen: false,
  isBugReportOpen: false,

  setTab: (tab, category = null) => {
    set((state) => ({
      activeTab: tab,
      activeCategoryGroup: category ?? (tab === 'heroes' ? state.activeCategoryGroup : 'hero')
    }))
  },

  setCategoryGroup: (group) => {
    set({ activeCategoryGroup: group, activeTab: 'heroes' })
  },

  setAttrFilter: (attr) => set({ attrFilter: attr }),

  setSearchQuery: (query) => set({ searchQuery: query }),

  openSlotModal: (hero, slot) => {
    const armory = getHeroSlotsDefinition(hero.tag, hero)
    set({
      selectedHero: hero,
      activeArmory: armory,
      activeModalSlot: slot,
      modalRarityFilter: 'all',
      modalSearchQuery: ''
    })
  },

  closeSlotModal: () => {
    set({ activeModalSlot: null, modalSearchQuery: '' })
  },

  setModalRarityFilter: (rarity) => set({ modalRarityFilter: rarity }),

  setModalSearchQuery: (query) => set({ modalSearchQuery: query }),

  openPresetModal: () => set({ isPresetModalOpen: true }),

  closePresetModal: () => set({ isPresetModalOpen: false }),

  toggleConsole: () => set((state) => ({ isConsoleOpen: !state.isConsoleOpen })),

  setPatchAlertVisible: (visible) => set({ patchAlertVisible: visible }),

  setUpdateModalOpen: (open: boolean) => set({ isUpdateModalOpen: open }),

  setBugReportOpen: (open: boolean) => set({ isBugReportOpen: open })
})
