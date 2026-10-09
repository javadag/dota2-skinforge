import React from 'react'
import { Check, RotateCcw, RefreshCw, AlertTriangle, Play } from 'lucide-react'
import { CATEGORY_META } from '../../data/categoryMeta'
import { Button } from './ui/Button'
import { useAppStore } from '../state/useAppStore'

export const Topbar: React.FC = () => {
  const activeTab = useAppStore((s) => s.activeTab)
  const activeCategoryGroup = useAppStore((s) => s.activeCategoryGroup)
  const status = useAppStore((s) => s.status)
  const isBusy = useAppStore((s) => s.isBusy)
  const progress = useAppStore((s) => s.progress)
  const patchAlertVisible = useAppStore((s) => s.patchAlertVisible)
  const setPatchAlertVisible = useAppStore((s) => s.setPatchAlertVisible)

  const launchDota = useAppStore((s) => s.launchDota)
  const applyMods = useAppStore((s) => s.applyMods)
  const restoreMods = useAppStore((s) => s.restoreMods)
  const refreshStatus = useAppStore((s) => s.refreshStatus)

  const appInfo = (typeof window !== 'undefined' && window.appInfo) || {
    name: 'Dota 2 SkinForge'
  }

  // Derive title & sub
  let title = 'Heroes & Cosmetics'
  let sub = 'Select a hero or category to configure per-slot cosmetics'

  if (activeTab === 'heroes') {
    const meta = CATEGORY_META[activeCategoryGroup] || CATEGORY_META.hero
    title = meta.title
    sub = meta.sub
  } else if (activeTab === 'presets') {
    title = 'Cosmetic Presets'
    sub = 'Manage and quickly apply full loadout presets'
  } else if (activeTab === 'launch') {
    title = 'Steam Launch Options'
    sub = 'Tweak launch flags for optimal FPS and engine startup'
  } else if (activeTab === 'settings') {
    title = 'Preferences & Storage'
    sub = 'Configure game directories and automation rules'
  } else if (activeTab === 'about') {
    title = `About ${appInfo.name}`
    sub = 'Architecture and safety guarantees'
  }

  const progressPercent = progress && progress.total > 0 ? Math.round((progress.step / progress.total) * 100) : 0

  return (
    <>
      <header className="topbar">
        <div className="topbar-left">
          <span id="topbarTitle" className="topbar-title">
            {title}
          </span>
          <span id="topbarSub" className="topbar-sub">
            {sub}
          </span>
        </div>

        <div className="topbar-right">
          <div id="dotaRunningPill" className={`running-pill ${status?.dotaRunning ? '' : 'hidden'}`}>
            <span className="pill-dot" /> Dota 2 Running
          </div>

          <Button
            id="btnPlayDota"
            variant="play"
            title="Launch Dota 2 via Steam"
            onClick={launchDota}
          >
            <Play className="w-3.5 h-3.5 fill-current" />
            <span>Play</span>
          </Button>

          <Button
            id="btnApplyAll"
            variant="primary"
            glow
            disabled={isBusy}
            onClick={applyMods}
          >
            <Check className="w-4 h-4" />
            <span>Apply Mods</span>
          </Button>

          <Button
            id="btnRestore"
            variant="ghost"
            disabled={isBusy}
            onClick={restoreMods}
          >
            <RotateCcw className="w-4 h-4" />
            <span>Restore</span>
          </Button>

          <Button
            id="btnRefreshTop"
            variant="icon"
            title="Refresh Status"
            onClick={refreshStatus}
          >
            <RefreshCw className={`w-4 h-4 ${isBusy ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </header>

      {/* Patch Alert Banner */}
      <div id="patchAlert" className={`patch-alert ${patchAlertVisible ? '' : 'hidden'}`}>
        <AlertTriangle className="alert-ico w-5 h-5 text-amber-400" />
        <span>
          Steam updated Dota 2 — your mods were reset. <strong>Re-apply now?</strong>
        </span>
        <Button id="btnReapply" variant="primary" size="sm" onClick={applyMods}>
          Quick Re-apply
        </Button>
        <button
          id="btnDismissAlert"
          className="btn-close-alert"
          onClick={() => setPatchAlertVisible(false)}
        >
          ×
        </button>
      </div>

      {/* Progress Bar Wrap */}
      <div id="progressBar" className={`progress-wrap ${progress ? '' : 'hidden'}`}>
        <div className="progress-info">
          <span id="progressMsg">{progress?.message || 'Working...'}</span>
          <span id="progressPct">{progressPercent}%</span>
        </div>
        <div className="progress-track">
          <div
            id="progressFill"
            className="progress-fill"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </div>
    </>
  )
}
