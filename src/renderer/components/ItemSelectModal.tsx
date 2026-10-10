import { Gem, Search, Sparkles } from 'lucide-react'
import { useEffect } from 'react'
import { getCosmeticCustomizationInfo } from '../../shared/constants/arcanaStyles'
import { PRISMATIC_GEMS, getGemByHex } from '../../shared/constants/prismaticGems'
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
  const heroCustomizations = useAppStore((s) => s.heroCustomizations)

  const closeSlotModal = useAppStore((s) => s.closeSlotModal)
  const setModalRarityFilter = useAppStore((s) => s.setModalRarityFilter)
  const setModalSearchQuery = useAppStore((s) => s.setModalSearchQuery)
  const setHeroSlot = useAppStore((s) => s.setHeroSlot)
  const setSlotCustomization = useAppStore((s) => s.setSlotCustomization)
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
  const currentSlotCustomization = heroCustomizations[selectedHero.tag]?.[activeModalSlot.id]
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

        {/* Modal Item List - Grid */}
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
            const customInfo = getCosmeticCustomizationInfo(selectedHero.tag, activeModalSlot.id, it.name)

            const activeStyle = currentSlotCustomization?.style ?? 0
            const activeGemColor = currentSlotCustomization?.gemColor ?? customInfo?.defaultGemColor ?? '#FF3C28'
            const activeGemObj = getGemByHex(activeGemColor)
            const hasCustomOptions = !!(customInfo && (customInfo.hasStyles || customInfo.hasColorGem))

            return (
              <div
                key={it.name}
                className={`slot-item-option flex flex-col items-center gap-3 p-2.5 rounded-xl border transition-all cursor-pointer bg-white/5 hover:bg-white/10 ${
                  isSelected ? 'border-purple-500/50 bg-purple-500/10' : 'border-white/5'
                } ${isSelected && hasCustomOptions ? 'col-span-2' : ''}`}
                onClick={() => {
                  setHeroSlot(selectedHero.tag, activeModalSlot.id, it.name)
                  if (hasCustomOptions) {
                    if (!currentSlotCustomization) {
                      setSlotCustomization(selectedHero.tag, activeModalSlot.id, {
                        style: 0,
                        gemColor: customInfo?.defaultGemColor || '#FF3C28',
                        gemName: customInfo?.defaultGemColor ? getGemByHex(customInfo.defaultGemColor)?.name : undefined
                      })
                    }
                    addLog(
                      `Equipped ${it.name} on ${formatHeroName(selectedHero.tag)} [${activeModalSlot.name}]. Customize styles below.`,
                      'success'
                    )
                  } else {
                    closeSlotModal()
                    addLog(`Equipped ${it.name} on ${formatHeroName(selectedHero.tag)} [${activeModalSlot.name}].`, 'success')
                  }
                }}
              >
                <div
                  className={`w-full rounded-lg border flex items-center justify-center shrink-0 overflow-hidden ${
                    isSelected && hasCustomOptions ? 'h-48' : 'h-44'
                  }`}
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
                  <div className="flex items-center gap-1.5 flex-wrap justify-center">
                    <span className="text-[11px]" style={{ color: conf.color }}>
                      {conf.name}
                    </span>
                    {customInfo?.hasStyles && !isSelected && (
                      <span className="flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium bg-purple-500/20 text-purple-300 border border-purple-500/30">
                        <Sparkles className="size-2.5" />
                        {customInfo.styles.length} Styles
                      </span>
                    )}
                    {customInfo?.hasColorGem && !isSelected && (
                      <span className="flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                        <Gem className="size-2.5" />
                        Gem Ready
                      </span>
                    )}
                  </div>
                </div>

                {isSelected && !hasCustomOptions && (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-purple-500/20 text-purple-300 border border-purple-500/40 shrink-0">
                    Active
                  </span>
                )}

                {/* Arcana Styles Customization Box */}
                {isSelected && customInfo?.hasStyles && (
                  <div
                    className="w-full mt-2 p-3 bg-purple-950/30 border border-purple-500/30 rounded-xl flex flex-col gap-2 text-left"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="flex items-center justify-between">
                      <span className="flex items-center gap-1.5 text-xs font-bold text-purple-300 uppercase tracking-wider">
                        <Sparkles className="size-3.5 text-purple-400" />
                        Unlocked Arcana Styles
                      </span>
                      <span className="text-[11px] text-purple-200/90 font-medium">
                        {customInfo.styles.find((s) => s.index === activeStyle)?.name || `Style ${activeStyle + 1}`}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {customInfo.styles.map((s) => {
                        const isStyleActive = activeStyle === s.index
                        return (
                          <button
                            key={s.index}
                            type="button"
                            onClick={() => {
                              setSlotCustomization(selectedHero.tag, activeModalSlot.id, { style: s.index })
                              addLog(`Selected style "${s.name}" for ${it.name}.`, 'info')
                            }}
                            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                              isStyleActive
                                ? 'bg-linear-to-r from-purple-600 to-indigo-600 text-white shadow-[0_0_12px_rgba(168,85,247,0.5)] border border-purple-400/50 scale-[1.02]'
                                : 'bg-white/5 text-slate-300 hover:bg-white/10 hover:text-white border border-white/10'
                            }`}
                          >
                            {s.name}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )}

                {/* Prismatic Gem Customization Box */}
                {isSelected && customInfo?.hasColorGem && (
                  <div
                    className="w-full mt-2 p-3 bg-cyan-950/30 border border-cyan-500/30 rounded-xl flex flex-col gap-2 text-left"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="flex items-center justify-between">
                      <span className="flex items-center gap-1.5 text-xs font-bold text-cyan-300 uppercase tracking-wider">
                        <Gem className="size-3.5 text-cyan-400" />
                        Prismatic Gem Flame Color
                      </span>
                      <div className="flex items-center gap-2">
                        <span
                          className="w-3.5 h-3.5 rounded-full border border-white/60 shrink-0"
                          style={{ backgroundColor: activeGemColor, boxShadow: `0 0 10px ${activeGemColor}` }}
                        />
                        <span className="text-xs text-cyan-200 font-semibold truncate max-w-35">
                          {activeGemObj?.name || activeGemColor}
                        </span>
                      </div>
                    </div>

                    {/* Palette Swatches */}
                    <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto p-1.5 bg-black/40 rounded-lg border border-white/5">
                      {PRISMATIC_GEMS.map((gem) => {
                        const isGemActive = activeGemColor.toLowerCase() === gem.hex.toLowerCase()
                        return (
                          <button
                            key={gem.id}
                            type="button"
                            title={`${gem.name} (${gem.hex})`}
                            onClick={() => {
                              setSlotCustomization(selectedHero.tag, activeModalSlot.id, {
                                gemColor: gem.hex,
                                gemName: gem.name
                              })
                              addLog(`Set Prismatic Gem to "${gem.name}" (${gem.hex}).`, 'info')
                            }}
                            className={`w-5 h-5 rounded-full border transition-all duration-150 cursor-pointer hover:scale-125 ${
                              isGemActive
                                ? 'border-white ring-2 ring-cyan-400 ring-offset-1 ring-offset-black scale-110 shadow-[0_0_8px_currentColor]'
                                : 'border-black/50 hover:border-white/80'
                            }`}
                            style={{ backgroundColor: gem.hex }}
                          />
                        )
                      })}
                    </div>

                    {/* Custom Color Input */}
                    <div className="flex items-center justify-between gap-2 pt-1 border-t border-white/5">
                      <div className="flex items-center gap-2">
                        <input
                          type="color"
                          value={activeGemColor}
                          onChange={(e) => {
                            const val = e.target.value.toUpperCase()
                            setSlotCustomization(selectedHero.tag, activeModalSlot.id, {
                              gemColor: val,
                              gemName: getGemByHex(val)?.name || 'Custom'
                            })
                          }}
                          className="w-6 h-6 rounded cursor-pointer border border-white/20 bg-transparent"
                          title="Custom Color Picker"
                        />
                        <input
                          type="text"
                          value={activeGemColor}
                          onChange={(e) => {
                            const val = e.target.value.trim()
                            setSlotCustomization(selectedHero.tag, activeModalSlot.id, {
                              gemColor: val,
                              gemName: getGemByHex(val)?.name || 'Custom'
                            })
                          }}
                          className="bg-black/50 border border-white/10 rounded px-2 py-0.5 text-xs text-white uppercase w-24 font-mono tracking-wider focus:outline-none focus:border-cyan-400"
                          maxLength={7}
                        />
                      </div>
                      <span className="text-[11px] text-slate-400 font-medium">Custom Hex / RGB</span>
                    </div>
                  </div>
                )}

                {/* Done Button for Active Customized Items */}
                {isSelected && hasCustomOptions && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      closeSlotModal()
                    }}
                    className="w-full py-1.5 rounded-lg text-xs font-semibold bg-white/10 hover:bg-white/20 text-white border border-white/10 transition-colors text-center cursor-pointer"
                  >
                    Done
                  </button>
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
