import { useEffect } from 'react'
import { AboutView } from './components/AboutView'
import { ConsoleFooter } from './components/ConsoleFooter'
import { HeroesView } from './components/HeroesView'
import { ItemSelectModal } from './components/ItemSelectModal'
import { LaunchView } from './components/LaunchView'
import { PresetNameModal } from './components/PresetNameModal'
import { PresetsView } from './components/PresetsView'
import { SettingsView } from './components/SettingsView'
import { Sidebar } from './components/Sidebar'
import { Topbar } from './components/Topbar'
import { useAppStore } from './state/useAppStore'

export const App = () => {
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
    <div className="flex w-screen h-screen relative overflow-hidden select-none bg-bg-app text-[#f8fafc]">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden relative bg-bg-app">
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
