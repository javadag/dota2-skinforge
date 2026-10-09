import React from 'react'
import { Sparkles, Check, X } from 'lucide-react'
import { CATEGORY_META, isCategoryKey } from '../../data/categoryMeta'
import { getAttrLabel, getHeroAttribute } from '../utils/attributes'
import { formatHeroName, getHeroSlotsDefinition } from './slotGenerator'
import { getItemImage, getRarityConfig, generateItemSvg, type ItemDescriptor } from '../utils/itemImages'
import { Button } from './ui/Button'
import { useAppStore } from '../state/useAppStore'

const fallbackHeroSvg =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><rect width="40" height="40" rx="6" fill="#141a29"/><text x="20" y="25" fill="#64748b" font-size="16" text-anchor="middle">?</text></svg>'
  )

export const SlotEditor: React.FC = () => {
  const selectedHero = useAppStore((s) => s.selectedHero)
  const heroSlots = useAppStore((s) => s.heroSlots)
  const unlockBestSet = useAppStore((s) => s.unlockBestSet)
  const resetAllHeroSlots = useAppStore((s) => s.resetAllHeroSlots)
  const resetHeroSlot = useAppStore((s) => s.resetHeroSlot)
  const openSlotModal = useAppStore((s) => s.openSlotModal)
  const openPresetModal = useAppStore((s) => s.openPresetModal)

  if (!selectedHero) {
    return (
      <div className="hero-slot-panel" id="heroSlotPanel">
        <div className="hsp-empty" id="hspEmpty">
          <div className="hsp-empty-icon">
            <Sparkles className="w-10 h-10 text-accent-purple/60" />
          </div>
          <h3 id="hspEmptyTitle">Select an Item or Hero</h3>
          <p id="hspEmptyDesc">Pick any hero, creep, courier, music pack or weather effect to configure cosmetics</p>
        </div>
      </div>
    )
  }

  const isHero = !selectedHero.g || selectedHero.g === 'hero'
  const heroAttr = getHeroAttribute(selectedHero.tag)
  const heroImg =
    selectedHero.img ||
    (isHero ? `../assets/heroes/${selectedHero.tag.replace(/\s+/g, '_')}.png` : '../assets/categories/default.svg')
  const catMeta = selectedHero.g && isCategoryKey(selectedHero.g) ? CATEGORY_META[selectedHero.g] : null

  const catalog = getHeroSlotsDefinition(selectedHero.tag, selectedHero)
  const currentSlots = heroSlots[selectedHero.tag] || {}

  let modifiedCount = 0
  catalog.slots.forEach((s) => {
    if (currentSlots[s.id]) modifiedCount++
  })

  return (
    <div className="hero-slot-panel" id="heroSlotPanel">
      <div className="hsp-content" id="hspContent">
        {/* Hero Header */}
        <div className="hsp-hero-header">
          <img
            id="hspHeroImg"
            src={heroImg}
            alt={selectedHero.tag}
            className="hsp-hero-portrait"
            onError={(e) => {
              e.currentTarget.onerror = null
              e.currentTarget.src = fallbackHeroSvg
            }}
          />
          <div className="hsp-hero-meta">
            <h2 id="hspHeroName" className="hsp-hero-name">
              {formatHeroName(selectedHero.tag)}
            </h2>
            <div id="hspHeroAttr" className={`hsp-hero-attr-badge ${heroAttr}`}>
              {isHero ? (
                <>
                  <span className={`hero-attr-dot ${heroAttr}`} />
                  <span>{getAttrLabel(heroAttr)} Hero</span>
                </>
              ) : (
                <span>{catMeta ? catMeta.name : 'Cosmetic Category'}</span>
              )}
            </div>
            <div className="hsp-hero-actions">
              <Button
                id="btnUnlockAllSlots"
                variant="primary"
                size="sm"
                onClick={() => unlockBestSet(selectedHero)}
              >
                <Check className="w-3.5 h-3.5" />
                <span>Unlock Best Set</span>
              </Button>
              <Button
                id="btnResetSlots"
                variant="ghost"
                size="sm"
                onClick={() => resetAllHeroSlots(selectedHero.tag)}
              >
                <span>Reset to Default</span>
              </Button>
            </div>
          </div>
        </div>

        {/* Slot Grid */}
        <div className="slots-section">
          <h4 className="slots-section-title">Equipment Slots</h4>
          <div id="slotsGrid" className="slots-grid">
            {catalog.slots.map((slot) => {
              const selectedItemName = currentSlots[slot.id]
              const isEquipped = !!selectedItemName

              const equippedItemObj: ItemDescriptor | null = isEquipped
                ? (catalog.items[slot.id] || []).find((it) => it.name === selectedItemName) || {
                    name: selectedItemName,
                    tag: 'Custom'
                  }
                : null

              const conf = getRarityConfig(equippedItemObj)
              const itemImg = getItemImage(equippedItemObj, slot.id, selectedHero.tag, selectedHero)
              const fallbackSvg = generateItemSvg(
                equippedItemObj || { name: slot.name, tag: 'default', isDefault: true },
                slot.id,
                selectedHero.tag
              )

              return (
                <div
                  key={slot.id}
                  className={`slot-card ${isEquipped ? 'has-item' : ''}`}
                  data-slot-id={slot.id}
                  onClick={() => openSlotModal(selectedHero, slot)}
                >
                  <div className="slot-header">
                    <span className="slot-name">{slot.name}</span>
                    <span
                      className="slot-badge"
                      style={{
                        borderColor: isEquipped ? conf.color : 'rgba(255,255,255,0.1)',
                        color: isEquipped ? conf.color : 'var(--text-muted)',
                        background: isEquipped ? conf.bg1 : 'rgba(255,255,255,0.03)'
                      }}
                    >
                      {isEquipped ? conf.name : 'Default'}
                    </span>
                  </div>

                  <div className="slot-item-info">
                    <div
                      className={`slot-thumb-container ${isEquipped ? 'equipped' : 'default-thumb'}`}
                      style={{
                        borderColor: isEquipped ? conf.color : 'var(--border-subtle)',
                        boxShadow: `0 0 14px ${isEquipped ? conf.glow : 'transparent'}`
                      }}
                    >
                      <img
                        className="slot-thumb-img"
                        src={itemImg}
                        alt={selectedItemName || slot.name}
                        onError={(e) => {
                          e.currentTarget.onerror = null
                          e.currentTarget.src = fallbackSvg
                        }}
                      />
                      <span className="slot-thumb-slot-icon">{slot.icon || '⚔️'}</span>
                    </div>

                    <div className="slot-text-wrap">
                      <div
                        className="slot-item-name"
                        style={{ color: isEquipped ? conf.color : 'var(--text-main)' }}
                      >
                        {selectedItemName || 'Official Base Model'}
                      </div>
                      <div className="slot-item-status">
                        {isEquipped ? `${conf.name} Cosmetic` : 'Valve Official Base'}
                      </div>
                    </div>

                    {isEquipped && (
                      <button
                        className="slot-quick-reset"
                        title="Reset to default Base"
                        data-reset-slot={slot.id}
                        onClick={(e) => {
                          e.stopPropagation()
                          resetHeroSlot(selectedHero.tag, slot.id)
                        }}
                      >
                        <X className="w-3.5 h-3.5 stroke-[2.5]" />
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Active Set Preview */}
        <div className="active-set-bar">
          <span className="asb-label">Active cosmetic set:</span>
          <span id="asbSetName" className="asb-name">
            {modifiedCount > 0
              ? `Custom Loadout (${modifiedCount}/${catalog.slots.length} modified)`
              : 'Default Equipment Loadout'}
          </span>
          <Button id="btnSaveAsPreset" variant="ghost" size="sm" onClick={openPresetModal}>
            <span>💾 Save as Preset</span>
          </Button>
        </div>
      </div>
    </div>
  )
}
