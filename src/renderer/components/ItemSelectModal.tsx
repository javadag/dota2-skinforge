import React, { useEffect } from 'react'
import { Search } from 'lucide-react'
import { formatHeroName } from './slotGenerator'
import {
  getItemImage,
  getRarityConfig,
  getItemRarityKey,
  generateItemSvg,
  getCategorySvg
} from '../utils/itemImages'
import { useAppStore } from '../state/useAppStore'

export const ItemSelectModal: React.FC = () => {
  const selectedHero = useAppStore((s) => s.selectedHero)
  const activeCatalog = useAppStore((s) => s.activeCatalog)
  const activeModalSlot = useAppStore((s) => s.activeModalSlot)
  const modalRarityFilter = useAppStore((s) => s.modalRarityFilter)
  const modalSearchQuery = useAppStore((s) => s.modalSearchQuery)
  const heroSlots = useAppStore((s) => s.heroSlots)

  const closeSlotModal = useAppStore((s) => s.closeSlotModal)
  const setModalRarityFilter = useAppStore((s) => s.setModalRarityFilter)
  const setModalSearchQuery = useAppStore((s) => s.setModalSearchQuery)
  const setHeroSlot = useAppStore((s) => s.setHeroSlot)
  const resetHeroSlot = useAppStore((s) => s.resetHeroSlot)
  const addLog = useAppStore((s) => s.addLog)

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && activeModalSlot) {
        closeSlotModal()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [activeModalSlot, closeSlotModal])

  if (!activeModalSlot || !selectedHero || !activeCatalog) {
    return (
      <div id="slotModal" className="modal-overlay hidden">
        <div className="modal-box" />
      </div>
    )
  }

  const query = modalSearchQuery.toLowerCase().trim()
  const currentSlots = heroSlots[selectedHero.tag] || {}
  const currentEquippedName = currentSlots[activeModalSlot.id]
  const items = activeCatalog.items[activeModalSlot.id] || []

  // Check default item visibility
  const isDefaultSelected = !currentEquippedName
  const matchesDefaultFilter = modalRarityFilter === 'all' || modalRarityFilter === 'default'
  const matchesDefaultQuery = !query || 'official base model'.includes(query) || 'default'.includes(query)
  const showDefaultItem = matchesDefaultFilter && matchesDefaultQuery

  const baseThumbSrc =
    selectedHero.img ||
    getCategorySvg(selectedHero.tag) ||
    `../assets/heroes/${selectedHero.tag.replace(/\s+/g, '_')}.png`

  // Filter items
  const filteredItems = items.filter((it) => {
    const conf = getRarityConfig(it)
    const rarityKey = getItemRarityKey(it)

    if (modalRarityFilter !== 'all') {
      if (modalRarityFilter === 'immortal') {
        if (rarityKey !== 'immortal') return false
      } else if (modalRarityFilter === 'common') {
        if (rarityKey !== 'common' && rarityKey !== 'uncommon') return false
      } else {
        if (rarityKey !== modalRarityFilter) return false
      }
    }

    if (
      query &&
      !it.name.toLowerCase().includes(query) &&
      !(it.tag && it.tag.toLowerCase().includes(query)) &&
      !conf.name.toLowerCase().includes(query)
    ) {
      return false
    }

    return true
  })

  const rarities = ['all', 'arcana', 'persona', 'immortal', 'mythical', 'legendary', 'rare', 'common']

  return (
    <div
      id="slotModal"
      className="modal-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) closeSlotModal()
      }}
    >
      <div className="modal-box">
        <div className="modal-header">
          <div>
            <h3 id="slotModalTitle" className="modal-title">
              {formatHeroName(selectedHero.tag)} Equipment
            </h3>
            <div id="slotModalSlotName" className="modal-slot-badge">
              {activeModalSlot.name}
            </div>
          </div>
          <button id="slotModalClose" className="modal-close-btn" onClick={closeSlotModal}>
            ×
          </button>
        </div>

        {/* Search Row */}
        <div className="modal-search-row">
          <Search className="search-ico" />
          <input
            type="text"
            id="slotModalSearch"
            placeholder="Filter cosmetics by name or rarity..."
            autoComplete="off"
            value={modalSearchQuery}
            onChange={(e) => setModalSearchQuery(e.target.value)}
          />
        </div>

        {/* Rarity Filters Bar */}
        <div className="modal-rarity-filters" id="modalRarityFilters">
          {rarities.map((r) => (
            <button
              key={r}
              className={`mrf-btn ${modalRarityFilter === r ? 'active' : ''}`}
              data-rarity={r}
              onClick={() => setModalRarityFilter(r)}
            >
              {r.charAt(0).toUpperCase() + r.slice(1)}
            </button>
          ))}
        </div>

        {/* Modal Item List */}
        <div id="slotModalList" className="modal-item-list">
          {showDefaultItem && (
            <div
              className={`slot-item-option ${isDefaultSelected ? 'active' : ''}`}
              onClick={() => {
                resetHeroSlot(selectedHero.tag, activeModalSlot.id)
                closeSlotModal()
                addLog(
                  `Reset ${formatHeroName(selectedHero.tag)} [${activeModalSlot.name}] to Official Base.`,
                  'info'
                )
              }}
            >
              <div className="sio-thumb-box default-thumb">
                <img
                  src={baseThumbSrc}
                  alt="Official Base Model"
                  className="sio-thumb-img"
                  onError={(e) => {
                    e.currentTarget.onerror = null
                    e.currentTarget.src = '../assets/categories/default.svg'
                  }}
                />
              </div>
              <div className="sio-meta">
                <div className="sio-name" title="Official Base Model">
                  Official Base Model
                </div>
                <div className="sio-rarity" style={{ color: 'var(--text-muted)' }}>
                  Default
                </div>
              </div>
              {isDefaultSelected && <span className="sio-equipped-tag">Active</span>}
            </div>
          )}

          {filteredItems.map((it) => {
            const conf = getRarityConfig(it)
            const isSelected = currentEquippedName === it.name
            const itemImg = getItemImage(it, activeModalSlot.id, selectedHero.tag, selectedHero)

            return (
              <div
                key={it.name}
                className={`slot-item-option ${isSelected ? 'active' : ''}`}
                onClick={() => {
                  setHeroSlot(selectedHero.tag, activeModalSlot.id, it.name)
                  closeSlotModal()
                  addLog(
                    `Equipped ${it.name} on ${formatHeroName(selectedHero.tag)} [${activeModalSlot.name}].`,
                    'success'
                  )
                }}
              >
                <div
                  className="sio-thumb-box"
                  style={{
                    borderColor: conf.color,
                    boxShadow: `0 0 10px ${conf.glow}`
                  }}
                >
                  <img
                    src={itemImg}
                    alt={it.name}
                    className="sio-thumb-img"
                    onError={(e) => {
                      e.currentTarget.onerror = null
                      e.currentTarget.src = generateItemSvg(it, activeModalSlot.id, selectedHero.tag)
                    }}
                  />
                </div>
                <div className="sio-meta">
                  <div
                    className="sio-name"
                    style={{ color: isSelected ? conf.color : 'var(--text-main)' }}
                    title={it.name}
                  >
                    {it.name}
                  </div>
                  <div className="sio-rarity" style={{ color: conf.color }}>
                    {conf.name}
                  </div>
                </div>
                {isSelected && <span className="sio-equipped-tag">Active</span>}
              </div>
            )
          })}

          {!showDefaultItem && filteredItems.length === 0 && (
            <div className="modal-empty-state">No cosmetics found matching your filter.</div>
          )}
        </div>
      </div>
    </div>
  )
}
