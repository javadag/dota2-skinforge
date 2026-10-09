import React from 'react'
import { Plus, Trash2, Check } from 'lucide-react'
import { Button } from './ui/Button'
import { useAppStore } from '../state/useAppStore'

export const PresetsView: React.FC = () => {
  const presets = useAppStore((s) => s.presets)
  const openPresetModal = useAppStore((s) => s.openPresetModal)
  const applyPreset = useAppStore((s) => s.applyPreset)
  const deletePreset = useAppStore((s) => s.deletePreset)

  return (
    <section id="tabPresets" className="tab-section active">
      <div className="presets-panel">
        <div className="presets-header-row">
          <div>
            <h3 className="panel-h3">Saved Presets</h3>
            <p className="panel-sub">
              Save and switch between full cosmetic configurations across all heroes
            </p>
          </div>
          <Button id="btnNewPreset" variant="primary" onClick={openPresetModal}>
            <Plus className="w-4 h-4" />
            <span>New Preset</span>
          </Button>
        </div>

        <div id="presetsList" className="presets-list">
          {presets.map((preset) => {
            const heroCount = Object.keys(preset.heroSlots || {}).length
            const totalSlots = Object.values(preset.heroSlots || {}).reduce(
              (acc, s) => acc + Object.keys(s || {}).length,
              0
            )

            return (
              <div key={preset.id} className="preset-card">
                <div className="preset-info">
                  <div className="preset-name">{preset.name}</div>
                  <div className="preset-meta">
                    <span>{new Date(preset.timestamp).toLocaleDateString()}</span>
                    <span>·</span>
                    <span>
                      {heroCount} heroes ({totalSlots} slots equipped)
                    </span>
                  </div>
                </div>
                <div className="preset-actions">
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => applyPreset(preset)}
                  >
                    <Check className="w-3.5 h-3.5" />
                    <span>Apply Loadout</span>
                  </Button>
                  <Button
                    variant="danger"
                    size="sm"
                    onClick={() => {
                      if (confirm(`Delete preset "${preset.name}"?`)) {
                        deletePreset(preset.id)
                      }
                    }}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
            )
          })}
        </div>

        <div id="presetsEmpty" className={`presets-empty ${presets.length === 0 ? '' : 'hidden'}`}>
          <div className="pe-icon">📦</div>
          <h4>No presets yet</h4>
          <p>Configure hero slots in the Heroes tab and click &quot;Save as Preset&quot; to create one.</p>
        </div>
      </div>
    </section>
  )
}
