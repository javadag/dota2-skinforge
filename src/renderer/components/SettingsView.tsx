import React, { useState } from 'react'
import { useAppStore } from '../state/useAppStore'
import { Button } from './ui/Button'
import { ToggleSwitch } from './ui/ToggleSwitch'

export const SettingsView: React.FC = () => {
  const dotaPath = useAppStore((s) => s.dotaPath)
  const settings = useAppStore((s) => s.settings)
  const cacheStats = useAppStore((s) => s.cacheStats)
  const updateSettings = useAppStore((s) => s.updateSettings)
  const saveSettings = useAppStore((s) => s.saveSettings)
  const resetSettings = useAppStore((s) => s.resetSettings)
  const selectDotaDirectory = useAppStore((s) => s.selectDotaDirectory)
  const clearIconCache = useAppStore((s) => s.clearIconCache)
  const clearAllPresets = useAppStore((s) => s.clearAllPresets)

  const [savedSuccess, setSavedSuccess] = useState(false)

  const handleSave = async () => {
    const ok = await saveSettings()
    if (ok) {
      setSavedSuccess(true)
      setTimeout(() => setSavedSuccess(false), 2500)
    }
  }

  const handleClearPresets = () => {
    if (confirm('Clear all saved presets? This cannot be undone.')) {
      clearAllPresets()
    }
  }

  const handleResetDefaults = () => {
    if (confirm('Reset all settings to default values?')) {
      resetSettings()
    }
  }

  const handleClearCache = async () => {
    if (confirm('Clear all locally cached cosmetic item icons? They will be re-downloaded on demand.')) {
      await clearIconCache()
    }
  }

  const cacheCount = cacheStats?.count ?? 0
  const cacheSize = cacheStats?.formattedSize ?? '0 B'

  return (
    <section id="tabSettings" className="flex-1 h-full overflow-y-auto p-8">
      <div className="max-w-4xl mx-auto flex flex-col gap-6">
        <div>
          <h3 className="text-xl font-extrabold text-white">Settings</h3>
          <p className="text-xs text-slate-400 mt-1">
            Configure <span data-app-name>Dota 2 SkinForge</span> preferences and Dota 2 path
          </p>
        </div>

        {/* Installation */}
        <div className="p-5 rounded-xl bg-white/5 border border-white/10 flex flex-col gap-4">
          <div className="text-xs font-bold uppercase tracking-wider text-purple-400">Dota 2 Installation</div>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 py-2 border-b border-white/5">
            <div className="text-xs font-semibold text-white min-w-45">Game Directory</div>
            <div className="flex-1 flex items-center gap-2.5">
              <code
                id="settingsDotaPath"
                className="px-3 py-1.5 rounded-lg bg-black/40 border border-white/10 font-mono text-xs text-slate-300 flex-1 truncate"
              >
                {dotaPath || 'Not detected'}
              </code>
              <Button id="btnChangePathSettings" variant="ghost" size="sm" onClick={selectDotaDirectory}>
                Browse...
              </Button>
            </div>
          </div>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 py-2">
            <div className="text-xs font-semibold text-white min-w-45">Mod Folder Name</div>
            <div className="flex-1 flex flex-col gap-1">
              <input
                type="text"
                id="settingsModFolder"
                className="w-full max-w-xs bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white placeholder-slate-400 outline-none focus:border-purple-500/50"
                value={settings.modFolder}
                placeholder="skinforge"
                onChange={(e) => updateSettings({ modFolder: e.target.value })}
              />
              <span className="text-[11px] text-slate-400">Folder created inside the game directory. Avoid spaces.</span>
            </div>
          </div>
        </div>

        {/* Behavior */}
        <div className="p-5 rounded-xl bg-white/5 border border-white/10 flex flex-col gap-4">
          <div className="text-xs font-bold uppercase tracking-wider text-purple-400">Behavior</div>
          <div className="flex items-center justify-between gap-4 py-2 border-b border-white/5">
            <div>
              <div className="text-xs font-semibold text-white">Auto-detect game updates</div>
              <span className="text-[11px] text-slate-400 block mt-0.5">Show banner when Steam resets your mod files</span>
            </div>
            <div>
              <ToggleSwitch id="settingAutoDetect" checked={settings.autoDetect} onChange={(val) => updateSettings({ autoDetect: val })} />
            </div>
          </div>
          <div className="flex items-center justify-between gap-4 py-2 border-b border-white/5">
            <div>
              <div className="text-xs font-semibold text-white">Launch Dota 2 after applying</div>
              <span className="text-[11px] text-slate-400 block mt-0.5">Automatically launch Dota 2 once mods are applied</span>
            </div>
            <div>
              <ToggleSwitch
                id="settingLaunchAfter"
                checked={settings.launchAfter}
                onChange={(val) => updateSettings({ launchAfter: val })}
              />
            </div>
          </div>
          <div className="flex items-center justify-between gap-4 py-2">
            <div>
              <div className="text-xs font-semibold text-white">Confirm before restore</div>
              <span className="text-[11px] text-slate-400 block mt-0.5">Ask for confirmation before removing mods</span>
            </div>
            <div>
              <ToggleSwitch
                id="settingConfirmRestore"
                checked={settings.confirmRestore}
                onChange={(val) => updateSettings({ confirmRestore: val })}
              />
            </div>
          </div>
        </div>

        {/* Assets & Cache */}
        <div className="p-5 rounded-xl bg-white/5 border border-white/10 flex flex-col gap-4">
          <div className="text-xs font-bold uppercase tracking-wider text-purple-400">Assets & Icon Cache</div>
          <div className="flex items-center justify-between gap-4 py-2">
            <div>
              <div className="text-xs font-semibold text-white">Local Icon Cache</div>
              <span id="iconCacheStatsLabel" className="text-[11px] text-slate-400 block mt-0.5">
                {cacheCount} items cached ({cacheSize})
              </span>
            </div>
            <div>
              <Button id="btnClearIconCache" variant="secondary" size="sm" onClick={handleClearCache}>
                Clear Cache
              </Button>
            </div>
          </div>
        </div>

        {/* Danger Zone */}
        <div className="p-5 rounded-xl bg-rose-500/5 border border-rose-500/20 flex flex-col gap-4">
          <div className="text-xs font-bold uppercase tracking-wider text-rose-400">Danger Zone</div>
          <div className="flex items-center justify-between gap-4 py-2 border-b border-rose-500/10">
            <div className="text-xs font-semibold text-white">Clear all saved presets</div>
            <div>
              <Button id="btnClearPresets" variant="danger" size="sm" onClick={handleClearPresets}>
                Clear Presets
              </Button>
            </div>
          </div>
          <div className="flex items-center justify-between gap-4 py-2">
            <div className="text-xs font-semibold text-white">Reset all settings to default</div>
            <div>
              <Button id="btnResetSettings" variant="danger" size="sm" onClick={handleResetDefaults}>
                Reset Settings
              </Button>
            </div>
          </div>
        </div>

        {/* Save Row */}
        <div className="flex items-center gap-3 pt-2">
          <Button id="btnSaveSettings" variant="primary" onClick={handleSave}>
            Save Settings
          </Button>
          <span
            id="settingsSavedMsg"
            className={`text-xs font-semibold text-emerald-400 ${savedSuccess ? '' : 'hidden'}`}
          >
            ✅ Saved!
          </span>
        </div>
      </div>
    </section>
  )
}
