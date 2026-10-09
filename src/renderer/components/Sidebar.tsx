import React from 'react'
import {
  Sparkles,
  Globe,
  Music,
  Zap,
  LayoutGrid,
  Layers,
  Terminal,
  Settings,
  Info
} from 'lucide-react'
import { useAppStore } from '../state/useAppStore'

export const Sidebar: React.FC = () => {
  const activeTab = useAppStore((s) => s.activeTab)
  const activeCategoryGroup = useAppStore((s) => s.activeCategoryGroup)
  const setTab = useAppStore((s) => s.setTab)
  const status = useAppStore((s) => s.status)
  const dotaPath = useAppStore((s) => s.dotaPath)

  const appInfo = (typeof window !== 'undefined' && window.appInfo) || {
    name: 'Dota 2 SkinForge',
    displayVersion: 'v1.0',
    tagline: 'Cosmetic Suite'
  }

  // Determine status label and CSS class
  let statusClass = 'checking'
  let statusText = 'Checking...'

  if (status) {
    if (status.installed && status.vpkFileExists) {
      statusClass = 'installed'
      statusText = 'Mods Active (vpk ready)'
    } else if (status.installed) {
      statusClass = 'installed'
      statusText = 'Mods Active'
    } else if (status.validDotaDir) {
      statusClass = 'vanilla'
      statusText = 'Vanilla (No Mods)'
    } else {
      statusClass = 'notfound'
      statusText = 'Dota Not Found'
    }
  }

  return (
    <aside className="sidebar">
      {/* Brand Header */}
      <div className="sidebar-brand">
        <img className="brand-logo" src="assets/icon.png" alt="Dota 2 SkinForge" />
        <div className="brand-text">
          <span className="brand-name" data-app-name>
            {appInfo.name}
          </span>
          <span className="brand-tagline" data-app-tagline>
            {appInfo.displayVersion} · {appInfo.tagline}
          </span>
        </div>
      </div>

      {/* Navigation Links */}
      <nav className="sidebar-nav">
        <div className="snav-header">Cosmetics</div>

        <button
          id="navHeroes"
          data-tab="heroes"
          data-category="hero"
          className={`snav-btn ${activeTab === 'heroes' && activeCategoryGroup === 'hero' ? 'active' : ''}`}
          onClick={() => setTab('heroes', 'hero')}
        >
          <Sparkles className="snav-icon" />
          <span>Heroes</span>
        </button>

        <button
          id="navWorld"
          data-tab="heroes"
          data-category="maps"
          className={`snav-btn ${activeTab === 'heroes' && activeCategoryGroup === 'maps' ? 'active' : ''}`}
          onClick={() => setTab('heroes', 'maps')}
        >
          <Globe className="snav-icon" />
          <span>Creeps & World</span>
        </button>

        <button
          id="navAudio"
          data-tab="heroes"
          data-category="icons"
          className={`snav-btn ${activeTab === 'heroes' && activeCategoryGroup === 'icons' ? 'active' : ''}`}
          onClick={() => setTab('heroes', 'icons')}
        >
          <Music className="snav-icon" />
          <span>Music & Sounds</span>
        </button>

        <button
          id="navEffects"
          data-tab="heroes"
          data-category="ranged attack"
          className={`snav-btn ${activeTab === 'heroes' && activeCategoryGroup === 'ranged attack' ? 'active' : ''}`}
          onClick={() => setTab('heroes', 'ranged attack')}
        >
          <Zap className="snav-icon" />
          <span>Effects & Items</span>
        </button>

        <button
          id="navInterface"
          data-tab="heroes"
          data-category="cursor"
          className={`snav-btn ${activeTab === 'heroes' && activeCategoryGroup === 'cursor' ? 'active' : ''}`}
          onClick={() => setTab('heroes', 'cursor')}
        >
          <LayoutGrid className="snav-icon" />
          <span>Interface & HUD</span>
        </button>

        <div className="snav-divider" />
        <div className="snav-header">Library & Tools</div>

        <button
          id="navPresets"
          data-tab="presets"
          className={`snav-btn ${activeTab === 'presets' ? 'active' : ''}`}
          onClick={() => setTab('presets')}
        >
          <Layers className="snav-icon" />
          <span>Presets</span>
        </button>

        <button
          id="navLaunch"
          data-tab="launch"
          className={`snav-btn ${activeTab === 'launch' ? 'active' : ''}`}
          onClick={() => setTab('launch')}
        >
          <Terminal className="snav-icon" />
          <span>Launch</span>
        </button>

        <button
          id="navSettings"
          data-tab="settings"
          className={`snav-btn ${activeTab === 'settings' ? 'active' : ''}`}
          onClick={() => setTab('settings')}
        >
          <Settings className="snav-icon" />
          <span>Settings</span>
        </button>

        <button
          id="navAbout"
          data-tab="about"
          className={`snav-btn ${activeTab === 'about' ? 'active' : ''}`}
          onClick={() => setTab('about')}
        >
          <Info className="snav-icon" />
          <span>About</span>
        </button>
      </nav>

      {/* Sidebar Status Block */}
      <div className="sidebar-status-block">
        <div id="statusIndicator" className={`status-indicator ${statusClass}`}>
          <span className="si-dot" />
          <span id="statusLabel">{statusText}</span>
        </div>
        <div id="dotaPathSidebar" className="si-path">
          {dotaPath || 'Not detected'}
        </div>
      </div>
    </aside>
  )
}
