import { Layers, Search } from 'lucide-react'
import { formatCatalogName, type ArmorySlot, type CatalogEntry } from '../../../shared/armory/armoryCatalog'
import { isPersonaSlotId } from '../../../shared/armory/armoryTypes'
import { findSetForItem, getHeroSets, getSetEffectiveRarity, isSetEquipped, requiredReconnectPiece } from '../../../shared/armory/heroSets'
import { getStyleOptionsByName, inferStyleIndex, styleThumbFor, styleVariantBaseName } from '../../../shared/armory/itemStyles'
import { getItemRarityKey, getRarityConfig, RARITY_CONFIG, type ItemDescriptor } from '../../../shared/armory/rarityConfig'
import { useAppStore } from '../../state/useAppStore'
import { generateItemSvg } from '../../utils/cardSvgGenerator'
import { getItemImage, resolveCatalogThumbnail } from '../../utils/itemImages'
import { cosmeticGridClass, CosmeticOption, CosmeticThumbnail } from './CosmeticCardPrimitives'
import { StyleSelect } from './StyleSelect'

interface CosmeticPickerProps {
  hero: CatalogEntry
  slot: ArmorySlot
  slots: ArmorySlot[]
  inline?: boolean
  onEquipped?: () => void
}

const rarityOrder = ['arcana', 'persona', 'immortal', 'legendary', 'mythical', 'rare', 'common', 'taunt', 'voice', 'ambient'] as const

function pickerRarity(item: ItemDescriptor) {
  const rarity = getItemRarityKey(item)
  return rarity === 'uncommon' ? 'common' : rarity
}

