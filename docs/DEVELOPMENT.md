# Development Guide

Everything a developer needs to set up, build, test, debug, and extend Dota 2 SkinForge.

---

## 1. Getting Started

### Prerequisites
- Windows 10 / 11
- Node.js >= 18 and npm
- Dota 2 installed via Steam (needed for live mod testing and catalog/icon scripts; unit tests run without Dota 2)
- .NET 10 SDK (only needed when rebuilding `tools/wearable-merger`)

### Common Commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start Electron + Vite with hot reload |
| `npm run build` | Build production bundles into `out/` |
| `npm start` | Preview the built app from `out/` |
| `npm run typecheck` | Type-check Node, renderer, scripts, tests, and worker (`tsc -b --noEmit`) |
| `npm run lint` / `npm run lint:fix` | Run ESLint across the repo |
| `npm run format` / `npm run format:check` | Format or check `src/` with Prettier |
| `npm test` | Run all unit & data-integrity tests (`tsx --test test/*.test.ts`) |
| `npm run build:win` | Build `wearable-merger`, icon pack, app bundles, and portable `.exe` |
| `npm run armory` / `npm run armory:check` | Rebuild or verify `data/heroes_armory.json` from Dota's `items_game.txt` |
| `npm run build:styles` | Rebuild `data/itemStyles.json` from Dota's `items_game.txt` |
| `npm run extract:icons` / `npm run build:icon-pack` | Extract WebP item icons and rebuild `assets/icon-pack.tar.br` |
| `npm run build:ability-icons` | Rebuild `assets/ability-icons.tar.br` |
| `npm run sync:assets` / `npm run check:assets` | Package/upload R2 cosmetic assets and verify published hashes |

### Local `.env` Overrides
In unpackaged dev/CLI runs, `src/main/services/app/appPaths.ts` loads `.env` from the repo root (see `.env.example`):
- `SKINFORGE_ASSET_SOURCE` — local folder holding unpacked cosmetic overlay groups (checked before the R2 cache).
- `SKINFORGE_ASSET_CACHE` — override the downloaded R2 asset cache directory.
- `R2_*` — Cloudflare R2 credentials for `npm run sync:assets -- --upload`.

---

## 2. Adding Features

### Adding a New IPC Action
1. Add the channel name and TypeScript types in `src/shared/types/ipc.ts`.
2. Expose the method on `window.skinforge` in `src/preload/index.ts`.
3. Implement the handler in the matching domain file under `src/main/ipc/` (and put business logic in `src/main/services/`).
4. Call it from a Zustand slice in `src/renderer/state/slices/`.

### Adding a New UI View or Modal
- **Views** go in `src/renderer/views/` and are registered in `src/renderer/App.tsx`, `Sidebar.tsx`, and `navigationSlice.ts`.
- **Modals** go in `src/renderer/modals/` and **must wrap `src/renderer/components/ui/Modal.tsx`** so Escape handling, backdrop clicks, and styling stay consistent.
- **Persistence** in renderer slices should always use `src/renderer/state/storage.ts` (`STORAGE_KEYS`, `readJsonStorage`, `writeJsonStorage`, `removeStorageKeys`).

### Adding a New Pipeline Post-Compile Pass
1. Create a focused module in `src/main/services/pipeline/passes/` with a top-of-file comment explaining *why* it exists and where it sits in the pass order.
2. Wire it into `src/main/services/pipeline/selectionBuilder.ts` at the appropriate stage (before `readItemsSection(schemaContent)` validation and VPK packing).
3. Add a unit test under `test/`.

---

## 3. Fixing Bugs

1. **Reproduce without touching live Dota 2 first:**
   - Build a test VPK into `scratch/` using the selection smoke script:
     ```powershell
     npm run test:selection -- --pick "legion commander|head|Baneful Devotion"
     ```
   - Inspect `scratch/selection_items_game.txt` to see the exact `items_game.txt` diff.
   - Check direct asset references with:
     ```powershell
     npx tsx scripts/verify_pack_refs.ts --items scratch/selection_items_game.txt --pack scratch/test_selection/pak01_dir.vpk
     ```
   - Inspect one item's full dependency tree with:
     ```powershell
     npx tsx scripts/item_assets.ts --item 7247 --json
     ```
2. **Isolate the layer:**
   - Wrong item/slot/style in UI → check `src/shared/armory/` and `data/heroes_armory.json` / `data/itemStyles.json`.
   - Wrong `items_game.txt` output → check `src/main/services/modifier/` (`plan.ts`, `compile.ts`, `visuals.ts`) or `src/main/services/pipeline/passes/`.
   - Works on first spawn, breaks on reconnect → see [Cosmetics & Reconnect Guide](COSMETICS_AND_RECONNECT.md).
3. **Add a regression test** in `test/` covering the bug before finalizing the fix.
4. **Verify** with `npm run typecheck && npm run lint && npm test`.

---

## 4. Coding Conventions

- **Simplicity first:** Prefer straightforward, explicit functions over clever abstractions or tiny one-line wrapper files.
- **Clear boundaries:**
  - `src/shared/` — pure TS only (no Electron, Node `fs`, or DOM).
  - `src/renderer/` — UI and client state only; never import Node modules directly.
  - `src/main/` — filesystem, VPK, process, and network work.
- **Naming:** Use descriptive names that match actual responsibilities (e.g., `CatalogSidebar` rather than `HeroList` when it handles categories too; `overlayOwnedSlots` rather than `pickedSlots`).
- **Comments:** Explain **why** non-obvious rules, game engine workarounds, or ordering constraints exist in plain English. Skip comments that merely restate the next line of code.
- **No `any`:** Keep strict TypeScript types across all projects.
