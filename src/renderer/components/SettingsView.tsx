import React, { useState } from 'react'
import { Button } from './ui/Button'
import { ToggleSwitch } from './ui/ToggleSwitch'
import { useAppStore } from '../state/useAppStore'

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
    <section id="tabSettings" className="tab-section active">
      <div className="settings-panel">
        <div className="panel-header-block">
          <h3 className="panel-h3">Settings</h3>
          <p className="panel-sub">
            Configure <span data-app-name>Dota 2 SkinForge</span> preferences and Dota 2 path
          </p>
        </div>

        {/* Installation */}
        <div className="settings-group">
          <div className="sg-title">Dota 2 Installation</div>
          <div className="sg-row">
            <div className="sg-label">Game Directory</div>
            <div className="sg-control path-row">
              <code id="settingsDotaPath" className="path-code">
                {dotaPath || 'Not detected'}
              </code>
              <Button id="btnChangePathSettings" variant="ghost" size="sm" onClick={selectDotaDirectory}>
                Browse...
              </Button>
            </div>
          </div>
          <div className="sg-row">
            <div className="sg-label">Mod Folder Name</div>
            <div className="sg-control">
              <input
                type="text"
                id="settingsModFolder"
                className="settings-input"
                value={settings.modFolder}
                placeholder="skinforge"
                onChange={(e) => updateSettings({ modFolder: e.target.value })}
              />
              <span className="sg-hint">Folder created inside the game directory. Avoid spaces.</span>
            </div>
          </div>
        </div>

        {/* Behavior */}
        <div className="settings-group">
          <div className="sg-title">Behavior</div>
          <div className="sg-row">
            <div className="sg-label">Auto-detect game updates</div>
            <div className="sg-control">
              <ToggleSwitch
                id="settingAutoDetect"
                checked={settings.autoDetect}
                onChange={(val) => updateSettings({ autoDetect: val })}
              />
              <span className="sg-hint">Show banner when Steam resets your mod files</span>
            </div>
          </div>
          <div className="sg-row">
            <div className="sg-label">Launch Dota 2 after applying</div>
            <div className="sg-control">
              <ToggleSwitch
                id="settingLaunchAfter"
                checked={settings.launchAfter}
                onChange={(val) => updateSettings({ launchAfter: val })}
              />
              <span className="sg-hint">Automatically launch Dota 2 once mods are applied</span>
            </div>
          </div>
          <div className="sg-row">
            <div className="sg-label">Confirm before restore</div>
            <div className="sg-control">
              <ToggleSwitch
                id="settingConfirmRestore"
                checked={settings.confirmRestore}
                onChange={(val) => updateSettings({ confirmRestore: val })}
              />
              <span className="sg-hint">Ask for confirmation before removing mods</span>
            </div>
          </div>
        </div>

        {/* Assets & Cache */}
        <div className="settings-group">
          <div className="sg-title">Assets & Icon Cache</div>
          <div className="sg-row">
            <div className="sg-label">Local Icon Cache</div>
            <div className="sg-control" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span id="iconCacheStatsLabel" className="sg-hint" style={{ color: 'var(--text-main)' }}>
                {cacheCount} items cached ({cacheSize})
              </span>
              <Button id="btnClearIconCache" variant="secondary" size="sm" onClick={handleClearCache}>
                Clear Cache
              </Button>
            </div>
          </div>
        </div>

        {/* Danger Zone */}
        <div className="settings-group">
          <div className="sg-title">Danger Zone</div>
          <div className="sg-row">
            <div className="sg-label">Clear all saved presets</div>
            <div className="sg-control">
              <Button id="btnClearPresets" variant="danger" size="sm" onClick={handleClearPresets}>
                Clear Presets
              </Button>
            </div>
          </div>
          <div className="sg-row">
            <div className="sg-label">Reset all settings to default</div>
            <div className="sg-control">
              <Button id="btnResetSettings" variant="danger" size="sm" onClick={handleResetDefaults}>
                Reset Settings
              </Button>
            </div>
          </div>
        </div>

        {/* Save Row */}
        <div className="settings-save-row">
          <Button id="btnSaveSettings" variant="primary" onClick={handleSave}>
            Save Settings
          </Button>
          <span
            id="settingsSavedMsg"
            className={`settings-saved-msg ${savedSuccess ? '' : 'hidden'}`}
          >
            ✅ Saved!
          </span>
        </div>
      </div>
    </section>
  )
}