export const CosmeticPicker = ({ hero, slot, slots, inline, onEquipped }: CosmeticPickerProps) => {
  const modalRarityFilter = useAppStore((s) => s.modalRarityFilter)
  const modalSearchQuery = useAppStore((s) => s.modalSearchQuery)
  const heroSlots = useAppStore((s) => s.heroSlots)
  const heroActiveStance = useAppStore((s) => s.heroActiveStance)
  const setModalRarityFilter = useAppStore((s) => s.setModalRarityFilter)
  const setModalSearchQuery = useAppStore((s) => s.setModalSearchQuery)
  const setHeroSlot = useAppStore((s) => s.setHeroSlot)
  const setSlotCustomization = useAppStore((s) => s.setSlotCustomization)
  const heroCustomizations = useAppStore((s) => s.heroCustomizations)
  const equipSet = useAppStore((s) => s.equipSet)
  const resetHeroSlot = useAppStore((s) => s.resetHeroSlot)
  const resetAllHeroSlots = useAppStore((s) => s.resetAllHeroSlots)
  const addLog = useAppStore((s) => s.addLog)

  const isCompleteSet = slot.slot === 'complete_set'
  const isHero = !hero.group
  const query = modalSearchQuery.toLowerCase().trim()
  const currentSlots = heroSlots[hero.tag] || {}
  const showPersona = heroActiveStance[hero.tag] === 'persona' && slots.some((s) => isPersonaSlotId(s.slot) && s.mods.length > 0)
  const sets = isCompleteSet ? getHeroSets(hero.tag).filter((s) => (showPersona ? s.isPersona : !s.isPersona)) : []
  const equippedSet = sets.find((s) => isSetEquipped(s, currentSlots))
  const equippedName = currentSlots[slot.slot]
  const equippedBaseName = equippedName ? (styleVariantBaseName(equippedName) ?? equippedName) : undefined

  // Hide style variants only when their base card provides access to them.
  const items = isCompleteSet ? [] : slot.mods
  const rowNames = new Set(items.map((it) => it.name))
  const visibleItems = items.filter((it) => {
    const base = styleVariantBaseName(it.name)
    return !base || !rowNames.has(base)
  })
  const setOptions = sets.map((set) => ({ set, item: { name: set.name, img: set.img, rarity: getSetEffectiveRarity(set) } }))
  const available = new Set([...visibleItems, ...setOptions.map(({ item }) => item)].map(pickerRarity))
  const tabs = rarityOrder.filter((rarity) => available.has(rarity) && (isHero || (rarity !== 'arcana' && rarity !== 'persona')))
  const activeFilter = tabs.find((rarity) => rarity === modalRarityFilter) ?? 'all'

  const matchesFilter = (item: ItemDescriptor, extra: (string | undefined)[]) =>
    (activeFilter === 'all' || pickerRarity(item) === activeFilter) &&
    (!query || [item.name, item.rarity, getRarityConfig(item).name, ...extra].some((value) => value?.toLowerCase().includes(query)))

  const filteredItems = visibleItems.filter((it) =>
    matchesFilter(
      it,
      getStyleOptionsByName(it.name).map((style) => style.name)
    )
  )
  const filteredSets = setOptions.filter(({ set, item }) => matchesFilter(item, [set.rarity, ...set.items.map((it) => it.name)]))
  const defaultName = isHero ? 'Official Base Model' : 'Default'
  const showDefault = activeFilter === 'all' && (!query || defaultName.toLowerCase().includes(query) || 'default'.includes(query))
  const defaultIcon = '../assets/categories/default.svg'
  const baseThumb = resolveCatalogThumbnail(hero)

  return (
    <div className={`flex min-h-0 min-w-0 flex-col gap-3 ${inline ? '' : 'p-3'}`}>
      <div className="flex flex-wrap items-center gap-2" role="search" aria-label="Cosmetics">
        <label className="relative block min-w-40 flex-1 basis-52 max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
          <input
            id="slotModalSearch"
            type="search"
            aria-label={isCompleteSet ? 'Search sets' : 'Search cosmetics'}
            className="w-full rounded-lg border border-white/10 bg-white/5 py-2 pl-9 pr-3 text-xs text-white outline-none placeholder:text-slate-400 focus:border-purple-400"
            placeholder={isCompleteSet ? 'Search sets or pieces' : 'Search cosmetics'}
            autoComplete="off"
            value={modalSearchQuery}
            onChange={(e) => setModalSearchQuery(e.target.value)}
          />
        </label>
        {tabs.length > 0 && (
          <div className="flex flex-wrap gap-1" role="group" aria-label="Rarity">
            {(['all', ...tabs] as const).map((rarity) => (
              <button
                key={rarity}
                type="button"
                aria-pressed={activeFilter === rarity}
                data-rarity={rarity}
                className={`cursor-pointer rounded-md border px-2.5 py-1.5 text-[11px] font-semibold ${
                  activeFilter === rarity
                    ? 'border-purple-500/50 bg-purple-500/20 text-white'
                    : 'border-white/10 bg-white/5 text-slate-400 hover:text-white'
                }`}
                onClick={() => setModalRarityFilter(rarity)}
              >
                {rarity === 'all' ? 'All' : RARITY_CONFIG[rarity].name}
              </button>
            ))}
          </div>
        )}
      </div>

      <div id="slotModalList" className={`${cosmeticGridClass} ${inline ? '' : 'min-h-0 overflow-y-auto pr-1'}`}>
        {showDefault && (
          <CosmeticOption
            name={defaultName}
            detail={isHero ? 'Default' : 'Valve Official Base'}
            selected={isCompleteSet ? !equippedSet : !equippedName}
            thumbnail={<CosmeticThumbnail src={baseThumb} fallback={defaultIcon} fit={isCompleteSet ? 'cover' : 'contain'} />}
            onSelect={() => {
              if (isCompleteSet) {
                resetAllHeroSlots(hero.tag)
              } else {
                resetHeroSlot(hero.tag, slot.slot)
                addLog(`Reset ${formatCatalogName(hero.tag)} [${slot.title}] to Official Base.`, 'info')
              }
              onEquipped?.()
            }}
          />
        )}

        {filteredSets.map(({ set, item }) => {
          const rarity = getRarityConfig(item)
          return (
            <CosmeticOption
              key={set.id}
              name={set.name}
              detail={`${rarity.name} · ${set.items.length} pieces`}
              color={rarity.color}
              selected={isSetEquipped(set, currentSlots)}
              thumbnail={
                <CosmeticThumbnail
                  src={getItemImage(item, 'set', hero.tag, hero)}
                  fallback={generateItemSvg(item, 'set')}
                  accent={rarity.color}
                />
              }
              onSelect={() => {
                equipSet(hero.tag, set)
                onEquipped?.()
              }}
            >
              <details className="mt-2 text-[11px] text-slate-400">
                <summary className="cursor-pointer hover:text-white">Included items</summary>
                <ul className="mt-1 space-y-1">
                  {set.items.map((it) => (
                    <li key={it.slot + it.name}>{it.name}</li>
                  ))}
                </ul>
              </details>
            </CosmeticOption>
          )
        })}

        {filteredItems.map((it) => {
          const rarity = getRarityConfig(it)
          const selected = equippedBaseName === it.name
          const styleImg = selected ? styleThumbFor(heroCustomizations, hero.tag, slot.slot, equippedName) : null
          const itemImg = getItemImage(styleImg ? { ...it, img: styleImg } : it, slot.slot, hero.tag, hero)
          const itemSet = isHero ? findSetForItem(hero.tag, it.name) : undefined
          const requiredPiece = isHero ? requiredReconnectPiece(hero.tag, slot.slot, it.name) : undefined
          const missingCarrierSlot =
            requiredPiece && !currentSlots[requiredPiece.slot]
              ? (slots.find((s) => s.slot === requiredPiece.slot)?.title ?? requiredPiece.slot)
              : undefined
          const carrierArticle = missingCarrierSlot && /^[aeiou]/i.test(missingCarrierSlot) ? 'an' : 'a'
          return (
            <CosmeticOption
              key={it.name}
              name={it.name}
              detail={rarity.name}
              color={rarity.color}
              selected={selected}
              thumbnail={<CosmeticThumbnail src={itemImg} fallback={generateItemSvg(it, slot.slot)} accent={rarity.color} />}
              onSelect={() => {
                const impliedStyle =
                  equippedName && styleVariantBaseName(equippedName) === it.name
                    ? inferStyleIndex(equippedName, getStyleOptionsByName(it.name))
                    : 0
                setHeroSlot(hero.tag, slot.slot, it.name)
                if (impliedStyle) setSlotCustomization(hero.tag, slot.slot, { style: impliedStyle })
                onEquipped?.()
                addLog(`Equipped ${it.name} on ${formatCatalogName(hero.tag)} [${slot.title}].`, 'success')
              }}
            >
              {missingCarrierSlot && (
                <p className="mt-2 text-[11px] text-amber-200">
                  Equip {carrierArticle} {missingCarrierSlot} item (same set preferred) to keep this visible on reconnect.
                </p>
              )}
              {itemSet && (
                <button
                  type="button"
                  className="mt-2 flex cursor-pointer items-center gap-1 rounded bg-purple-500/15 px-2 py-1 text-[10px] font-semibold text-purple-300 hover:bg-purple-500/30 hover:text-white"
                  title={`Equip all ${itemSet.items.length} pieces of "${itemSet.name}"`}
                  onClick={() => {
                    equipSet(hero.tag, itemSet)
                    onEquipped?.()
                  }}
                >
                  <Layers size={11} />
                  Equip Entire Set
                </button>
              )}
              {selected && <StyleSelect hero={hero} slotId={slot.slot} itemName={equippedName || it.name} item={it} />}
            </CosmeticOption>
          )
        })}

        {!showDefault && !filteredSets.length && !filteredItems.length && (
          <p className="col-span-full py-8 text-center text-xs text-slate-400">No cosmetics match your filters.</p>
        )}
      </div>
    </div>
  )
}
