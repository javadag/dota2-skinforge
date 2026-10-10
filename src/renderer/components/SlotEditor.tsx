import { Sparkles, X } from 'lucide-react'
import React from 'react'
import { CATEGORY_META, isCategoryKey } from '../../data/categoryMeta'
import { useAppStore } from '../state/useAppStore'
import { getAttrLabel, getHeroAttribute } from '../utils/attributes'
import { getItemImage, getRarityConfig, getSlotImage, type ItemDescriptor } from '../utils/itemImages'
import { formatHeroName, getHeroSlotsDefinition } from './slotGenerator'
import { Button } from './ui/Button'

const fallbackHeroSvg =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><rect width="40" height="40" rx="6" fill="#141a29"/><text x="20" y="25" fill="#64748b" font-size="16" text-anchor="middle">?</text></svg>'
  )

export const SlotEditor: React.FC = () => {
  const selectedHero = useAppStore((s) => s.selectedHero)
  const heroSlots = useAppStore((s) => s.heroSlots)
  const resetAllHeroSlots = useAppStore((s) => s.resetAllHeroSlots)
  const resetHeroSlot = useAppStore((s) => s.resetHeroSlot)
  const openSlotModal = useAppStore((s) => s.openSlotModal)
  const openPresetModal = useAppStore((s) => s.openPresetModal)

  if (!selectedHero) {
    return (
      <div className="flex-1 h-full overflow-y-auto p-6 flex flex-col" id="heroSlotPanel">
        <div className="m-auto flex flex-col items-center justify-center text-center p-12 text-slate-400" id="hspEmpty">
          <div className="w-16 h-16 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center mb-4">
            <Sparkles className="w-8 h-8 text-purple-400/80" />
          </div>
          <h3 id="hspEmptyTitle" className="text-base font-bold text-white mb-1">
            Select an Item or Hero
          </h3>
          <p id="hspEmptyDesc" className="text-xs text-slate-400 max-w-sm">
            Pick any hero, creep, courier, music pack or weather effect to configure cosmetics
          </p>
        </div>
      </div>
    )
  }

  const isHero = !selectedHero.g || selectedHero.g === 'hero'
  const heroAttr = getHeroAttribute(selectedHero.tag)
  const heroImg =
    selectedHero.img || (isHero ? `../assets/heroes/${selectedHero.tag.replace(/\s+/g, '_')}.png` : '../assets/categories/default.svg')
  const catMeta = selectedHero.g && isCategoryKey(selectedHero.g) ? CATEGORY_META[selectedHero.g] : null

  const catalog = getHeroSlotsDefinition(selectedHero.tag, selectedHero)
  const currentSlots = heroSlots[selectedHero.tag] || {}

  let modifiedCount = 0
  catalog.slots.forEach((s) => {
    if (currentSlots[s.id]) modifiedCount++
  })

  return (
    <div className="flex-1 h-full overflow-y-auto p-6 flex flex-col gap-6" id="heroSlotPanel">
      <div className="flex flex-col gap-6">
        {/* Hero Header */}
        <div className="flex items-center gap-5 p-3 rounded-xl bg-white/5 border border-white/10 backdrop-blur-sm">
          <img
            id="hspHeroImg"
            src={heroImg}
            alt={selectedHero.tag}
            className="w-28 rounded-lg object-cover border-2 border-white/15 shadow-xl shrink-0"
            onError={(e) => {
              e.currentTarget.onerror = null
              e.currentTarget.src = fallbackHeroSvg
            }}
          />
          <div className="flex-1 flex gap-2 min-w-0">
            <h2 id="hspHeroName" className="text-xl font-extrabold text-white tracking-tight truncate">
              {formatHeroName(selectedHero.tag)}
            </h2>
            <div
              id="hspHeroAttr"
              className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold text-slate-300 bg-white/5 border border-white/10 w-fit"
            >
              {isHero ? (
                <>
                  <span
                    className={`w-2 h-2 rounded-full ${heroAttr === 'str' ? 'bg-red-500' : heroAttr === 'agi' ? 'bg-emerald-400' : heroAttr === 'int' ? 'bg-cyan-400' : 'bg-purple-400'}`}
                  />
                  <span>{getAttrLabel(heroAttr)} Hero</span>
                </>
              ) : (
                <span>{catMeta ? catMeta.name : 'Cosmetic Category'}</span>
              )}
            </div>
            <Button variant="ghost" className="ml-auto mr-0" size="sm" onClick={() => resetAllHeroSlots(selectedHero.tag)}>
              <span>Reset to Default</span>
            </Button>
          </div>
        </div>

        {/* Slot Grid */}
        <div className="flex flex-col gap-3">
          <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">Equipment Slots</h4>
          <div id="slotsGrid" className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {catalog.slots.map((slot) => {
              const selectedItemName = currentSlots[slot.id]
              const isEquipped = !!selectedItemName

              const equippedItemObj: ItemDescriptor | null = isEquipped
                ? (catalog.items[slot.id] || []).find((it) => it.name === selectedItemName) || {
                    name: selectedItemName,
                    tag: 'Custom'
                  }
                : null

              const defaultItemObj: ItemDescriptor | null =
                (catalog.items[slot.id] || []).find(
                  (it) => it.isDefault || it.tag === 'Default' || it.name.toLowerCase().includes('default')
                ) ||
                (catalog.items[slot.id] && catalog.items[slot.id][0]) ||
                null

              const conf = getRarityConfig(equippedItemObj)
              const activeItemObj = isEquipped ? equippedItemObj : defaultItemObj
              const itemImg = activeItemObj ? getItemImage(activeItemObj, slot.id, selectedHero.tag, selectedHero) : getSlotImage(slot.id)

              return (
                <div
                  key={slot.id}
                  className={`slot-card p-3 rounded-xl border transition-all cursor-pointer bg-[#121826]/70 hover:bg-[#1c263c]/90 flex flex-col justify-between ${
                    isEquipped ? 'border-purple-500/40 shadow-[0_0_12px_rgba(139,92,246,0.15)]' : 'border-white/5 hover:border-white/15'
                  }`}
                  data-slot-id={slot.id}
                  onClick={() => openSlotModal(selectedHero, slot)}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <span className="slot-name text-xs font-bold text-white truncate">{slot.name}</span>
                    <span
                      className="text-[10px] font-semibold px-2 py-0.5 rounded-full border truncate shrink-0"
                      style={{
                        borderColor: isEquipped ? conf.color : 'rgba(255,255,255,0.1)',
                        color: isEquipped ? conf.color : 'var(--text-muted)',
                        background: isEquipped ? conf.bg1 : 'rgba(255,255,255,0.03)'
                      }}
                    >
                      {isEquipped ? conf.name : 'Default'}
                    </span>
                    {isEquipped && (
                      <button
                        className="p-1 ml-auto mr-0 text-slate-400 hover:text-white rounded hover:bg-white/10 transition-colors shrink-0"
                        title="Reset to default Base"
                        data-reset-slot={slot.id}
                        onClick={(e) => {
                          e.stopPropagation()
                          resetHeroSlot(selectedHero.tag, slot.id)
                        }}
                      >
                        <X size={14} />
                      </button>
                    )}
                  </div>

                  <div className="flex flex-col gap-2.5">
                    <div
                      className="w-full aspect-4/3 rounded-lg border flex items-center justify-center relative shrink-0 overflow-hidden bg-[#0a0e18]"
                      style={{
                        borderColor: isEquipped ? conf.color : 'rgba(255,255,255,0.1)',
                        boxShadow: `0 0 14px ${isEquipped ? conf.glow : 'transparent'}`
                      }}
                    >
                      <img
                        className={`slot-thumb-img size-full object-cover transition-all duration-300 ${
                          isEquipped ? 'grayscale-0' : 'grayscale opacity-70 group-hover:opacity-85'
                        }`}
                        src={itemImg}
                        alt={isEquipped ? selectedItemName : defaultItemObj?.name || slot.name}
                      />
                    </div>

                    <div className="w-full min-w-0">
                      <div
                        className="text-xs font-semibold truncate"
                        style={{ color: isEquipped ? conf.color : 'var(--text-main)' }}
                        title={isEquipped ? selectedItemName : defaultItemObj?.name || 'Official Base Model'}
                      >
                        {isEquipped ? selectedItemName : defaultItemObj?.name || 'Official Base Model'}
                      </div>
                      <div className="text-[11px] text-slate-400 truncate mt-0.5">
                        {isEquipped ? `${conf.name} Cosmetic` : 'Valve Official Base'}
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Active Set Preview */}
        <div className="flex items-center justify-between p-3.5 rounded-xl bg-white/5 border border-white/10 mt-auto">
          <div className="flex items-center gap-2 text-xs">
            <span className="text-slate-400">Active cosmetic set:</span>
            <span id="asbSetName" className="font-semibold text-purple-300">
              {modifiedCount > 0 ? `Custom Loadout (${modifiedCount}/${catalog.slots.length} modified)` : 'Default Equipment Loadout'}
            </span>
          </div>
          <Button id="btnSaveAsPreset" variant="ghost" size="sm" onClick={openPresetModal}>
            <span>💾 Save as Preset</span>
          </Button>
        </div>
      </div>
    </div>
  )
}
