import { Compass, Globe, Info, Layers, LayoutGrid, Music, Settings, Sparkles, Terminal } from 'lucide-react'
import React from 'react'
import { useAppStore } from '../state/useAppStore'

export const Sidebar: React.FC = () => {
  const activeTab = useAppStore((s) => s.activeTab)
  const activeCategoryGroup = useAppStore((s) => s.activeCategoryGroup)
  const setTab = useAppStore((s) => s.setTab)
  const status = useAppStore((s) => s.status)
  const dotaPath = useAppStore((s) => s.dotaPath)

  const appInfo = (typeof window !== 'undefined' && window.appInfo) || {
    name: 'Dota 2 SkinForge',
    displayVersion: 'v1.1',
    tagline: 'Cosmetic Suite'
  }

  // Determine status label and dot glow styling
  let statusText = 'Checking...'
  let dotColor = 'bg-amber-400 shadow-[0_0_8px_#f59e0b] animate-pulse'

  if (status) {
    if (status.installed && status.vpkFileExists) {
      statusText = 'Mods Active (vpk ready)'
      dotColor = 'bg-emerald-400 shadow-[0_0_8px_#10b981]'
    } else if (status.installed) {
      statusText = 'Mods Active'
      dotColor = 'bg-emerald-400 shadow-[0_0_8px_#10b981]'
    } else if (status.validDotaDir) {
      statusText = 'Vanilla (No Mods)'
      dotColor = 'bg-slate-400'
    } else {
      statusText = 'Dota Not Found'
      dotColor = 'bg-rose-500 shadow-[0_0_8px_#f43f5e]'
    }
  }

  const navBtnBase =
    'snav-btn w-full flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-slate-300 text-[13px] font-medium transition-all hover:bg-white/5 hover:text-white relative text-left outline-none cursor-pointer border border-transparent'
  const navBtnActive =
    'active bg-gradient-to-r from-purple-500/20 to-purple-500/5 text-white font-semibold border-purple-500/30 before:content-[""] before:absolute before:left-0 before:top-1.5 before:bottom-1.5 before:w-1 before:bg-[#8b5cf6] before:rounded-r before:shadow-[0_0_10px_#8b5cf6]'

  return (
    <aside className="w-55 h-full flex flex-col shrink-0 z-20 border-r border-white/5 bg-bg-sidebar">
      {/* Brand Header */}
      <div className="flex items-center gap-3 px-4.5 py-5.5 border-b border-white/5">
        <img
          className="w-9 h-9 rounded-[9px] object-cover border border-white/15 shadow-[0_0_16px_rgba(168,85,247,0.55),0_0_10px_rgba(6,182,212,0.45)] shrink-0 transition-transform duration-300 hover:scale-105"
          src="assets/icon.png"
          alt="Dota 2 SkinForge"
        />
        <div className="flex flex-col overflow-hidden">
          <span
            className="text-sm font-extrabold tracking-[0.8px] bg-linear-to-br from-white from-30% to-attr-uni bg-clip-text text-transparent whitespace-nowrap"
            data-app-name
          >
            {appInfo.name}
          </span>
          <span className="text-[10px] font-medium text-slate-400 tracking-[0.5px]" data-app-tagline>
            {appInfo.displayVersion} · {appInfo.tagline}
          </span>
        </div>
      </div>

      {/* Navigation Links */}
      <nav className="flex-1 p-2.5 flex flex-col gap-1 overflow-y-auto">
        <div className="text-[10px] font-bold tracking-wider uppercase text-slate-400 px-3 py-1">Cosmetics</div>

        <button
          id="navHeroes"
          data-tab="heroes"
          data-category="hero"
          className={`${navBtnBase} ${activeTab === 'heroes' && activeCategoryGroup === 'hero' ? navBtnActive : ''}`}
          onClick={() => setTab('heroes', 'hero')}
        >
          <Sparkles className="size-4.25 shrink-0" />
          <span>Heroes</span>
        </button>

        <button
          id="navWorld"
          data-tab="heroes"
          data-category="world"
          className={`${navBtnBase} ${activeTab === 'heroes' && activeCategoryGroup === 'world' ? navBtnActive : ''}`}
          onClick={() => setTab('heroes', 'world')}
        >
          <Globe className="size-4.25 shrink-0" />
          <span>World</span>
        </button>

        <button
          id="navInterface"
          data-tab="heroes"
          data-category="interface"
          className={`${navBtnBase} ${activeTab === 'heroes' && activeCategoryGroup === 'interface' ? navBtnActive : ''}`}
          onClick={() => setTab('heroes', 'interface')}
        >
          <LayoutGrid className="size-4.25 shrink-0" />
          <span>Interface</span>
        </button>

        <div className="h-px bg-white/5 my-1.5 mx-2.5" />
        <div className="text-[10px] font-bold tracking-wider uppercase text-slate-400 px-3 py-1">Library & Tools</div>

        <button
          id="navPresets"
          data-tab="presets"
          className={`${navBtnBase} ${activeTab === 'presets' ? navBtnActive : ''}`}
          onClick={() => setTab('presets')}
        >
          <Layers className="size-4.25 shrink-0" />
          <span>Presets</span>
        </button>

        <button
          id="navLaunch"
          data-tab="launch"
          className={`${navBtnBase} ${activeTab === 'launch' ? navBtnActive : ''}`}
          onClick={() => setTab('launch')}
        >
          <Terminal className="size-4.25 shrink-0" />
          <span>Launch</span>
        </button>

        <button
          id="navSettings"
          data-tab="settings"
          className={`${navBtnBase} ${activeTab === 'settings' ? navBtnActive : ''}`}
          onClick={() => setTab('settings')}
        >
          <Settings className="size-4.25 shrink-0" />
          <span>Settings</span>
        </button>

        <button
          id="navAbout"
          data-tab="about"
          className={`${navBtnBase} ${activeTab === 'about' ? navBtnActive : ''}`}
          onClick={() => setTab('about')}
        >
          <Info className="size-4.25 shrink-0" />
          <span>About</span>
        </button>
      </nav>

      {/* Sidebar Status Block */}
      <div className="p-3.5 border-t border-white/5 bg-black/20">
        <div id="statusIndicator" className="flex items-center gap-2 text-xs font-semibold mb-1">
          <span className={`w-2 h-2 rounded-full shrink-0 ${dotColor}`} />
          <span id="statusLabel">{statusText}</span>
        </div>
        <div id="dotaPathSidebar" className="text-[10px] text-slate-400 font-mono truncate" title={dotaPath}>
          {dotaPath || 'Not detected'}
        </div>
      </div>
    </aside>
  )
}
