import { Check, Plus, Trash2 } from 'lucide-react'
import React from 'react'
import { useAppStore } from '../state/useAppStore'
import { Button } from './ui/Button'

export const PresetsView: React.FC = () => {
  const presets = useAppStore((s) => s.presets)
  const openPresetModal = useAppStore((s) => s.openPresetModal)
  const applyPreset = useAppStore((s) => s.applyPreset)
  const deletePreset = useAppStore((s) => s.deletePreset)

  return (
    <section id="tabPresets" className="flex-1 h-full overflow-y-auto p-8">
      <div className="max-w-4xl mx-auto flex flex-col gap-6">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-xl font-extrabold text-white">Saved Presets</h3>
            <p className="text-xs text-slate-400 mt-1">Save and switch between full cosmetic configurations across all heroes</p>
          </div>
          <Button id="btnNewPreset" variant="primary" onClick={openPresetModal}>
            <Plus className="w-4 h-4" />
            <span>New Preset</span>
          </Button>
        </div>

        <div id="presetsList" className="flex flex-col gap-3">
          {presets.map((preset) => {
            const heroCount = Object.keys(preset.heroSlots || {}).length
            const totalSlots = Object.values(preset.heroSlots || {}).reduce((acc, s) => acc + Object.keys(s || {}).length, 0)

            return (
              <div
                key={preset.id}
                className="p-4 rounded-xl bg-white/5 border border-white/10 flex items-center justify-between gap-4 transition-all hover:border-white/20"
              >
                <div className="flex flex-col gap-1 min-w-0">
                  <div className="text-sm font-bold text-white truncate">{preset.name}</div>
                  <div className="flex items-center gap-2 text-xs text-slate-400">
                    <span>{new Date(preset.timestamp).toLocaleDateString()}</span>
                    <span>·</span>
                    <span>
                      {heroCount} heroes ({totalSlots} slots equipped)
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Button variant="primary" size="sm" onClick={() => applyPreset(preset)}>
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

        <div
          id="presetsEmpty"
          className={`text-center py-16 text-slate-400 flex flex-col items-center justify-center ${
            presets.length === 0 ? '' : 'hidden'
          }`}
        >
          <div className="text-4xl mb-3">📦</div>
          <h4 className="text-base font-bold text-white mb-1">No presets yet</h4>
          <p className="text-xs text-slate-400">
            Configure hero slots in the Heroes tab and click &quot;Save as Preset&quot; to create one.
          </p>
        </div>
      </div>
    </section>
  )
}
