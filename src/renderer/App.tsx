import React, { useEffect } from 'react'
import { Sidebar } from './components/Sidebar'
import { Topbar } from './components/Topbar'
import { HeroesView } from './components/HeroesView'
import { PresetsView } from './components/PresetsView'
import { LaunchView } from './components/LaunchView'
import { SettingsView } from './components/SettingsView'
import { AboutView } from './components/AboutView'
import { ConsoleFooter } from './components/ConsoleFooter'
import { ItemSelectModal } from './components/ItemSelectModal'
import { PresetNameModal } from './components/PresetNameModal'
import { useAppStore } from './state/useAppStore'

export const App: React.FC = () => {
  const activeTab = useAppStore((s) => s.activeTab)
  const initApp = useAppStore((s) => s.initApp)

  useEffect(() => {
    initApp()
  }, [initApp])

  useEffect(() => {
    const info = (typeof window !== 'undefined' && window.appInfo) || {
      name: 'Dota 2 SkinForge',
      tagline: 'Cosmetic Suite'
    }
    document.title = `${info.name} — ${info.tagline}`
  }, [])

  return (
    <div className="app-shell">
      <Sidebar />
      <div className="main-area">
        <Topbar />
        {activeTab === 'heroes' && <HeroesView />}
        {activeTab === 'presets' && <PresetsView />}
        {activeTab === 'launch' && <LaunchView />}
        {activeTab === 'settings' && <SettingsView />}
        {activeTab === 'about' && <AboutView />}
        <ConsoleFooter />
      </div>
      <ItemSelectModal />
      <PresetNameModal />
    </div>
  )
}
