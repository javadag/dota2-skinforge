import { Search } from 'lucide-react'
import { useEffect } from 'react'
import { useAppStore } from '../state/useAppStore'
import { generateItemSvg, getCategorySvg, getItemImage, getItemRarityKey, getRarityConfig } from '../utils/itemImages'
import { formatHeroName } from './slotGenerator'

export const ItemSelectModal = () => {
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
    return <div id="slotModal" className="hidden" />
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
    selectedHero.img || getCategorySvg(selectedHero.tag) || `../assets/heroes/${selectedHero.tag.replace(/\s+/g, '_')}.png`

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
      className="fixed inset-0 z-50 bg-black/75 backdrop-blur-md flex items-center justify-center p-6"
      onClick={(e) => {
        if (e.target === e.currentTarget) closeSlotModal()
      }}
    >
      <div className="w-full max-w-2xl max-h-[85vh] bg-bg-surface border border-white/10 rounded-2xl shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-white/5">
          <div>
            <h3 id="slotModalTitle" className="text-base font-bold text-white">
              {formatHeroName(selectedHero.tag)} Equipment
            </h3>
            <div id="slotModalSlotName" className="text-[11px] font-semibold text-cyan-400 uppercase tracking-wider mt-0.5">
              {activeModalSlot.name}
            </div>
          </div>
          <button
            id="slotModalClose"
            className="text-slate-400 hover:text-white text-2xl px-2 leading-none cursor-pointer transition-colors"
            onClick={closeSlotModal}
          >
            ×
          </button>
        </div>

        {/* Search Row */}
        <div className="p-4 border-b border-white/5 relative flex items-center">
          <Search className="size-4 text-slate-400 absolute left-7 pointer-events-none" />
          <input
            type="text"
            id="slotModalSearch"
            className="w-full bg-white/5 border border-white/10 rounded-lg pl-9 pr-3 py-2 text-xs text-white placeholder-slate-400 outline-none focus:border-purple-500/50 transition-colors"
            placeholder="Filter cosmetics by name or rarity..."
            autoComplete="off"
            value={modalSearchQuery}
            onChange={(e) => setModalSearchQuery(e.target.value)}
          />
        </div>

        {/* Rarity Filters Bar */}
        <div className="flex items-center gap-1.5 px-4 py-1.5 border-b border-white/5">
          {rarities.map((r) => (
            <button
              key={r}
              className={`px-2.5 py-1 rounded-full text-[11px] font-semibold border transition-all cursor-pointer whitespace-nowrap ${
                modalRarityFilter === r
                  ? 'active bg-purple-500/25 text-white border-purple-500/50 shadow-[0_0_8px_rgba(139,92,246,0.3)]'
                  : 'bg-white/5 text-slate-400 border-white/5 hover:text-white hover:bg-white/10'
              }`}
              data-rarity={r}
              onClick={() => setModalRarityFilter(r)}
            >
              {r.charAt(0).toUpperCase() + r.slice(1)}
            </button>
          ))}
        </div>

        {/* Modal Item List - 2 Columns Grid */}
        <div id="slotModalList" className="flex-1 overflow-y-auto p-4 grid grid-cols-2 gap-2.5">
          {showDefaultItem && (
            <div
              className={`slot-item-option flex flex-col items-center gap-3 p-2.5 rounded-xl border transition-all cursor-pointer bg-white/5 hover:bg-white/10 ${
                isDefaultSelected ? 'border-purple-500/50 bg-purple-500/10' : 'border-white/5'
              }`}
              onClick={() => {
                resetHeroSlot(selectedHero.tag, activeModalSlot.id)
                closeSlotModal()
                addLog(`Reset ${formatHeroName(selectedHero.tag)} [${activeModalSlot.name}] to Official Base.`, 'info')
              }}
            >
              <div className="w-full h-44 rounded-lg border border-white/10 bg-white/5 flex items-center justify-center shrink-0 overflow-hidden">
                <img
                  src={baseThumbSrc}
                  alt="Official Base Model"
                  className="w-full h-full object-contain"
                  onError={(e) => {
                    e.currentTarget.onerror = null
                    e.currentTarget.src = '../assets/categories/default.svg'
                  }}
                />
              </div>
              <div className="flex-1 min-w-0 flex flex-col gap-1 items-center text-center">
                <div className="text-xs font-semibold text-white truncate" title="Official Base Model">
                  Official Base Model
                </div>
                <div className="text-[11px] text-slate-400">Default</div>
              </div>
              {isDefaultSelected && (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-purple-500/20 text-purple-300 border border-purple-500/40 shrink-0">
                  Active
                </span>
              )}
            </div>
          )}

          {filteredItems.map((it) => {
            const conf = getRarityConfig(it)
            const isSelected = currentEquippedName === it.name
            const itemImg = getItemImage(it, activeModalSlot.id, selectedHero.tag, selectedHero)

            return (
              <div
                key={it.name}
                className={`slot-item-option flex flex-col items-center gap-3 p-2.5 rounded-xl border transition-all cursor-pointer bg-white/5 hover:bg-white/10 ${
                  isSelected ? 'border-purple-500/50 bg-purple-500/10' : 'border-white/5'
                }`}
                onClick={() => {
                  setHeroSlot(selectedHero.tag, activeModalSlot.id, it.name)
                  closeSlotModal()
                  addLog(`Equipped ${it.name} on ${formatHeroName(selectedHero.tag)} [${activeModalSlot.name}].`, 'success')
                }}
              >
                <div
                  className="w-full rounded-lg border flex items-center justify-center shrink-0 overflow-hidden"
                  style={{
                    borderColor: conf.color,
                    boxShadow: `0 0 10px ${conf.glow}`
                  }}
                >
                  <img
                    src={itemImg}
                    alt={it.name}
                    className="size-full object-contain"
                    onError={(e) => {
                      e.currentTarget.onerror = null
                      e.currentTarget.src = generateItemSvg(it, activeModalSlot.id, selectedHero.tag)
                    }}
                  />
                </div>
                <div className="flex-1 min-w-0 flex flex-col gap-1 items-center text-center">
                  <span className="text-sm font-semibold" style={{ color: isSelected ? conf.color : 'var(--text-main)' }} title={it.name}>
                    {it.name}
                  </span>
                  <span className="text-[11px]" style={{ color: conf.color }}>
                    {conf.name}
                  </span>
                </div>
                {isSelected && (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-purple-500/20 text-purple-300 border border-purple-500/40 shrink-0">
                    Active
                  </span>
                )}
              </div>
            )
          })}

          {!showDefaultItem && filteredItems.length === 0 && (
            <div className="col-span-2 text-center py-8 text-xs text-slate-400">No cosmetics found matching your filter.</div>
          )}
        </div>
      </div>
    </div>
  )
}
