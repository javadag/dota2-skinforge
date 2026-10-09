import { AlertTriangle, Check, Play, RefreshCw, RotateCcw } from 'lucide-react'
import React from 'react'
import { CATEGORY_META } from '../../data/categoryMeta'
import { useAppStore } from '../state/useAppStore'
import { Button } from './ui/Button'

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
      <header className="h-16 px-6 flex items-center justify-between border-b border-white/5 bg-[#0e121d]/85 backdrop-blur-md z-10 shrink-0">
        <div className="flex flex-col">
          <span id="topbarTitle" className="text-base font-bold tracking-tight text-white">
            {title}
          </span>
          <span id="topbarSub" className="text-[11px] text-slate-400">
            {sub}
          </span>
        </div>

        <div className="flex items-center gap-2.5">
          <div
            id="dotaRunningPill"
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold text-emerald-400 border border-emerald-500/30 bg-emerald-500/10 ${
              status?.dotaRunning ? '' : 'hidden'
            }`}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_#10b981] animate-pulse" /> Dota 2 Running
          </div>

          <Button id="btnPlayDota" variant="play" title="Launch Dota 2 via Steam" onClick={launchDota}>
            <Play className="w-3.5 h-3.5 fill-current" />
            <span>Play</span>
          </Button>

          <Button id="btnApplyAll" variant="primary" glow disabled={isBusy} onClick={applyMods}>
            <Check className="w-4 h-4" />
            <span>Apply Mods</span>
          </Button>

          <Button id="btnRestore" variant="ghost" disabled={isBusy} onClick={restoreMods}>
            <RotateCcw className="w-4 h-4" />
            <span>Restore</span>
          </Button>

          <Button id="btnRefreshTop" variant="icon" title="Refresh Status" onClick={refreshStatus}>
            <RefreshCw className={`w-4 h-4 ${isBusy ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </header>

      {/* Patch Alert Banner */}
      <div
        id="patchAlert"
        className={`flex items-center gap-3 px-4 py-2.5 bg-amber-500/10 border-b border-amber-500/30 text-amber-200 text-xs shrink-0 ${
          patchAlertVisible ? '' : 'hidden'
        }`}
      >
        <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0" />
        <span className="flex-1">
          Steam updated Dota 2 — your mods were reset. <strong>Re-apply now?</strong>
        </span>
        <Button id="btnReapply" variant="primary" size="sm" onClick={applyMods}>
          Quick Re-apply
        </Button>
        <button
          id="btnDismissAlert"
          className="text-slate-400 hover:text-white text-lg px-2 cursor-pointer transition-colors"
          onClick={() => setPatchAlertVisible(false)}
        >
          ×
        </button>
      </div>

      {/* Progress Bar Wrap */}
      <div id="progressBar" className={`px-6 py-2 bg-black/30 border-b border-white/5 ${progress ? '' : 'hidden'}`}>
        <div className="flex justify-between text-xs text-slate-300 mb-1">
          <span id="progressMsg">{progress?.message || 'Working...'}</span>
          <span id="progressPct">{progressPercent}%</span>
        </div>
        <div className="w-full h-1.5 bg-white/10 rounded-full overflow-hidden">
          <div
            id="progressFill"
            className="h-full bg-linear-to-r from-purple-500 to-cyan-400 rounded-full transition-all duration-300"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </div>
    </>
  )
}
