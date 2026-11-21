import { Sparkles } from 'lucide-react'
import React from 'react'
import { formatCatalogName, resolveArmoryEntry, type ArmorySlot } from '../../../shared/armory/armoryCatalog'
import { isPersonaSlotId } from '../../../shared/armory/armoryTypes'
import { getHeroSets, getSetEffectiveRarity, isSetEquipped } from '../../../shared/armory/heroSets'
import { getRarityConfig } from '../../../shared/armory/rarityConfig'
import { CATEGORY_META, isArmoryCategoryGroup } from '../../../shared/constants/categories'
import { useAppStore } from '../../state/useAppStore'
import { FALLBACK_THUMBNAIL_SVG, resolveCatalogThumbnail } from '../../utils/itemImages'
import { Button } from '../ui/Button'
import { AbilityIconsBar } from './AbilityIconsBar'
import { cosmeticGridClass } from './CosmeticCardPrimitives'
import { CosmeticPicker } from './CosmeticPicker'
import { EquipmentSlotCard } from './EquipmentSlotCard'

export const LoadoutPanel: React.FC = () => {
  const selectedHero = useAppStore((s) => s.selectedHero)
  const heroSlots = useAppStore((s) => s.heroSlots)
  const heroActiveStance = useAppStore((s) => s.heroActiveStance)
  const setHeroActiveStance = useAppStore((s) => s.setHeroActiveStance)
  const resetAllHeroSlots = useAppStore((s) => s.resetAllHeroSlots)
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

  const isHero = !selectedHero.group
  const heroImg = resolveCatalogThumbnail(selectedHero)
  // Category art ships as a 24px white glyph — framed and padded so it reads as an icon
  // tile instead of a stretched blob; portraits and renders stay full-bleed.
  const heroImgFrame = 'size-14 rounded-lg object-contain p-3 bg-[#0f172a] border-2 border-white/15 shrink-0'
  const heroImgPhoto = 'h-14 w-24 rounded-lg object-cover border-2 border-white/15 shrink-0'

  const catMeta = selectedHero.group && isArmoryCategoryGroup(selectedHero.group) ? CATEGORY_META[selectedHero.group] : null

  const armory = resolveArmoryEntry(selectedHero.tag, selectedHero)
  const currentSlots = heroSlots[selectedHero.tag] || {}
  const armorySlots = armory?.slots ?? []

  // A hero with a persona has two slot sets at once. Split them by the slot id the game
  // itself uses (`persona`, `persona_head`, ...) instead of the armory's variant lists,
  // which lump base slots like the head or the weapon in with the persona.
  const currentStance = heroActiveStance[selectedHero.tag] || 'default'
  const hasPersona = armorySlots.some((s) => isPersonaSlotId(s.slot) && s.mods.length > 0)
  const showPersona = hasPersona && currentStance === 'persona'
  const visibleSlots = hasPersona ? armorySlots.filter((s) => (isPersonaSlotId(s.slot) ? showPersona : !showPersona)) : armorySlots

  const heroSets = getHeroSets(selectedHero.tag)
  const visibleSets = heroSets.filter((s) => (hasPersona && showPersona ? s.isPersona : !s.isPersona))
  const equippedSet = visibleSets.find((s) => isSetEquipped(s, currentSlots))

  const completeSetSlot: ArmorySlot | null =
    visibleSets.length > 0
      ? {
          slot: 'complete_set',
          title: 'Complete Set',
          mods: visibleSets.map((s) => ({
            name: s.name,
            rarity: getSetEffectiveRarity(s),
            img: s.img
          }))
        }
      : null

  const displaySlots = completeSetSlot ? [completeSetSlot, ...visibleSlots] : visibleSlots

  // A non-hero category with a single slot is a flat list — showing one card that only
  // exists to open that same list is a wasted click, so the items render right here.
  const inlineSlot: ArmorySlot | null = !isHero && visibleSlots.length === 1 ? visibleSlots[0] : null

  const modifiedCount = visibleSlots.filter((slot) => currentSlots[slot.slot]).length

  return (
    <div className="flex-1 min-w-0 h-full overflow-y-auto p-4" id="heroSlotPanel">
      <div className="mx-auto flex max-w-[100rem] flex-col gap-4">
        {/* Hero Header */}
        <div className="flex items-center gap-3 p-2.5 rounded-xl bg-white/5 border border-white/10 backdrop-blur-sm">
          <img
            id="hspHeroImg"
            src={heroImg}
            alt={selectedHero.tag}
            className={heroImg.endsWith('.svg') ? heroImgFrame : heroImgPhoto}
            onError={(e) => {
              e.currentTarget.onerror = null
              e.currentTarget.className = heroImgFrame
              e.currentTarget.src = FALLBACK_THUMBNAIL_SVG
            }}
          />
          <div className="flex-1 flex flex-wrap items-center gap-2 min-w-0">
            <h2 id="hspHeroName" className="text-xl font-extrabold text-white tracking-tight truncate">
              {selectedHero.name ?? formatCatalogName(selectedHero.tag)}
            </h2>
            {!isHero && (
              <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold text-slate-300 bg-white/5 border border-white/10 w-fit">
                <span>{catMeta ? catMeta.name : 'Cosmetic Category'}</span>
              </div>
            )}
            <Button variant="ghost" className="ml-auto mr-0" size="sm" onClick={() => resetAllHeroSlots(selectedHero.tag)}>
              <span>Reset to Default</span>
            </Button>
          </div>
        </div>

        {isHero && <AbilityIconsBar key={selectedHero.tag} hero={selectedHero.tag} />}

        {/* Slot Grid View — a category with a single slot shows its items right here */}
        {inlineSlot ? (
          <CosmeticPicker hero={selectedHero} slot={inlineSlot} slots={armorySlots} inline />
        ) : (
          <div className="flex flex-col gap-3">
            {hasPersona && (
              <div className="flex justify-end">
                <div className="flex items-center gap-1 p-0.5 rounded-lg bg-black/30 border border-white/10" id="variantTabs">
                  {(['default', 'persona'] as const).map((id) => {
                    const isActive = currentStance === id
                    return (
                      <button
                        key={id}
                        type="button"
                        data-variant={id}
                        className={`px-3 py-1 rounded-md text-[11px] font-semibold transition-all cursor-pointer ${
                          isActive
                            ? 'bg-purple-500/25 text-white border border-purple-500/50 shadow-[0_0_8px_rgba(139,92,246,0.3)]'
                            : 'text-slate-400 border border-transparent hover:text-white hover:bg-white/5'
                        }`}
                        onClick={() => setHeroActiveStance(selectedHero.tag, id)}
                      >
                        {id === 'default' ? 'Default Model' : 'Persona'}
                      </button>
                    )
                  })}
                </div>
              </div>
            )}

            <div id="slotsGrid" className={cosmeticGridClass}>
              {displaySlots.map((slot) => (
                <EquipmentSlotCard
                  key={slot.slot}
                  hero={selectedHero}
                  slot={slot}
                  equippedName={currentSlots[slot.slot]}
                  equippedSet={slot.slot === 'complete_set' ? equippedSet : undefined}
                  portrait={heroImg}
                />
              ))}
            </div>
          </div>
        )}

        {/* Active Set Preview */}
        <div className="flex flex-wrap items-center justify-between gap-2 p-2.5 rounded-xl bg-white/5 border border-white/10 mt-auto">
          <div className="flex items-center gap-2 text-xs">
            <span className="text-slate-400">Active cosmetic set:</span>
            <span id="asbSetName" className="font-semibold text-purple-300">
              {equippedSet
                ? `${equippedSet.name} (${getRarityConfig({ rarity: equippedSet.rarity }).name} Set)`
                : modifiedCount > 0
                  ? `Custom Loadout (${modifiedCount}/${visibleSlots.length} modified)`
                  : 'Default Equipment Loadout'}
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
