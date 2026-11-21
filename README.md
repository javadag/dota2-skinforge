# Dota 2 SkinForge

> **Client-side cosmetic loader for Dota 2 — no DLL injection, no memory writes.**

[![Platform: Windows](https://img.shields.io/badge/Platform-Windows-blue.svg)](https://www.microsoft.com/windows)
[![Electron](https://img.shields.io/badge/Built%20with-Electron-47848F?logo=electron)](https://www.electronjs.org/)
[![React](https://img.shields.io/badge/UI-React%2019-61DAFB?logo=react)](https://react.dev/)
[![Dota 2](https://img.shields.io/badge/Game-Dota%202-red?logo=steam)](https://www.dota2.com/)

**Dota 2 SkinForge** is a standalone Windows desktop app that lets you equip official Dota 2 cosmetics — Arcanas, Immortals, Personas, World items, Interface packs, and Ability Icons — locally and client-side using Valve's native Source 2 VPK asset-mounting system.

> **Use at Your Own Risk** — Read the [Disclaimer](#disclaimer) below before using.

---

## Features

| Feature                    | Description                                                                                |
| -------------------------- | ------------------------------------------------------------------------------------------ |
| **Per-Slot Cosmetics**     | Equip items, sets, styles, and Personas per hero, plus World & Interface categories        |
| **Custom Ability Icons**   | Override any hero's ability icons directly from Valve's spell icon library                 |
| **Preset Manager**         | Save full multi-hero loadouts and switch between them in one click                         |
| **Auto Patch Recovery**    | Detects when Steam updates reset `gameinfo_branchspecific.gi` and prompts a quick re-apply |
| **Launch Options Builder** | Configure and pass Steam launch flags (`-novid`, `-map dota`, `-high`, `-nojoy`, etc.)     |
| **Zero Memory Injection**  | Uses Valve's native VPK search-path loader — no DLL hooking or `dota2.exe` memory writes   |
| **1-Click Restore**        | Revert to vanilla unmodded Dota 2 at any time                                              |

---

## How It Works

1. **Reads Valve's stock `items_game.txt`** directly from your local Dota 2 VPK.
2. **Compiles your selected loadouts** into a patched `items_game.txt` and packages any required models, overlays, and reconnect merges into `pak01_dir.vpk` + `pak01_000.vpk`.
3. **Mounts the mod folder** in `gameinfo_branchspecific.gi` and refreshes `dota.signatures` so Source 2 loads your overrides cleanly.

---

## Getting Started

### Download Pre-built Binaries

Grab the latest release from **[GitHub Releases](https://github.com/javadag/dota2-skinforge/releases)**:

- **`Dota2SkinForge-Portable.exe`** — Portable single-file executable
- **`Dota2SkinForge-Setup-vX.X.X.exe`** — Windows installer

### Build from Source

Prerequisites:

- Windows 10 / 11
- [Node.js](https://nodejs.org/) >= 18
- [.NET 10 SDK](https://dotnet.microsoft.com/download) (required for `npm run build:win` / `build:wearable-merger`)
- Dota 2 installed via Steam

```powershell
git clone https://github.com/javadag/dota2-skinforge.git
cd dota2-skinforge
npm install

# Run in development mode (HMR)
npm run dev

# Build and preview locally
npm run build
npm start

# Build a portable Windows executable
npm run build:win
```

---

## Project Structure

```text
dota2-skinforge/
├── assets/                   # App icons, category SVGs, hero portraits, icon packs, reconnect catalogs
├── data/                     # Armory catalogs, item styles, overlay & package manifests
├── docs/                     # Architecture, development, and cosmetic maintenance guides
├── scripts/                  # Catalog, icon pack, asset sync, and smoke-test CLI scripts
├── test/                     # Unit & data-integrity test suites (node:test via tsx)
├── tools/wearable-merger/    # .NET 10 AOT tool for apply-time .vmdl_c reconnect merging
├── workers/bug-report/       # Cloudflare Worker relay for in-app bug reports
└── src/
    ├── main/                 # Electron main process (IPC + services: app, dota, assets, modifier, pipeline)
    ├── preload/              # Context-isolated IPC bridge (`window.skinforge`)
    ├── renderer/             # React 19 + Tailwind CSS v4 UI (views, modals, components, state, utils)
    └── shared/               # Pure domain types, armory catalog logic, constants, and shared utils
```

---

## Documentation

- **[Architecture Overview](docs/ARCHITECTURE.md)** — System diagram, folder map, and the Apply/Restore pipeline
- **[Development Guide](docs/DEVELOPMENT.md)** — Setup, scripts, adding features, fixing bugs, and coding conventions
- **[Cosmetics & Reconnect Guide](docs/COSMETICS_AND_RECONNECT.md)** — Adding heroes/Arcanas, reconnect merges, and asset cleanup
- **[Release Guide](RELEASE_GUIDE.md)** — Asset uploads, version pinning, and pushing release tags
- **[AI Agent Guidelines](AGENTS.md)** — Navigation rules and invariants for coding assistants

---

## Disclaimer

> **USE AT YOUR OWN RISK.**
>
> Dota 2 SkinForge modifies local game files (`gameinfo_branchspecific.gi`, `dota.signatures`, and a local VPK folder) on your machine. While it uses only Valve's native asset loading pipeline and does **not** inject code or memory into `dota2.exe`, **the author makes no guarantees regarding Valve's Terms of Service, VAC status, or future game updates.**
>
> - Cosmetic changes are **client-side only** — other players cannot see your overrides.
> - Always use **Restore** before uninstalling or verifying game files in Steam.
> - Not affiliated with or endorsed by Valve Corporation.

---

## License

MIT © Joad
