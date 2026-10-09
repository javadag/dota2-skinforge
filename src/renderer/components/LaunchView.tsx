import { Play } from 'lucide-react'
import React, { useState } from 'react'
import { useAppStore } from '../state/useAppStore'
import { Button } from './ui/Button'

export const LaunchView: React.FC = () => {
  const launchDota = useAppStore((s) => s.launchDota)

  const [novid, setNovid] = useState(true)
  const [map, setMap] = useState(true)
  const [high, setHigh] = useState(true)
  const [consoleTweak, setConsoleTweak] = useState(false)
  const [nojoy, setNojoy] = useState(true)
  const [dx11, setDx11] = useState(false)
  const [copied, setCopied] = useState(false)

  // Build launch string
  const flags: string[] = []
  if (novid) flags.push('-novid')
  if (map) flags.push('-map dota')
  if (high) flags.push('-high')
  if (consoleTweak) flags.push('-console')
  if (nojoy) flags.push('-nojoy')
  if (dx11) flags.push('-dx11')

  const launchString = flags.join(' ')

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
          <p className="text-xs text-slate-400 mt-1">Optimize Dota 2 startup performance and behavior</p>
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
              checked={novid}
              onChange={(e) => setNovid(e.target.checked)}
            />
          </label>

          <label className="p-4 rounded-xl bg-white/5 border border-white/10 flex items-center justify-between gap-4 cursor-pointer transition-all hover:bg-white/[0.07] hover:border-white/20 select-none">
            <div className="flex flex-col gap-1 min-w-0">
              <span className="text-xs font-bold text-white flex items-center gap-2">
                Preload Map <code className="text-[11px] font-mono px-1.5 py-0.5 rounded bg-black/40 text-purple-300">-map dota</code>
              </span>
              <span className="text-[11px] text-slate-400">
                Load the Dota map into RAM at launch — eliminates first-match freeze.
              </span>
            </div>
            <input
              type="checkbox"
              id="twMap"
              className="w-4 h-4 accent-purple-500 rounded cursor-pointer"
              checked={map}
              onChange={(e) => setMap(e.target.checked)}
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
              checked={high}
              onChange={(e) => setHigh(e.target.checked)}
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
              checked={consoleTweak}
              onChange={(e) => setConsoleTweak(e.target.checked)}
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
              checked={nojoy}
              onChange={(e) => setNojoy(e.target.checked)}
            />
          </label>

          <label className="p-4 rounded-xl bg-white/5 border border-white/10 flex items-center justify-between gap-4 cursor-pointer transition-all hover:bg-white/[0.07] hover:border-white/20 select-none">
            <div className="flex flex-col gap-1 min-w-0">
              <span className="text-xs font-bold text-white flex items-center gap-2">
                Disable DirectX 11 Features{' '}
                <code className="text-[11px] font-mono px-1.5 py-0.5 rounded bg-black/40 text-purple-300">-dx11</code>
              </span>
              <span className="text-[11px] text-slate-400">Force DX11 for compatibility or stability on older GPUs.</span>
            </div>
            <input
              type="checkbox"
              id="twDx11"
              className="w-4 h-4 accent-purple-500 rounded cursor-pointer"
              checked={dx11}
              onChange={(e) => setDx11(e.target.checked)}
            />
          </label>
        </div>

        <div className="p-5 rounded-xl bg-black/40 border border-white/10 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-300">Generated Steam Launch String:</span>
            <div className="flex gap-2">
              <Button id="btnCopyLaunch" variant="ghost" size="sm" onClick={handleCopy}>
                {copied ? '✅ Copied!' : '📋 Copy'}
              </Button>
              <Button id="btnLaunchFromTweaks" variant="play" size="sm" title="Launch Dota 2 via Steam" onClick={launchDota}>
                <Play className="w-3.5 h-3.5 fill-current" />
                <span>Play Dota 2</span>
              </Button>
            </div>
          </div>
          <code
            id="launchOutput"
            className="p-3 rounded-lg bg-black/60 border border-white/5 font-mono text-xs text-purple-300 select-all block"
          >
            {launchString}
          </code>
          <ol className="text-xs text-slate-400 pl-4 list-decimal flex flex-col gap-1">
            <li>
              Open <strong>Steam</strong> → Library → Right-click <strong>Dota 2</strong> → <strong>Properties</strong>
            </li>
            <li>
              Under <strong>General</strong>, paste the string above into <strong>Launch Options</strong>
            </li>
          </ol>
        </div>
      </div>
    </section>
  )
}
