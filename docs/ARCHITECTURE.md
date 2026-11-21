# Architecture Overview

Dota 2 SkinForge is an Electron desktop application split into four layers — **Main**, **Preload**, **Renderer**, and **Shared** — plus two small companion projects: a C# `.vmdl_c` merger (`tools/wearable-merger`) and a Cloudflare Worker bug-report relay (`workers/bug-report`).

```text
┌───────────────────────────┐     IPC (contextBridge)     ┌───────────────────────────────┐
│   Renderer (React 19)     │ ◄─────────────────────────► │   Main Process (Node/Electron)│
│   views/, modals/,        │     src/preload/index.ts    │   ipc/ -> services/           │
│   components/, state/     │     src/shared/types/ipc.ts │     app/, dota/, assets/,     │
└───────────────────────────┘                             │     modifier/, pipeline/      │
              │                                           └───────────────┬───────────────┘
              │ skinforge-icon://                                         │
              ▼                                                           ▼
   Bundled WebP Icon Packs                                  Dota 2 game/ directory
   (assets/icon-pack.tar.br)                                - <modFolder>/pak01_*.vpk
                                                            - dota/gameinfo_branchspecific.gi
                                                            - bin/win64/dota.signatures
```

---

## Major Systems

### 1. Renderer (`src/renderer/`)
- **`views/`**: Top-level tab pages (`ArmoryView`, `PresetsView`, `LaunchView`, `SettingsView`, `AboutView`).
- **`modals/`**: Dialogs built on the shared `components/ui/Modal.tsx` (`CosmeticPickerModal`, `PresetNameModal`, `UpdateModal`, `WhatsNewModal`, `BugReportModal`).
- **`components/layout/`**: Persistent chrome (`Sidebar`, `Topbar`, `ConsoleFooter`).
- **`components/armory/`**: Hero/category browser (`CatalogSidebar`), loadout grid (`LoadoutPanel`, `EquipmentSlotCard`), item picker (`CosmeticPicker`, `CosmeticCardPrimitives`), style dropdown (`StyleSelect`), and ability icon bar (`AbilityIconsBar`).
- **`state/`**: Zustand store (`useAppStore.ts`) composed of 7 domain slices (`navigation`, `loadout`, `presets`, `settings`, `pipeline`, `update`, `logs`) plus `storage.ts` for safe `localStorage` persistence.
- **`utils/`**: Renderer-only thumbnail and procedural SVG fallback generators (`itemImages.ts`, `cardSvgGenerator.ts`, `slotSvgIcons.ts`).

### 2. Shared (`src/shared/`)
Pure TypeScript with **no Electron, Node `fs`, or DOM dependencies**:
- **`armory/`**: Hero & category catalog loader (`armoryCatalog.ts`), domain types & slot helpers (`armoryTypes.ts`), hero attributes (`attributes.ts`), set hydration & reconnect hints (`heroSets.ts`), icon key validation (`iconKeys.ts`), style resolution (`itemStyles.ts`), rarity ranking & colors (`rarityConfig.ts`).
- **`constants/`**: App metadata (`appConfig.ts`), category headers (`categories.ts`), UI-to-Valve name aliases (`heroAliases.ts`), Steam launch flag definitions (`launchOptions.ts`).
- **`types/`**: IPC contracts (`ipc.ts`), ability icon types (`abilityIcons.ts`), R2 package manifest types (`assetPackages.ts`), style customization types (`customization.ts`).
- **`utils/`**: Shared bug-report validation/redaction (`bugReport.ts`, also used by `workers/bug-report`) and reconnect rule readers (`reconnectRules.ts`).

