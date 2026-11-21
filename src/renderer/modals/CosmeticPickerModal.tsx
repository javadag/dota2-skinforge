import { formatCatalogName } from '../../shared/armory/armoryCatalog'
import { CosmeticPicker } from '../components/armory/CosmeticPicker'
import { Modal } from '../components/ui/Modal'
import { useAppStore } from '../state/useAppStore'

/**
 * Modal shell around `CosmeticPicker` for hero slots. Single-slot categories render
 * `CosmeticPicker` inline inside `LoadoutPanel` instead of opening this dialog.
 */
export const CosmeticPickerModal = () => {
  const selectedHero = useAppStore((s) => s.selectedHero)
  const activeArmory = useAppStore((s) => s.activeArmory)
  const activeModalSlot = useAppStore((s) => s.activeModalSlot)
  const closeSlotModal = useAppStore((s) => s.closeSlotModal)

  if (!activeModalSlot || !selectedHero || !activeArmory) return null

  return (
    <Modal
      id="slotModal"
      isOpen
      onClose={closeSlotModal}
      maxWidth="max-w-2xl"
      bodyClassName="flex flex-col min-h-0 overflow-hidden"
      title={`${selectedHero.name ?? formatCatalogName(selectedHero.tag)} Equipment`}
      subtitle={<span className="text-[11px] font-semibold text-cyan-400 uppercase tracking-wider">{activeModalSlot.title}</span>}
    >
      <CosmeticPicker hero={selectedHero} slot={activeModalSlot} slots={activeArmory.slots ?? []} onEquipped={closeSlotModal} />
    </Modal>
  )
}
