import { getCanonicalHero } from '../../shared/constants/heroAliases'
import { Layers, Search } from 'lucide-react'
import { useEffect } from 'react'
import { useAppStore } from '../state/useAppStore'
import { findSetForItem, getHeroSets, getSetEffectiveRarity, isSetEquipped } from '../utils/heroSets'
import { generateItemSvg, getCategorySvg, getItemImage, getItemRarityKey, getRarityConfig } from '../utils/itemImages'
import { formatHeroName } from './slotGenerator'

export const ItemSelectModal = () => {
  const selectedHero = useAppStore((s) => s.selectedHero)
  const activeCatalog = useAppStore((s) => s.activeCatalog)
  const activeModalSlot = useAppStore((s) => s.activeModalSlot)
  const modalRarityFilter = useAppStore((s) => s.modalRarityFilter)
  const modalSearchQuery = useAppStore((s) => s.modalSearchQuery)
  const heroSlots = useAppStore((s) => s.heroSlots)
  const heroActiveStance = useAppStore((s) => s.heroActiveStance)

  const closeSlotModal = useAppStore((s) => s.closeSlotModal)
  const setModalRarityFilter = useAppStore((s) => s.setModalRarityFilter)
  const setModalSearchQuery = useAppStore((s) => s.setModalSearchQuery)
  const setHeroSlot = useAppStore((s) => s.setHeroSlot)
  const equipSet = useAppStore((s) => s.equipSet)
  const resetHeroSlot = useAppStore((s) => s.resetHeroSlot)
  const resetAllHeroSlots = useAppStore((s) => s.resetAllHeroSlots)
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

  const isCompleteSetSlot = activeModalSlot.slot === 'complete_set'
  const query = modalSearchQuery.toLowerCase().trim()
  const currentSlots = heroSlots[selectedHero.tag] || {}

  // Handle stance-specific sets for heroes with personas
  const currentStance = heroActiveStance[selectedHero.tag] || 'default'
  const isPersonaSlotId = (id: string): boolean =>
    id === 'persona' || id === 'persona_selector' || id.startsWith('persona_') || id.includes('_persona_')
  const catalogSlots = activeCatalog.slots ?? []
  const hasPersona = catalogSlots.some((s) => isPersonaSlotId(s.slot) && s.mods.length > 0)
  const showPersona = hasPersona && currentStance === 'persona'

  const heroSets = isCompleteSetSlot ? getHeroSets(selectedHero.tag) : []
  const visibleSets = heroSets.filter((s) => (hasPersona && showPersona ? s.isPersona : !s.isPersona))
  const equippedSet = isCompleteSetSlot ? visibleSets.find((s) => isSetEquipped(s, currentSlots)) : null

  const currentEquippedName = isCompleteSetSlot ? equippedSet?.name : currentSlots[activeModalSlot.slot]
  const items = activeModalSlot.mods || []

  // Check default item visibility
  const isDefaultSelected = !currentEquippedName
  const matchesDefaultFilter = modalRarityFilter === 'all' || modalRarityFilter === 'default'
  const matchesDefaultQuery = !query || 'official base model'.includes(query) || 'default'.includes(query)
  const showDefaultItem = matchesDefaultFilter && matchesDefaultQuery

  const baseThumbSrc = selectedHero.img || getCategorySvg(selectedHero.tag) || `../assets/heroes/${getCanonicalHero(selectedHero.tag)}.png`

  // Filter items (regular slots)
  const filteredItems = isCompleteSetSlot
    ? []
    : items.filter((it) => {
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
          !(it.rarity && it.rarity.toLowerCase().includes(query)) &&
          !conf.name.toLowerCase().includes(query)
        ) {
          return false
        }

        return true
      })

  // Filter sets (complete_set slot)
  const filteredSets = isCompleteSetSlot
    ? visibleSets.filter((s) => {
        const effectiveRarity = getSetEffectiveRarity(s)
        const conf = getRarityConfig({ rarity: effectiveRarity })
        const rarityKey = getItemRarityKey({ rarity: effectiveRarity })

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
          !s.name.toLowerCase().includes(query) &&
          !(s.rarity && s.rarity.toLowerCase().includes(query)) &&
          !effectiveRarity.toLowerCase().includes(query) &&
          !conf.name.toLowerCase().includes(query) &&
          !s.items.some((it) => it.name.toLowerCase().includes(query))
        ) {
          return false
        }

        return true
      })
    : []

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
              {activeModalSlot.title}
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
            placeholder={isCompleteSetSlot ? 'Filter sets by name, rarity, or item...' : 'Filter cosmetics by name or rarity...'}
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

        {/* Modal Item List - Grid */}
        <div id="slotModalList" className="flex-1 overflow-y-auto p-4 grid grid-cols-2 gap-2.5">
          {showDefaultItem && (
            <div
              className={`slot-item-option flex flex-col items-center gap-3 p-2.5 rounded-xl border transition-all cursor-pointer bg-white/5 hover:bg-white/10 ${
                isDefaultSelected ? 'border-purple-500/50 bg-purple-500/10' : 'border-white/5'
              }`}
              onClick={() => {
                if (isCompleteSetSlot) {
                  resetAllHeroSlots(selectedHero.tag)
                  closeSlotModal()
                  addLog(`Reset ${formatHeroName(selectedHero.tag)} loadout to Official Base.`, 'info')
                } else {
                  resetHeroSlot(selectedHero.tag, activeModalSlot.slot)
                  closeSlotModal()
                  addLog(`Reset ${formatHeroName(selectedHero.tag)} [${activeModalSlot.title}] to Official Base.`, 'info')
                }
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

          {/* Complete Sets List */}
          {isCompleteSetSlot &&
            filteredSets.map((s) => {
              const effectiveRarity = getSetEffectiveRarity(s)
              const conf = getRarityConfig({ rarity: effectiveRarity })
              const isSelected = equippedSet?.id === s.id || isSetEquipped(s, currentSlots)
              const itemImg = getItemImage({ name: s.name, img: s.img, rarity: effectiveRarity }, 'set', selectedHero.tag, selectedHero)

              return (
                <div
                  key={s.id}
                  className={`slot-item-option flex flex-col items-center gap-3 p-2.5 rounded-xl border transition-all cursor-pointer bg-white/5 hover:bg-white/10 ${
                    isSelected ? 'border-purple-500/50 bg-purple-500/10' : 'border-white/5'
                  }`}
                  onClick={() => {
                    equipSet(selectedHero.tag, s)
                    closeSlotModal()
                    addLog(`Equipped entire set "${s.name}" on ${formatHeroName(selectedHero.tag)} (${s.items.length} pieces).`, 'success')
                  }}
                >
                  <div
                    className="w-full rounded-lg border flex items-center justify-center shrink-0 overflow-hidden h-44"
                    style={{
                      borderColor: conf.color,
                      boxShadow: `0 0 10px ${conf.glow}`
                    }}
                  >
                    <img
                      src={itemImg}
                      alt={s.name}
                      className="size-full object-contain"
                      onError={(e) => {
                        e.currentTarget.onerror = null
                        e.currentTarget.src = generateItemSvg({ name: s.name, rarity: effectiveRarity }, 'set', selectedHero.tag)
                      }}
                    />
                  </div>

                  <div className="flex-1 min-w-0 flex flex-col gap-1 items-center text-center w-full">
                    <span
                      className="text-sm font-semibold truncate max-w-full"
                      style={{ color: isSelected ? conf.color : 'var(--text-main)' }}
                      title={s.name}
                    >
                      {s.name}
                    </span>
                    <div className="flex items-center gap-1.5 flex-wrap justify-center">
                      <span className="text-[11px]" style={{ color: conf.color }}>
                        {conf.name}
                      </span>
                      <span className="text-[11px] text-slate-400">• {s.items.length} pieces</span>
                    </div>
                    <div className="flex flex-wrap gap-1 mt-1 justify-center max-w-full">
                      {s.items.map((it) => (
                        <span
                          key={it.slot + it.name}
                          className="text-[9px] px-1.5 py-0.5 rounded bg-white/5 text-slate-300 border border-white/5 truncate max-w-28"
                          title={`${it.slot}: ${it.name}`}
                        >
                          <span className="text-slate-400 capitalize">{it.slot}:</span> {it.name}
                        </span>
                      ))}
                    </div>
                  </div>

                  {isSelected && (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-purple-500/20 text-purple-300 border border-purple-500/40 shrink-0">
                      Active
                    </span>
                  )}
                </div>
              )
            })}

          {/* Regular Slot Items List */}
          {!isCompleteSetSlot &&
            filteredItems.map((it) => {
              const conf = getRarityConfig(it)
              const isSelected = currentEquippedName === it.name
              const itemImg = getItemImage(it, activeModalSlot.slot, selectedHero.tag, selectedHero)

              return (
                <div
                  key={it.name}
                  className={`slot-item-option flex flex-col items-center gap-3 p-2.5 rounded-xl border transition-all cursor-pointer bg-white/5 hover:bg-white/10 ${
                    isSelected ? 'border-purple-500/50 bg-purple-500/10' : 'border-white/5'
                  }`}
                  onClick={() => {
                    setHeroSlot(selectedHero.tag, activeModalSlot.slot, it.name)
                    closeSlotModal()
                    addLog(`Equipped ${it.name} on ${formatHeroName(selectedHero.tag)} [${activeModalSlot.title}].`, 'success')
                  }}
                >
                  <div
                    className="w-full rounded-lg border flex items-center justify-center shrink-0 overflow-hidden h-44"
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
                        e.currentTarget.src = generateItemSvg(it, activeModalSlot.slot, selectedHero.tag)
                      }}
                    />
                  </div>

                  <div className="flex-1 min-w-0 flex flex-col gap-1 items-center text-center">
                    <span className="text-sm font-semibold" style={{ color: isSelected ? conf.color : 'var(--text-main)' }} title={it.name}>
                      {it.name}
                    </span>
                    <div className="flex items-center gap-1.5 flex-wrap justify-center">
                      <span className="text-[11px]" style={{ color: conf.color }}>
                        {conf.name}
                      </span>
                    </div>
                    {(() => {
                      const itemSet = findSetForItem(selectedHero.tag, it.name)
                      if (!itemSet) return null
                      return (
                        <button
                          type="button"
                          className="mt-1 flex items-center gap-1 text-[10px] font-semibold text-purple-300 hover:text-white bg-purple-500/15 hover:bg-purple-500/30 border border-purple-500/30 rounded px-2 py-0.5 transition-colors cursor-pointer"
                          title={`Equip all ${itemSet.items.length} pieces of "${itemSet.name}"`}
                          onClick={(e) => {
                            e.stopPropagation()
                            equipSet(selectedHero.tag, itemSet)
                            closeSlotModal()
                          }}
                        >
                          <Layers size={11} />
                          <span>Equip Entire Set</span>
                        </button>
                      )
                    })()}
                  </div>

                  {isSelected && (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-purple-500/20 text-purple-300 border border-purple-500/40 shrink-0">
                      Active
                    </span>
                  )}
                </div>
              )
            })}

          {!showDefaultItem && (isCompleteSetSlot ? filteredSets.length === 0 : filteredItems.length === 0) && (
            <div className="col-span-2 text-center py-8 text-xs text-slate-400">No cosmetics found matching your filter.</div>
          )}
        </div>
      </div>
    </div>
  )
}
