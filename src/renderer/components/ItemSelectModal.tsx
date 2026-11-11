import { useEffect } from 'react'
import { useAppStore } from '../state/useAppStore'
import { formatHeroName } from './slotGenerator'
import { ItemPicker } from './ItemPicker'

/**
 * The modal shell: overlay, header and Escape-to-close. Everything inside it — search,
 * rarity filters, cards — is `ItemPicker`, which the category screen also renders inline
 * when the category has a single slot.
 */
export const ItemSelectModal = () => {
  const selectedHero = useAppStore((s) => s.selectedHero)
  const activeArmory = useAppStore((s) => s.activeArmory)
  const activeModalSlot = useAppStore((s) => s.activeModalSlot)
  const closeSlotModal = useAppStore((s) => s.closeSlotModal)

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && activeModalSlot) {
        closeSlotModal()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [activeModalSlot, closeSlotModal])

  if (!activeModalSlot || !selectedHero || !activeArmory) {
    return <div id="slotModal" className="hidden" />
  }

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

        <ItemPicker hero={selectedHero} slot={activeModalSlot} slots={activeArmory.slots ?? []} onEquipped={closeSlotModal} />
      </div>
    </div>
  )
}
