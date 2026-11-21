# AI Agent Guidelines — Dota 2 SkinForge

This file helps AI coding assistants navigate, modify, and verify the repository safely without breaking game compatibility or user data.

## 1. Repository Map

| Path                          | Responsibility                                                                                                                                                                                    |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/main/index.ts`           | Electron app lifecycle, window creation, single-instance lock                                                                                                                                     |
| `src/main/ipc/`               | Domain IPC routers (`mods`, `settings`, `system`, `update`, `bugReport`)                                                                                                                          |
| `src/main/services/app/`      | App paths, settings persistence, auto-updater, bug-report client                                                                                                                                  |
| `src/main/services/dota/`     | Steam/Dota detection, `gameinfo_branchspecific.gi`, `dota.signatures`, VPK reader/packer, schema drift baseline                                                                                   |
| `src/main/services/assets/`   | Armory lookups, cosmetic overlays, R2 package downloads, icon packs & `skinforge-icon://` protocol, ability icon resolver                                                                         |
| `src/main/services/modifier/` | Span-preserving VDF parser, schema index, loadout planner, `items_game.txt` compiler                                                                                                              |
| `src/main/services/pipeline/` | High-level mod build (`selectionBuilder.ts`), install/uninstall (`packInstaller.ts`), status (`pipelineStatus.ts`), VDF block patcher (`itemsGamePatcher.ts`), and ordered post-compile `passes/` |
| `src/preload/index.ts`        | Secure `contextBridge` exposing `window.skinforge` and `window.appInfo`                                                                                                                           |
| `src/renderer/`               | React 19 UI: `views/`, `modals/`, `components/` (`layout/`, `armory/`, `ui/`), `state/` (Zustand slices + `storage.ts`), `utils/` (SVG/image fallbacks)                                           |
| `src/shared/`                 | Pure TypeScript shared by main, preload, renderer, scripts, and Cloudflare Worker (`armory/`, `constants/`, `types/`, `utils/`)                                                                   |
| `tools/wearable-merger/`      | .NET 10 AOT C# tool that merges `.vmdl_c` models for reconnect safety                                                                                                                             |
| `workers/bug-report/`         | Cloudflare Worker relay that turns sanitized in-app bug reports into GitHub Issues                                                                                                                |
| `scripts/`                    | CLI maintenance scripts (armory/style generation, icon packs, R2 asset sync, smoke tests)                                                                                                         |
| `test/`                       | Unit and data-integrity tests (`tsx --test test/*.test.ts`)                                                                                                                                       |

## 2. Critical Invariants (Do Not Break)

1. **Keep `src/shared/` pure:** Never import `electron`, `fs`, `path`, or DOM APIs inside `src/shared/`. Both the Electron renderer and the Cloudflare Worker (`workers/bug-report`) import from `src/shared/`.
2. **Never ship an unvalidated `items_game.txt`:** `compileItemsGame` validates the compiled VDF, and `selectionBuilder.ts` runs a final `readItemsSection(schemaContent)` check after all post-compile passes. Never bypass validation.
3. **Preserve post-compile pass order in `selectionBuilder.ts`:**
   1. Overlay schema patches
   2. `stripReplacedBodyWearableModel`
   3. `routeWearableModelMerges` (must run _before_ empty-slot attachment routing)
   4. `routeEmptySlotWearables`
   5. `resolveOverlayParticleConflicts`
   6. `resolveOverlayAbilityIcons`
   7. `applyAbilityIconOverrides` (must run _last_ so user overrides win)
4. **Preserve user persistence compatibility:** Do not rename `localStorage` keys in `src/renderer/state/storage.ts`, `skinforge_settings.json` fields, `IPC_CHANNELS` strings, or `skinforge-icon://` URLs without a migration path.
5. **Never touch Dota 2 while running or leave unsigned `gameinfo`:** `packInstaller.ts` refuses to install/uninstall while `dota2.exe` is running and rolls back `gameinfo_branchspecific.gi` if `dota.signatures` fails to update.
6. **Never commit secrets or local machine paths:** Keep `.env`, `docs/d2c-investigation/`, and personal `D:\...` paths out of tracked source code.
7. **Cosmetic cleanup & reconnect work:** Follow [docs/COSMETICS_AND_RECONNECT.md](docs/COSMETICS_AND_RECONNECT.md) before editing `data/cosmetic-assets.json`, `assets/reconnect/`, or compiled `.vmdl_c` files.

## 3. Coding Style

- Prefer simple, explicit code over clever abstractions.
- Reuse `src/renderer/components/ui/Modal.tsx` for all dialogs and `src/renderer/state/storage.ts` for `localStorage`.
- Write comments that explain **why** (game quirks, Source 2 reconnect rules, precedence) in plain English rather than restating what the code does.
- Keep `tsconfig.node.json` and `tsconfig.web.json` clean; no `any` (`@typescript-eslint/no-explicit-any` is an error).

## 4. Required Verification

Before finishing any code change, run:

```powershell
npm run typecheck
npm run lint
npm test
```

If you changed main, preload, renderer, or Vite config, also verify the production bundle:

```powershell
npm run build
```
