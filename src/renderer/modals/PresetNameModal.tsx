import React, { useEffect, useState } from 'react'
import { Button } from '../components/ui/Button'
import { Modal } from '../components/ui/Modal'
import { useAppStore } from '../state/useAppStore'

export const PresetNameModal: React.FC = () => {
  const isPresetModalOpen = useAppStore((s) => s.isPresetModalOpen)
  const closePresetModal = useAppStore((s) => s.closePresetModal)
  const addPreset = useAppStore((s) => s.addPreset)

  const [name, setName] = useState('')

  useEffect(() => {
    if (isPresetModalOpen) setName('')
  }, [isPresetModalOpen])

  const handleSave = () => {
    const trimmed = name.trim()
    if (!trimmed) {
      alert('Please enter a name for your preset.')
      return
    }
    addPreset(trimmed)
  }

  return (
    <Modal id="presetNameModal" isOpen={isPresetModalOpen} onClose={closePresetModal} maxWidth="max-w-sm" title="Name Your Preset">
      <div className="p-6 flex flex-col gap-4">
        <input
          type="text"
          id="presetNameInput"
          className="w-full bg-white/5 border border-white/10 rounded-lg px-3.5 py-2.5 text-xs text-white placeholder-slate-400 outline-none focus:border-purple-500/50 transition-colors"
          placeholder="e.g. My PA Arcana Build"
          maxLength={48}
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleSave()
          }}
          autoFocus
        />

        <div className="flex justify-end gap-2.5 pt-2">
          <Button id="btnPresetNameCancel" variant="ghost" onClick={closePresetModal}>
            Cancel
          </Button>
          <Button id="btnPresetNameSave" variant="primary" onClick={handleSave}>
            Save Preset
          </Button>
        </div>
      </div>
    </Modal>
  )
}
