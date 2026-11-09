import { Play } from 'lucide-react'
import React, { useState } from 'react'
import { buildLaunchArgsString, DEFAULT_LAUNCH_OPTIONS, useAppStore, type LaunchOptionsSettings } from '../state/useAppStore'
import { Button } from './ui/Button'

export const LaunchView: React.FC = () => {
  const settings = useAppStore((s) => s.settings)
  const updateSettings = useAppStore((s) => s.updateSettings)
  const launchDota = useAppStore((s) => s.launchDota)

  const [copied, setCopied] = useState(false)

  const launchOpts = {
    ...DEFAULT_LAUNCH_OPTIONS,
    ...(settings.launchOptions || {})
  }

  const setOption = <K extends keyof LaunchOptionsSettings>(key: K, value: LaunchOptionsSettings[K]) => {
    updateSettings({
      launchOptions: {
        ...launchOpts,
        [key]: value
      }
    })
  }

  const launchString = buildLaunchArgsString(launchOpts)

  const handleCopy = () => {
    navigator.clipboard.writeText(launchString)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <section id="tabLaunch" className="flex-1 h-full overflow-y-auto p-8">
      <div className="max-w-4xl mx-auto flex flex-col gap-6">
        <div>
          <h3 className="text-xl font-extrabold text-white">Steam Launch Options</h3>
          <p className="text-xs text-slate-400 mt-1">
            Optimize Dota 2 startup performance and behavior. Options configured here are automatically applied whenever you click Play.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
          <label className="p-4 rounded-xl bg-white/5 border border-white/10 flex items-center justify-between gap-4 cursor-pointer transition-all hover:bg-white/[0.07] hover:border-white/20 select-none">
            <div className="flex flex-col gap-1 min-w-0">
              <span className="text-xs font-bold text-white flex items-center gap-2">
                Skip Intro Videos <code className="text-[11px] font-mono px-1.5 py-0.5 rounded bg-black/40 text-purple-300">-novid</code>
              </span>
              <span className="text-[11px] text-slate-400">Skip the Valve intro video on startup.</span>
            </div>
            <input
              type="checkbox"
              id="twNovid"
              className="w-4 h-4 accent-purple-500 rounded cursor-pointer"
              checked={launchOpts.novid}
              onChange={(e) => setOption('novid', e.target.checked)}
            />
          </label>

          <label className="p-4 rounded-xl bg-white/5 border border-white/10 flex items-center justify-between gap-4 cursor-pointer transition-all hover:bg-white/[0.07] hover:border-white/20 select-none">
            <div className="flex flex-col gap-1 min-w-0">
              <span className="text-xs font-bold text-white flex items-center gap-2">
                Preload Map <code className="text-[11px] font-mono px-1.5 py-0.5 rounded bg-black/40 text-purple-300">-map dota</code>
              </span>
              <span className="text-[11px] text-slate-400">Load the Dota map into RAM at launch — eliminates first-match freeze.</span>
            </div>
            <input
              type="checkbox"
              id="twMap"
              className="w-4 h-4 accent-purple-500 rounded cursor-pointer"
              checked={launchOpts.map}
              onChange={(e) => setOption('map', e.target.checked)}
            />
          </label>

          <label className="p-4 rounded-xl bg-white/5 border border-white/10 flex items-center justify-between gap-4 cursor-pointer transition-all hover:bg-white/[0.07] hover:border-white/20 select-none">
            <div className="flex flex-col gap-1 min-w-0">
              <span className="text-xs font-bold text-white flex items-center gap-2">
                High CPU Priority <code className="text-[11px] font-mono px-1.5 py-0.5 rounded bg-black/40 text-purple-300">-high</code>
              </span>
              <span className="text-[11px] text-slate-400">Boost process priority for smoother framerates in teamfights.</span>
            </div>
            <input
              type="checkbox"
              id="twHigh"
              className="w-4 h-4 accent-purple-500 rounded cursor-pointer"
              checked={launchOpts.high}
              onChange={(e) => setOption('high', e.target.checked)}
            />
          </label>

          <label className="p-4 rounded-xl bg-white/5 border border-white/10 flex items-center justify-between gap-4 cursor-pointer transition-all hover:bg-white/[0.07] hover:border-white/20 select-none">
            <div className="flex flex-col gap-1 min-w-0">
              <span className="text-xs font-bold text-white flex items-center gap-2">
                Developer Console <code className="text-[11px] font-mono px-1.5 py-0.5 rounded bg-black/40 text-purple-300">-console</code>
              </span>
              <span className="text-[11px] text-slate-400">Enable the in-game developer console via ~ key.</span>
            </div>
            <input
              type="checkbox"
              id="twConsole"
              className="w-4 h-4 accent-purple-500 rounded cursor-pointer"
              checked={launchOpts.console}
              onChange={(e) => setOption('console', e.target.checked)}
            />
          </label>

          <label className="p-4 rounded-xl bg-white/5 border border-white/10 flex items-center justify-between gap-4 cursor-pointer transition-all hover:bg-white/[0.07] hover:border-white/20 select-none">
            <div className="flex flex-col gap-1 min-w-0">
              <span className="text-xs font-bold text-white flex items-center gap-2">
                Disable Gamepad Polling{' '}
                <code className="text-[11px] font-mono px-1.5 py-0.5 rounded bg-black/40 text-purple-300">-nojoy</code>
              </span>
              <span className="text-[11px] text-slate-400">Stop background controller polling to free CPU cycles.</span>
            </div>
            <input
              type="checkbox"
              id="twNojoy"
              className="w-4 h-4 accent-purple-500 rounded cursor-pointer"
              checked={launchOpts.nojoy}
              onChange={(e) => setOption('nojoy', e.target.checked)}
            />
          </label>

          <label className="p-4 rounded-xl bg-white/5 border border-white/10 flex items-center justify-between gap-4 cursor-pointer transition-all hover:bg-white/[0.07] hover:border-white/20 select-none">
            <div className="flex flex-col gap-1 min-w-0">
              <span className="text-xs font-bold text-white flex items-center gap-2">
                Force DirectX 11 <code className="text-[11px] font-mono px-1.5 py-0.5 rounded bg-black/40 text-purple-300">-dx11</code>
              </span>
              <span className="text-[11px] text-slate-400">Force DX11 for compatibility or stability on older GPUs.</span>
            </div>
            <input
              type="checkbox"
              id="twDx11"
              className="w-4 h-4 accent-purple-500 rounded cursor-pointer"
              checked={launchOpts.dx11}
              onChange={(e) => setOption('dx11', e.target.checked)}
            />
          </label>
        </div>

        {/* Additional custom arguments input */}
        <div className="p-4 rounded-xl bg-white/5 border border-white/10 flex flex-col gap-2">
          <label htmlFor="customArgsInput" className="text-xs font-bold text-white flex items-center gap-2">
            Additional Launch Arguments
          </label>
          <input
            id="customArgsInput"
            type="text"
            className="w-full px-3 py-2 text-xs rounded-lg bg-black/40 border border-white/10 text-white placeholder-slate-500 focus:outline-none focus:border-purple-500/50"
            placeholder="e.g. -fullscreen -refresh 144 +exec autoexec.cfg"
            value={launchOpts.customArgs || ''}
            onChange={(e) => setOption('customArgs', e.target.value)}
          />
          <span className="text-[11px] text-slate-400">Optional extra command-line flags to pass to Dota 2 upon launch.</span>
        </div>

        <div className="p-5 rounded-xl bg-black/40 border border-white/10 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-300">Generated Steam Launch String:</span>
            <div className="flex gap-2">
              <Button id="btnCopyLaunch" variant="ghost" size="sm" onClick={handleCopy}>
                {copied ? '✅ Copied!' : '📋 Copy'}
              </Button>
              <Button id="btnLaunchFromTweaks" variant="play" size="sm" title="Launch Dota 2 with these parameters" onClick={launchDota}>
                <Play className="w-3.5 h-3.5 fill-current" />
                <span>Play Dota 2</span>
              </Button>
            </div>
          </div>
          <code
            id="launchOutput"
            className="p-3 rounded-lg bg-black/60 border border-white/5 font-mono text-xs text-purple-300 select-all block"
          >
            {launchString || '(no parameters)'}
          </code>
          <div className="text-xs text-slate-400 flex flex-col gap-1.5 bg-purple-500/10 border border-purple-500/20 p-3 rounded-lg">
            <div className="text-purple-300 font-semibold flex items-center gap-1.5">
              <span>💡</span> Auto-applied by SkinForge
            </div>
            <div>
              When you click <strong>Play</strong> (here or in the top bar), SkinForge automatically launches Dota 2 with these parameters
              via Steam.
            </div>
            <div className="text-[11px] text-slate-400">
              To also use these flags when starting Dota 2 directly from Steam or your desktop shortcut: copy the string above, open Steam →
              Right-click Dota 2 → Properties → General, and paste into <strong>Launch Options</strong>.
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
