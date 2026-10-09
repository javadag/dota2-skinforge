# ⚒️ Dota 2 SkinForge (v1.0)

A standalone desktop application built with Electron that enables official client-side cosmetic items (Arcanas, Immortals, Personas, Sound Effects, and Particles) in Dota 2 with per-slot equipment customization.

---

## 🚀 How to Launch

1. Double-click **`run.bat`** in this folder, or run:
   ```bash
   npm start
   ```
2. The modern dark UI will launch:
   - Auto-detects your Dota 2 installation path (e.g. `D:\SteamLibrary\steamapps\common\dota 2 beta\game`).
   - Checks if Dota 2 is running and whether mods are active.

---

## ⚡ Features

* **Per-Slot Cosmetic Configuration**:
  - Configure individual equipment slots (Weapon, Head, Shoulder, Armor, Arms, Back/Arcana, Taunt) per hero.
  - Interactive Slot Picker modal with official Valve cosmetics and Arcana variants.
* **Presets Management**:
  - Save full loadout configurations across all heroes as named presets.
  - Switch and apply presets with a single click.
* **Steam Launch Options**:
  - Built-in launch option generator (`-novid`, `-map dota`, `-high`, `-nojoy`, `-console`, `-dx11`).
* **Settings & Preferences**:
  - Custom game directory, custom mod folder name (`skinforge`), auto-patch detection, and launch automations.
* **1-Click Apply & Restore**:
  - Injects search paths into `gameinfo_branchspecific.gi`
  - Packages cosmetic schema into `pak01_dir.vpk`
  - 1-click restore back to vanilla unmodded Dota 2.
* **Zero Memory Injection**:
  - Does NOT hook `dota2.exe` memory or inject DLLs.
  - Relies strictly on Valve's native Source 2 VPK asset mounting engine.

---

## 📁 Project Architecture

```
skinforge/
├── main.js                 # Electron main process & IPC handlers
├── preload.js              # Secure IPC bridge (window.skinforge)
├── package.json            # Electron dependencies & metadata
├── run.bat                 # 1-Click launcher batch file
├── assets/                 # App icon & offline hero portraits
├── tools/
│   └── vpktool.exe         # Standalone VPK pack/unpack tool
├── data/
│   ├── heroes.json         # Complete offline hero catalog
│   └── mod_template.zip    # Base schema & assets template
└── src/
    ├── index.html          # Application UI
    ├── index.css           # Glassmorphism dark theme & responsive layout
    ├── renderer.js         # Reactive UI & event controller
    └── core/
        ├── dotaPath.js     # Auto-detection for Steam library & Dota 2
        ├── vpk.js          # Node wrapper for vpktool.exe
        ├── gameinfo.js     # SearchPaths injector for Source 2
        ├── signatures.js   # Signature backup & bypass handler
        └── pipeline.js     # Complete install/restore pipeline
```
