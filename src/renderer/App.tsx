import React, { useEffect } from 'react'
import { ConsoleFooter } from './components/layout/ConsoleFooter'
import { Sidebar } from './components/layout/Sidebar'
import { Topbar } from './components/layout/Topbar'
import { BugReportModal } from './modals/BugReportModal'
import { CosmeticPickerModal } from './modals/CosmeticPickerModal'
import { DialogModal } from './modals/DialogModal'
import { PresetNameModal } from './modals/PresetNameModal'
import { UpdateModal } from './modals/UpdateModal'
import { WhatsNewModal } from './modals/WhatsNewModal'
import { useAppStore } from './state/useAppStore'
import { AboutView } from './views/AboutView'
import { ArmoryView } from './views/ArmoryView'
import { LaunchView } from './views/LaunchView'
import { PresetsView } from './views/PresetsView'
import { SettingsView } from './views/SettingsView'

class AppErrorBoundary extends React.Component<{ children: React.ReactNode }, { error: Error | null }> {
  state: { error: Error | null } = { error: null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex h-screen w-screen flex-col items-center justify-center gap-4 bg-bg-app p-8 text-center text-[#f8fafc] select-text">
          <h1 className="text-lg font-bold text-white">Something went wrong</h1>
          <p className="max-w-md text-xs text-slate-400">
            SkinForge encountered an unexpected UI error. Reloading usually recovers cleanly.
          </p>
          <pre className="max-w-lg overflow-auto rounded-lg border border-white/10 bg-black/40 p-3 text-left font-mono text-[11px] text-rose-300">
            {this.state.error.message}
          </pre>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="rounded-lg bg-purple-600 px-4 py-2 text-xs font-semibold text-white hover:bg-purple-500 cursor-pointer"
          >
            Reload App
          </button>
        </div>
      )
    }
    return this.props.children
  }
}

export const App = () => {
  const activeTab = useAppStore((s) => s.activeTab)
  const initApp = useAppStore((s) => s.initApp)

  useEffect(() => {
    void initApp()
  }, [initApp])

  useEffect(() => {
    const info = (typeof window !== 'undefined' && window.appInfo) || {
      name: 'Dota 2 SkinForge',
      tagline: 'Cosmetic Suite'
    }
    document.title = `${info.name} — ${info.tagline}`
  }, [])

  return (
    <AppErrorBoundary>
      <div className="flex w-screen h-screen relative overflow-hidden select-none bg-bg-app text-[#f8fafc]">
        <Sidebar />
        <div className="flex-1 flex flex-col overflow-hidden relative bg-bg-app">
          <Topbar />
          {activeTab === 'heroes' && <ArmoryView />}
          {activeTab === 'presets' && <PresetsView />}
          {activeTab === 'launch' && <LaunchView />}
          {activeTab === 'settings' && <SettingsView />}
          {activeTab === 'about' && <AboutView />}
          <ConsoleFooter />
        </div>
        <CosmeticPickerModal />
        <PresetNameModal />
        <UpdateModal />
        <WhatsNewModal />
        <BugReportModal />
        <DialogModal />
      </div>
    </AppErrorBoundary>
  )
}