### 3. Main Process (`src/main/`)
- **`ipc/`**: Thin IPC handlers that validate arguments and delegate to `services/`.
- **`services/app/`**: Path resolution (`appPaths.ts`), settings persistence (`settingsService.ts`), GitHub Releases updater with SHA-256 verification (`updateService.ts`), and bug-report submission (`bugReportService.ts`).
- **`services/dota/`**: Steam/Dota detection & launching (`dotaService.ts`), `gameinfo_branchspecific.gi` search-path injection (`gameinfoService.ts`), `dota.signatures` SHA-1/CRC32 signing (`signatureService.ts`), Source 2 VPK v2 reader/packer (`vpkService.ts`), CRC32 (`crc32.ts`), and patch-drift tracking (`itemsGameBaseline.ts`).
- **`services/assets/`**: Main-process armory lookup (`armoryService.ts`), overlay manifest & staging (`cosmeticAssets.ts`), on-demand R2 package downloader (`assetDeliveryService.ts`), bundled icon pack extraction & `skinforge-icon://` protocol (`iconPackService.ts`), VPK ability icon resolver (`abilityIconResolver.ts`), `.tar.br` archive utilities (`archiveUtils.ts`), portrait merging (`loadoutPortraits.ts`), and item dependency receipts (`assetReceipt.ts`).
- **`services/modifier/`**: Span-preserving KeyValues/VDF parser (`vdf.ts`), typed `items_game.txt` index (`schema.ts`), style & visual transforms (`visuals.ts`), hero base model map (`heroBaseModels.ts`), selection planner (`plan.ts`), and schema compiler + validator (`compile.ts`).
- **`services/pipeline/`**: End-to-end build & install orchestrator (`selectionBuilder.ts`, `packInstaller.ts`, `pipelineStatus.ts`, `itemsGamePatcher.ts`, and `passes/`).

---

## What Happens When You Click "Apply Mods"

1. **Renderer (`pipelineSlice.applyMods`)** filters active slots by each hero's active stance (`default` vs `persona`) and invokes `window.skinforge.installMods(...)`.
2. **Main IPC (`modsIpc.ts`)** resolves the Dota 2 directory and calls `pipeline.installMods(...)`.
3. **Selection Builder (`pipeline/selectionBuilder.ts`)**:
   - Reads Valve's stock `scripts/items/items_game.txt` from `game/dota/pak01_dir.vpk` and parses it once.
   - Checks for Valve patch drift (`itemsGameBaseline.ts`).
   - Resolves armory picks to Valve item IDs, styles, and overlay groups (`resolveUserPicks`).
   - Compiles `items_game.txt` via `modifier.compileItemsGame` (reusing the parsed VDF document and schema).
   - Downloads any missing R2 cosmetic asset packages (`assetDeliveryService.ts`).
   - Stages root model overrides, reconnect-safe model swaps, and overlay assets (`cosmeticAssets.ts`).
   - Runs the 7 ordered post-compile passes in `pipeline/passes/`:
     1. Overlay `items_patch.txt` merge (`itemsGamePatcher.ts`)
     2. `overlayCleanup.ts` (strip `model_player` on patchless body replacements)
     3. `mergeReconnectWearables.ts` (merge empty-slot wearables into host models via `wearable-merger.exe` or `assets/reconnect/` recipes)
     4. `routeEmptySlotAttachments.ts` (route remaining empty-slot wearables via `additional_wearable`)
     5. `resolveOverlayParticles.ts` (let explicit wearable particles win over overlay conflicts)
     6. `resolveOverlayAbilityIcons.ts` (let preferred wearable ability icons win over overlay redirects)
     7. `applyUserAbilityIcons.ts` (apply the user's custom ability icon picks last)
   - Verifies final `items_game.txt` structure and packs `pak01_dir.vpk` + `pak01_000.vpk` (`vpkService.ts`).
4. **Installer (`pipeline/packInstaller.ts`)**:
   - Confirms `dota2.exe` is not running.
   - Copies the VPKs into `game/<modFolder>/`.
   - Injects `Game` / `Mod` search paths into `gameinfo_branchspecific.gi` (backing up the original).
   - Updates `dota.signatures` with the new SHA-1/CRC32 (rolling back `gameinfo` if signing fails).

Clicking **Restore** reverses step 4: restores the backed-up `gameinfo_branchspecific.gi` and `dota.signatures`, then deletes `game/<modFolder>/`.
