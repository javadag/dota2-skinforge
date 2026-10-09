import React from 'react'

export const AboutView: React.FC = () => {
  const appInfo = (typeof window !== 'undefined' && window.appInfo) || {
    name: 'Dota 2 SkinForge',
    displayVersion: 'v1.0'
  }

  return (
    <section id="tabAbout" className="tab-section active">
      <div className="about-panel">
        <div className="about-hero-block">
          <img className="about-gem-logo" src="assets/icon.png" alt="Dota 2 SkinForge Logo" />
          <div>
            <div className="about-app-name" data-app-name>
              {appInfo.name}
            </div>
            <div className="about-app-sub" data-app-version-sub>
              {appInfo.displayVersion} — Local Cosmetic Suite
            </div>
          </div>
        </div>

        <div className="about-grid">
          <div className="about-card">
            <div className="about-card-icon">🔮</div>
            <h4>How It Works</h4>
            <p>
              SkinForge injects a custom search path into <code>gameinfo_branchspecific.gi</code> and packages a
              modified <code>items_game.txt</code> into a VPK file. Source 2 loads our override before the base game
              files.
            </p>
          </div>

          <div className="about-card">
            <div className="about-card-icon">🛡️</div>
            <h4>No Code Injection</h4>
            <p>
              Unlike commercial tools, SkinForge does zero DLL or memory injection into <code>dota2.exe</code>. Everything
              is done via Valve&apos;s native asset loader. No VAC-banned technique is used.
            </p>
          </div>

          <div className="about-card">
            <div className="about-card-icon">🔄</div>
            <h4>Steam Updates</h4>
            <p>
              When Steam patches Dota 2, it resets <code>gameinfo_branchspecific.gi</code>. SkinForge detects this and
              shows a banner — one click re-applies all your slots in seconds.
            </p>
          </div>

          <div className="about-card">
            <div className="about-card-icon">🎨</div>
            <h4>Official Valve Content Only</h4>
            <p>
              Every cosmetic used is already on your disk inside Valve&apos;s official VPK archives. SkinForge just
              redirects which item ID loads into each slot — no third-party files needed.
            </p>
          </div>
        </div>
      </div>
    </section>
  )
}
