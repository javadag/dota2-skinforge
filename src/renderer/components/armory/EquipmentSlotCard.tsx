import { X } from 'lucide-react'
import type { ArmorySlot, CatalogEntry } from '../../../shared/armory/armoryCatalog'
import { getSetEffectiveRarity, reconnectPairForSlot, reconnectRequirements, type HeroSet } from '../../../shared/armory/heroSets'
import { styleThumbFor } from '../../../shared/armory/itemStyles'
import { getRarityConfig } from '../../../shared/armory/rarityConfig'
import { useAppStore } from '../../state/useAppStore'
import { generateItemSvg } from '../../utils/cardSvgGenerator'
import { getItemImage } from '../../utils/itemImages'
import { getSlotImage, resolveEmptySlotImage } from '../../utils/slotSvgIcons'
import { CosmeticThumbnail, cosmeticCardClass } from './CosmeticCardPrimitives'
import { StyleSelect } from './StyleSelect'

interface EquipmentSlotCardProps {
  hero: CatalogEntry
  slot: ArmorySlot
  equippedName?: string
  equippedSet?: HeroSet
  portrait: string
}

export function EquipmentSlotCard({ hero, slot, equippedName, equippedSet, portrait }: EquipmentSlotCardProps) {
  const openSlotModal = useAppStore((s) => s.openSlotModal)
  const resetHeroSlot = useAppStore((s) => s.resetHeroSlot)
  const resetAllHeroSlots = useAppStore((s) => s.resetAllHeroSlots)
  const customizations = useAppStore((s) => s.heroCustomizations)
  const equippedSlots = useAppStore((s) => s.heroSlots[hero.tag])
  const completeSet = slot.slot === 'complete_set'
  const slotId = completeSet ? 'set' : slot.slot
  const item = equippedSet
    ? { name: equippedSet.name, rarity: getSetEffectiveRarity(equippedSet), img: equippedSet.img }
    : equippedName
      ? (slot.mods.find((mod) => mod.name === equippedName) ?? { name: equippedName, rarity: 'rare' })
      : null
  const styleImg = !completeSet && item ? styleThumbFor(customizations, hero.tag, slot.slot, equippedName) : null
  const rarity = getRarityConfig(item)
  const name = item?.name ?? 'Official Base Model'
  const pair = equippedSlots && reconnectPairForSlot(hero.tag, equippedSlots, slot.slot)
  const required = pair?.required.slot === slot.slot
  const dependents = equippedSlots
    ? reconnectRequirements(hero.tag, equippedSlots)
        .filter(({ required }) => required.slot === slot.slot)
        .map(({ dependent }) => dependent.name)
    : []
  const reconnectNote =
    pair &&
    (required
      ? `${pair.required.name} keeps ${dependents.join(', ')} visible after reconnect.`
      : `${pair.dependent.name} recommends ${pair.required.name} for reconnect safety.`)
  const thumbnail = item
    ? getItemImage(styleImg ? { ...item, img: styleImg } : item, slotId, hero.tag, hero)
    : completeSet
      ? portrait
      : resolveEmptySlotImage(slot.empty_img, slotId)

  return (
    <article
      className={`${cosmeticCardClass} h-full relative p-2 ${item ? 'border-purple-500/45' : 'border-white/10'}`}
      data-slot-id={slot.slot}
    >
      <button
        type="button"
        className="block w-full min-w-0 cursor-pointer rounded-md text-left focus-visible:outline-2 focus-visible:outline-purple-400"
        onClick={() => openSlotModal(hero, slot)}
        aria-label={`Choose ${slot.title}: ${name}`}
      >
        <div className={`slot-name mb-2 flex min-h-6 items-center text-xs font-semibold text-white ${item ? 'pr-6' : ''}`}>
          <span className="truncate" title={slot.title}>
            {slot.title}
          </span>
        </div>
        <CosmeticThumbnail
          src={thumbnail}
          fallback={item ? generateItemSvg(item, slotId) : getSlotImage(slotId)}
          fit="cover"
          muted={!item}
          zoom={completeSet && !item}
          accent={item ? rarity.color : undefined}
        />
        <div className="mt-2 truncate text-xs font-semibold text-white" title={name}>
          {name}
        </div>
        <div className="mt-0.5 truncate text-[11px] text-slate-400" style={{ color: item ? rarity.color : undefined }}>
          {equippedSet ? `${rarity.name} · ${equippedSet.items.length} pieces` : rarity.name}
        </div>
        {pair && reconnectNote && (
          <p className="mt-1 text-[11px] leading-tight text-amber-200" title={reconnectNote}>
            {required ? `Keeps ${dependents.join(', ')} visible` : `Recommends ${pair.required.name}`}
          </p>
        )}
      </button>
      {item && (
        <button
          type="button"
          className="absolute right-2 top-2 cursor-pointer rounded p-1 text-slate-400 hover:bg-white/10 hover:text-white"
          aria-label={completeSet ? 'Reset loadout to default' : `Reset ${slot.title} to default`}
          data-reset-slot={slot.slot}
          onClick={() => (completeSet ? resetAllHeroSlots(hero.tag) : resetHeroSlot(hero.tag, slot.slot))}
        >
          <X size={14} />
        </button>
      )}
      {item && !completeSet && equippedName && <StyleSelect hero={hero} slotId={slot.slot} itemName={equippedName} item={item} />}
    </article>
  )
}
