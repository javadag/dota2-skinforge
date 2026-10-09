import React from 'react'

export const AboutView: React.FC = () => {
  const appInfo = (typeof window !== 'undefined' && window.appInfo) || {
    name: 'Dota 2 SkinForge',
    displayVersion: 'v1.0'
  }

  return (
    <section id="tabAbout" className="flex-1 h-full overflow-y-auto p-8">
      <div className="max-w-4xl mx-auto flex flex-col gap-8">
        <div className="flex items-center gap-6 p-6 rounded-2xl bg-white/5 border border-white/10 backdrop-blur-sm">
          <img
            className="w-16 h-16 rounded-2xl object-cover border-2 border-white/15 shadow-2xl shrink-0"
            src="assets/icon.png"
            alt="Dota 2 SkinForge Logo"
          />
          <div>
            <div className="text-2xl font-extrabold text-white tracking-tight" data-app-name>
              {appInfo.name}
            </div>
            <div className="text-xs text-slate-400 mt-1 font-medium" data-app-version-sub>
              {appInfo.displayVersion} — Local Cosmetic Suite
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="p-5 rounded-xl bg-white/5 border border-white/10 flex flex-col gap-2.5 hover:border-white/20 transition-all">
            <div className="text-2xl">🔮</div>
            <h4 className="text-sm font-bold text-white">How It Works</h4>
            <p className="text-xs text-slate-400 leading-relaxed">
              SkinForge injects a custom search path into <code>gameinfo_branchspecific.gi</code> and packages a
              modified <code>items_game.txt</code> into a VPK file. Source 2 loads our override before the base game
              files.
            </p>
          </div>

          <div className="p-5 rounded-xl bg-white/5 border border-white/10 flex flex-col gap-2.5 hover:border-white/20 transition-all">
            <div className="text-2xl">🛡️</div>
            <h4 className="text-sm font-bold text-white">No Code Injection</h4>
            <p className="text-xs text-slate-400 leading-relaxed">
              Unlike commercial tools, SkinForge does zero DLL or memory injection into <code>dota2.exe</code>. Everything
              is done via Valve&apos;s native asset loader. No VAC-banned technique is used.
            </p>
          </div>

          <div className="p-5 rounded-xl bg-white/5 border border-white/10 flex flex-col gap-2.5 hover:border-white/20 transition-all">
            <div className="text-2xl">🔄</div>
            <h4 className="text-sm font-bold text-white">Steam Updates</h4>
            <p className="text-xs text-slate-400 leading-relaxed">
              When Steam patches Dota 2, it resets <code>gameinfo_branchspecific.gi</code>. SkinForge detects this and
              shows a banner — one click re-applies all your slots in seconds.
            </p>
          </div>

          <div className="p-5 rounded-xl bg-white/5 border border-white/10 flex flex-col gap-2.5 hover:border-white/20 transition-all">
            <div className="text-2xl">🎨</div>
            <h4 className="text-sm font-bold text-white">Official Valve Content Only</h4>
            <p className="text-xs text-slate-400 leading-relaxed">
              Every cosmetic used is already on your disk inside Valve&apos;s official VPK archives. SkinForge just
              redirects which item ID loads into each slot — no third-party files needed.
            </p>
          </div>
        </div>

        {/* Disclaimer */}
        <div className="p-5 rounded-xl bg-amber-500/10 border border-amber-500/30 flex flex-col gap-2.5">
          <div className="flex items-center gap-2">
            <div className="text-xl">⚠️</div>
            <h4 className="text-sm font-bold text-amber-400">Use at Your Own Risk</h4>
          </div>
          <p className="text-xs text-amber-200/70 leading-relaxed">
            SkinForge modifies local game files on your machine. While it uses only Valve&apos;s
            native asset loading pipeline and does <strong className="text-amber-300">not</strong>{' '}
            inject code or memory into <code>dota2.exe</code>, the author makes no guarantees
            regarding Valve&apos;s Terms of Service, VAC status, or future game updates. Cosmetic
            changes are <strong className="text-amber-300">client-side only</strong> — other players
            cannot see them. Always use the{' '}
            <strong className="text-amber-300">Restore</strong> function before verifying game files
            in Steam. The author is not responsible for any bans, game corruption, or data loss.
          </p>
          <p className="text-[11px] text-amber-500/60 italic">
            Not affiliated with or endorsed by Valve Corporation.
          </p>
        </div>
      </div>
    </section>
  )
}
