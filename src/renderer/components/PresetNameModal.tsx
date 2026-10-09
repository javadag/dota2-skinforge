import React, { useState, useEffect } from 'react'
import { Button } from './ui/Button'
import { useAppStore } from '../state/useAppStore'

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
    return (
      <div id="presetNameModal" className="modal-overlay hidden">
        <div className="modal-box modal-sm" />
      </div>
    )
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
      className="modal-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) closePresetModal()
      }}
    >
      <div className="modal-box modal-sm">
        <div className="modal-header">
          <h3 className="modal-title">Name Your Preset</h3>
          <button id="presetNameClose" className="modal-close-btn" onClick={closePresetModal}>
            ×
          </button>
        </div>

        <input
          type="text"
          id="presetNameInput"
          className="settings-input"
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

        <div className="modal-footer-row">
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
