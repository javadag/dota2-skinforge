import React, { useState } from 'react'
import { Play } from 'lucide-react'
import { Button } from './ui/Button'
import { useAppStore } from '../state/useAppStore'

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
    <section id="tabLaunch" className="tab-section active">
      <div className="launch-panel">
        <div className="panel-header-block">
          <h3 className="panel-h3">Steam Launch Options</h3>
          <p className="panel-sub">Optimize Dota 2 startup performance and behavior</p>
        </div>

        <div className="tweaks-grid">
          <label className="tweak-card">
            <div className="tweak-info">
              <span className="tweak-title">
                Skip Intro Videos <code>-novid</code>
              </span>
              <span className="tweak-desc">Skip the Valve intro video on startup.</span>
            </div>
            <input
              type="checkbox"
              id="twNovid"
              className="tweak-toggle"
              checked={novid}
              onChange={(e) => setNovid(e.target.checked)}
            />
          </label>

          <label className="tweak-card">
            <div className="tweak-info">
              <span className="tweak-title">
                Preload Map <code>-map dota</code>
              </span>
              <span className="tweak-desc">
                Load the Dota map into RAM at launch — eliminates first-match freeze.
              </span>
            </div>
            <input
              type="checkbox"
              id="twMap"
              className="tweak-toggle"
              checked={map}
              onChange={(e) => setMap(e.target.checked)}
            />
          </label>

          <label className="tweak-card">
            <div className="tweak-info">
              <span className="tweak-title">
                High CPU Priority <code>-high</code>
              </span>
              <span className="tweak-desc">Boost process priority for smoother framerates in teamfights.</span>
            </div>
            <input
              type="checkbox"
              id="twHigh"
              className="tweak-toggle"
              checked={high}
              onChange={(e) => setHigh(e.target.checked)}
            />
          </label>

          <label className="tweak-card">
            <div className="tweak-info">
              <span className="tweak-title">
                Developer Console <code>-console</code>
              </span>
              <span className="tweak-desc">Enable the in-game developer console via ~ key.</span>
            </div>
            <input
              type="checkbox"
              id="twConsole"
              className="tweak-toggle"
              checked={consoleTweak}
              onChange={(e) => setConsoleTweak(e.target.checked)}
            />
          </label>

          <label className="tweak-card">
            <div className="tweak-info">
              <span className="tweak-title">
                Disable Gamepad Polling <code>-nojoy</code>
              </span>
              <span className="tweak-desc">Stop background controller polling to free CPU cycles.</span>
            </div>
            <input
              type="checkbox"
              id="twNojoy"
              className="tweak-toggle"
              checked={nojoy}
              onChange={(e) => setNojoy(e.target.checked)}
            />
          </label>

          <label className="tweak-card">
            <div className="tweak-info">
              <span className="tweak-title">
                Disable DirectX 11 Features <code>-dx11</code>
              </span>
              <span className="tweak-desc">Force DX11 for compatibility or stability on older GPUs.</span>
            </div>
            <input
              type="checkbox"
              id="twDx11"
              className="tweak-toggle"
              checked={dx11}
              onChange={(e) => setDx11(e.target.checked)}
            />
          </label>
        </div>

        <div className="launch-output-wrap">
          <div className="lou-header">
            <span>Generated Steam Launch String:</span>
            <div style={{ display: 'flex', gap: '8px' }}>
              <Button id="btnCopyLaunch" variant="ghost" size="sm" onClick={handleCopy}>
                {copied ? '✅ Copied!' : '📋 Copy'}
              </Button>
              <Button
                id="btnLaunchFromTweaks"
                variant="play"
                size="sm"
                title="Launch Dota 2 via Steam"
                onClick={launchDota}
              >
                <Play className="w-3.5 h-3.5 fill-current" />
                <span>Play Dota 2</span>
              </Button>
            </div>
          </div>
          <code id="launchOutput" className="launch-code">
            {launchString}
          </code>
          <ol className="launch-steps">
            <li>
              Open <strong>Steam</strong> → Library → Right-click <strong>Dota 2</strong> →{' '}
              <strong>Properties</strong>
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
