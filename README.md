# ⚒️ Dota 2 SkinForge

> **Client-side cosmetic loader for Dota 2 — no DLL injection, no third-party files.**

[![License: MIT](https://img.shields.io/badge/License-MIT-purple.svg)](LICENSE)
[![Platform: Windows](https://img.shields.io/badge/Platform-Windows-blue.svg)](https://www.microsoft.com/windows)
[![Electron](https://img.shields.io/badge/Built%20with-Electron-47848F?logo=electron)](https://www.electronjs.org/)
[![React](https://img.shields.io/badge/UI-React%2019-61DAFB?logo=react)](https://react.dev/)
[![Dota 2](https://img.shields.io/badge/Game-Dota%202-red?logo=steam)](https://www.dota2.com/)

---

**Dota 2 SkinForge** is a standalone Windows desktop application that lets you equip any official Valve cosmetic — Arcanas, Immortals, Personas, Sound Effects, and Particle effects — on any hero slot, locally and client-side only. It uses Valve's own Source 2 VPK asset-mounting system with zero memory injection.

> ⚠️ **Use at Your Own Risk** — See the [Disclaimer](#%EF%B8%8F-disclaimer) section before using.

---

## ✨ Features

| Feature                       | Description                                                                                         |
| ----------------------------- | --------------------------------------------------------------------------------------------------- |
| 🎨 **Per-Slot Cosmetics**     | Equip any item on Weapon, Head, Shoulder, Armor, Arms, Back/Arcana, and Taunt slots per hero        |
| 🗂️ **Preset Manager**         | Save full hero loadouts as named presets and switch between them in one click                       |
| 🔄 **Auto Patch Recovery**    | Detects when Steam updates reset `gameinfo_branchspecific.gi` and re-applies your config in seconds |
| 🚀 **Launch Options Builder** | Generates and copies Steam launch flags (`-novid`, `-map dota`, `-high`, `-nojoy`, etc.)            |
| 🛡️ **Zero Memory Injection**  | No DLL hooking, no `dota2.exe` memory writes — uses only Valve's native VPK loader                  |
| 📦 **Official Content Only**  | Every cosmetic is already on your disk inside Valve's VPK archives — no third-party files           |
| ↩️ **1-Click Restore**        | Instantly revert to vanilla unmodded Dota 2 at any time                                             |
| ⚙️ **Settings Panel**         | Custom Dota 2 path, mod folder name, auto-patch detection, and launch automations                   |

---

## 🖥️ How It Works

SkinForge works entirely through Valve's legitimate asset pipeline:

1. **Injects a custom search path** into `gameinfo_branchspecific.gi` — telling Source 2 to load your override folder before the base game VPKs.
2. **Packages a modified `items_game.txt`** into a `pak01_dir.vpk` file that remaps cosmetic item IDs per slot.
3. **Source 2 loads your overrides first** — swapping which cosmetic model/texture renders in your client.

No code injection. No banned techniques. No third-party assets.

---

## 🚀 Getting Started

### 📥 Download Pre-built Binaries

Grab the latest executable directly from **[Releases](https://github.com/javadag/dota2-skinforge/releases)**:

- **`Dota2SkinForge-Portable.exe`** — Portable version (no installation needed)
- **`Dota2SkinForge-Setup-vX.X.X.exe`** — Windows Installer with desktop & start menu shortcuts

---

### Prerequisites (for building from source)

- Windows 10 / 11
- [Node.js](https://nodejs.org/) ≥ 18
- Dota 2 installed via Steam

### Run from Source

```bash
# Clone the repo
git clone https://github.com/javadag/dota2-skinforge.git
cd dota2-skinforge

# Install dependencies
npm install

# Start in development mode
npm run dev

# Or build a portable executable
npm run build:win
```

### Quick Launch (pre-built)

Double-click **`run.bat`** in the project folder, or run:

```bash
npm start
```

The app will auto-detect your Dota 2 installation and check mod status on startup.

---

## 📁 Project Structure

```
dota2-skinforge/
├── run.bat                     # 1-click launcher
├── assets/                     # App icons, category SVGs, slot SVGs & hero portraits
├── tools/
│   └── vpktool.exe             # Standalone VPK pack/unpack utility
├── data/
│   ├── heroes.json             # Official Dota 2 hero catalog (127 heroes)
│   ├── categories.json         # Non-hero cosmetic categories (World & Interface)
│   ├── valveHeroCatalog.json   # Authentic Valve loadout catalog
│   └── mod_template.zip        # Base schema & assets template
└── src/
    ├── main/                   # Electron main process (TypeScript)
    │   ├── index.ts            # App lifecycle & window manager
    │   ├── ipc/                # Domain IPC handlers (mods, settings, system)
    │   └── services/           # Domain services (pipeline, gameinfo, VPK, modifier)
    ├── preload/                # Secure IPC bridge (TypeScript)
    └── renderer/               # React UI (TypeScript)
        ├── state/              # Zustand store & EventTarget bus
        ├── components/         # Views: HeroList, SlotEditor, Presets, Settings, Launch, About
        └── utils/              # Item images, rarity styling, SVG armory card generator
```

---

## 🛠️ Tech Stack

- **[Electron](https://www.electronjs.org/)** — cross-process desktop shell
- **[React 19](https://react.dev/) + TypeScript** — renderer UI
- **[Tailwind CSS v4](https://tailwindcss.com/)** — utility-first styling
- **[Zustand](https://github.com/pmndrs/zustand)** — lightweight state management
- **[electron-vite](https://electron-vite.org/)** — fast HMR dev workflow
- **[electron-builder](https://www.electron.build/)** — portable & NSIS installer packaging

---

## ⚠️ Disclaimer

> **USE AT YOUR OWN RISK.**
>
> Dota 2 SkinForge modifies local game files (`gameinfo_branchspecific.gi`, VPK overrides) on your machine. While this tool uses only Valve's native asset loading pipeline and does **not** inject code or memory into `dota2.exe`, **the author makes no guarantees regarding Valve's Terms of Service, VAC status, or future game updates breaking functionality.**
>
> - Cosmetic changes are **client-side only** — other players do not see your overrides.
> - The author is **not responsible** for any bans, game corruption, or data loss resulting from use of this software.
> - Always use the **Restore** function before uninstalling or verifying game files in Steam.
> - This tool is **not affiliated with or endorsed by Valve Corporation**.

---

## 🤝 Contributing

Pull requests are welcome! For major changes, please open an issue first.

1. Fork the repo
2. Create your feature branch (`git checkout -b feature/my-feature`)
3. Commit your changes (`git commit -m 'Add my feature'`)
4. Push to the branch (`git push origin feature/my-feature`)
5. Open a Pull Request

---

## 📄 License

[MIT](LICENSE) © Joad

---

> _Dota 2 is a trademark of Valve Corporation. This project is not affiliated with or endorsed by Valve._
