import { Check, ChevronDown, Sparkles } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { getItemStyleOptions, inferStyleIndex, type StyleOption } from '../../shared/constants/itemStyles'
import { useAppStore } from '../state/useAppStore'
import { generateItemSvg, getItemImage, type ItemDescriptor } from '../utils/itemImages'
import type { HeroEntry } from '../env'

interface StyleSelectProps {
  hero: HeroEntry
  slotId: string
  /** The equipped item's display name — the key styles resolve under. */
  itemName: string
  /** The equipped item, for thumbnail fallbacks when a style ships no icon of its own. */
  item: ItemDescriptor
}

interface MenuPos {
  top: number
  left: number
  width: number
  height: number
}

/**
 * Style picker for the equipped item: a compact trigger on the slot card that opens a
 * thumbnail list of the item's styles. Rendered inside the card (its clicks never reach
 * the card's own open-modal handler) but positioned against the viewport, so the list is
 * never clipped by the scrolling grid or the modal.
 */
export const StyleSelect = ({ hero, slotId, itemName, item }: StyleSelectProps) => {
  const heroCustomizations = useAppStore((s) => s.heroCustomizations)
  const setSlotCustomization = useAppStore((s) => s.setSlotCustomization)
  const wrapperRef = useRef<HTMLDivElement | null>(null)
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<MenuPos | null>(null)

  const close = useCallback(() => {
    setOpen(false)
    setPos(null)
  }, [])

  useEffect(() => {
    if (!open) return
    const onPointerDown = (e: MouseEvent) => {
      if (!wrapperRef.current?.contains(e.target as Node)) close()
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
    }
    // Capture phase so scrolling any inner container (the grid, the modal) also closes.
    window.addEventListener('scroll', close, true)
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('scroll', close, true)
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open, close])

  const info = getItemStyleOptions(hero.tag, slotId, itemName)
  const styles = info?.styles ?? []
  if (!info || styles.length === 0) return null

  // The list must offer the default explicitly when the schema's options skip index 0.
  const options: StyleOption[] = styles[0].index !== 0 ? [{ index: 0, name: 'Default' }, ...styles] : styles
  const saved = heroCustomizations[hero.tag]?.[slotId]?.style
  const activeIndex = options.some((option) => option.index === saved) ? (saved as number) : inferStyleIndex(itemName, styles)

  const thumbFor = (style: StyleOption): string =>
    getItemImage({ name: style.name, img: style.img ?? item.img, rarity: item.rarity }, slotId, hero.tag, hero)

  const toggle = () => {
    if (open) {
      close()
      return
    }
    const rect = triggerRef.current?.getBoundingClientRect()
    if (!rect) return
    // Viewport-anchored: open upward when the space below is tight.
    const spaceBelow = window.innerHeight - rect.bottom - 8
    const spaceAbove = rect.top - 8
    const openUp = spaceBelow < 180 && spaceAbove > spaceBelow
    const room = openUp ? spaceAbove : spaceBelow
    const height = Math.max(96, Math.min(224, room))
    setPos({
      top: openUp ? rect.top - height - 6 : rect.bottom + 6,
      left: rect.left,
      width: rect.width,
      height
    })
    setOpen(true)
  }

  const activeStyle = options.find((option) => option.index === activeIndex) ?? options[0]
  const fallbackSvg = (style: StyleOption) => generateItemSvg({ name: style.name, rarity: item.rarity }, slotId, hero.tag)

  return (
    <div ref={wrapperRef} className="relative w-full" onClick={(e) => e.stopPropagation()}>
      <button
        ref={triggerRef}
        type="button"
        className="mt-1 w-full flex items-center gap-2 px-2 py-1.5 rounded-lg border border-purple-500/40 bg-purple-950/50 hover:bg-purple-900/60 hover:border-purple-400/60 transition-colors cursor-pointer"
        aria-haspopup="listbox"
        aria-expanded={open}
        title={`Style: ${activeStyle.name}`}
        onClick={toggle}
      >
        <Sparkles className="w-3.5 h-3.5 text-purple-400 shrink-0" />
        <img
          src={thumbFor(activeStyle)}
          alt=""
          className="w-[18px] h-[18px] rounded object-contain bg-white/5 border border-white/10 shrink-0"
          onError={(e) => {
            e.currentTarget.onerror = null
            e.currentTarget.src = fallbackSvg(activeStyle)
          }}
        />
        <span className="text-[11px] font-semibold text-purple-200 truncate flex-1 text-left">{activeStyle.name}</span>
        <ChevronDown className={`w-3.5 h-3.5 text-purple-400 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && pos && (
        <div
          role="listbox"
          aria-label="Item styles"
          className="fixed z-40 overflow-y-auto rounded-lg border border-purple-500/40 bg-slate-950/95 backdrop-blur-md shadow-[0_12px_32px_rgba(0,0,0,0.6)] py-1"
          style={{ top: pos.top, left: pos.left, width: pos.width, maxHeight: pos.height }}
        >
          {options.map((style) => {
            const isActive = style.index === activeIndex
            return (
              <button
                key={style.index}
                type="button"
                role="option"
                aria-selected={isActive}
                className={`w-full flex items-center gap-2.5 px-2 py-1.5 text-left transition-colors cursor-pointer ${
                  isActive ? 'bg-purple-500/25' : 'hover:bg-white/10'
                }`}
                onClick={() => {
                  setSlotCustomization(hero.tag, slotId, { style: style.index })
                  close()
                }}
              >
                <img
                  src={thumbFor(style)}
                  alt=""
                  className="w-7 h-7 rounded-md border border-white/10 bg-white/5 object-contain shrink-0"
                  onError={(e) => {
                    e.currentTarget.onerror = null
                    e.currentTarget.src = fallbackSvg(style)
                  }}
                />
                <span
                  className={`text-[11px] truncate flex-1 ${isActive ? 'font-semibold text-purple-100' : 'text-slate-300'}`}
                  title={style.name}
                >
                  {style.name}
                </span>
                {isActive && <Check className="w-3.5 h-3.5 text-purple-300 shrink-0" />}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
