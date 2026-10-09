import React, { useEffect, useState } from 'react'
import { useAppStore } from '../state/useAppStore'
import { Button } from './ui/Button'

export const PresetNameModal: React.FC = () => {
  const isPresetModalOpen = useAppStore((s) => s.isPresetModalOpen)
  const closePresetModal = useAppStore((s) => s.closePresetModal)
  const addPreset = useAppStore((s) => s.addPreset)

  const [name, setName] = useState('')

  useEffect(() => {
    if (isPresetModalOpen) {
      setName('')
    }
  }, [isPresetModalOpen])

  if (!isPresetModalOpen) {
    return <div id="presetNameModal" className="hidden" />
  }

  const handleSave = () => {
    const trimmed = name.trim()
    if (!trimmed) {
      alert('Please enter a name for your preset.')
      return
    }
    addPreset(trimmed)
  }

  return (
    <div
      id="presetNameModal"
      className="fixed inset-0 z-50 bg-black/75 backdrop-blur-md flex items-center justify-center p-6"
      onClick={(e) => {
        if (e.target === e.currentTarget) closePresetModal()
      }}
    >
      <div className="w-full max-w-sm bg-bg-surface border border-white/10 rounded-2xl shadow-2xl p-6 flex flex-col gap-4">
        <div className="flex items-center justify-between pb-3 border-b border-white/5">
          <h3 className="text-base font-bold text-white">Name Your Preset</h3>
          <button
            id="presetNameClose"
            className="text-slate-400 hover:text-white text-2xl px-2 leading-none cursor-pointer transition-colors"
            onClick={closePresetModal}
          >
            ×
          </button>
        </div>

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
            if (e.key === 'Escape') closePresetModal()
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
    </div>
  )
}
