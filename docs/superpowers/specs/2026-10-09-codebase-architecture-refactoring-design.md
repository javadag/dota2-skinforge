# Architectural Refactoring Design: Dota 2 SkinForge

**Date:** 2026-10-09  
**Status:** In Review  
**Topic:** Clean Architecture, Process Isolation, and Decoupling for Dota 2 SkinForge

---

## 1. Motivation & Context

Dota 2 SkinForge is an Electron desktop application that enables client-side cosmetic modding via Valve Source 2 VPK packaging. While the initial prototype functions, the codebase suffers from:
1. **Blurred Process Boundaries:** Node.js backend files (`src/core/*`) share the same folder as browser code (`src/modules/*`), while an empty `main-process/` directory sits unused.
2. **Duplicated Code & Data:** `HERO_ALIASES` and `crc32` are copy-pasted across backend and frontend files. Two huge copies of the item catalog exist (`valveHeroCatalog.js` at 2.35 MB and `valveHeroCatalog.json` at 2.87 MB).
3. **Monolithic Compiler (`itemModifier.js`):** 500+ lines mixing KeyValues text parsing, item heuristics, archive extraction, and hero-specific Arcana overrides (e.g. Legion Commander, Tidehunter).
4. **Circular Frontend Dependencies:** Direct mutual imports between `heroList.js` and `slotEditor.js` causing tight coupling and brittle state synchronization.
5. **Blocking Synchronous I/O:** `execSync` (`tasklist`, `tar`) and heavy synchronous filesystem operations on the Electron main process thread causing potential UI lag during mod installations.

---

## 2. Target Directory Layout

The codebase will be reorganized into explicit Electron architectural boundaries:

```text
dota2-skinforge/
├── assets/                          # Static assets (hero portraits, app icons)
├── data/                            # Offline data catalogs & mod_template.zip
├── tools/                           # Standalone binaries (vpktool.exe)
├── scripts/                         # Build & maintenance scripts
├── src/
│   ├── main/                        # Electron Main Process (Node.js runtime)
│   │   ├── index.js                 # App lifecycle, single instance lock, window manager
│   │   ├── ipc/                     # Domain-specific IPC handler registration
│   │   │   ├── modsIpc.js           # 'install-mods', 'uninstall-mods', 'check-status'
│   │   │   ├── settingsIpc.js       # 'read-settings', 'write-settings', 'select-directory'
│   │   │   └── systemIpc.js         # 'get-initial-data', 'open-external'
│   │   └── services/                # Pure Node.js domain services
│   │       ├── dotaPathService.js   # Steam library detection & path verification
│   │       ├── gameinfoService.js   # gameinfo_branchspecific.gi SearchPaths injection
│   │       ├── signatureService.js  # dota.signatures hashing & bypass
│   │       ├── vpkService.js        # VPK chunk packer & vpktool.exe runner
│   │       ├── pipelineService.js   # High-level install/restore orchestration
│   │       └── modifier/            # Cosmetic compiler engine
│   │           ├── vdfParser.js     # items_game.txt tokenizer & item block scanner
│   │           ├── matcher.js       # Fuzzy cosmetic name & slot matching
│   │           ├── modPackager.js   # Staging directory manager & VPK orchestrator
│   │           └── rules/           # Extensible hero special overrides
│   │               ├── legionCommander.js
│   │               └── tidehunter.js
│   │
│   ├── preload/                     # Secure IPC Bridge
│   │   └── index.js                 # contextBridge exposing window.skinforge & window.appInfo
│   │
│   ├── renderer/                    # Electron Renderer Process (Browser ES Modules)
│   │   ├── index.html               # Main window interface markup
│   │   ├── index.js                 # Renderer entry point & event wiring
│   │   ├── state/
│   │   │   ├── store.js             # Central application state with helper methods
│   │   │   └── events.js            # Lightweight EventTarget pub/sub bus
│   │   ├── components/              # Isolated UI view controllers
│   │   │   ├── heroList.js          # Hero catalog display, filter & search
│   │   │   ├── slotEditor.js        # Slot cards grid & action handlers
│   │   │   ├── slotModal.js         # Item selector modal
│   │   │   ├── presetsView.js       # Presets management tab
│   │   │   ├── launchView.js        # Steam launch flags generator
│   │   │   ├── settingsView.js      # Preferences tab
│   │   │   └── navigation.js        # Sidebar tab switching & topbar updates
│   │   ├── styles/                  # Modular stylesheets
│   │   │   ├── index.css            # Master stylesheet
│   │   │   ├── variables.css
│   │   │   ├── layout.css
│   │   │   ├── cosmetics.css
│   │   │   ├── panels.css
│   │   │   ├── modals.css
│   │   │   └── console.css
│   │   └── utils/
│   │       ├── dom.js               # Safe DOM selector utilities
│   │       ├── logger.js            # Logging & status indicators
│   │       └── itemImages.js        # Rarity configs & SVG card generators
│   │
│   └── shared/                      # Isomorphic modules (Node & Browser compatible)
│       ├── constants/
│       │   ├── heroAliases.js       # Single source of truth for Valve hero aliases
│       │   ├── appConfig.js         # Single source of truth for app metadata
│       │   └── attributes.js        # Hero primary attribute definitions
│       └── utils/
│           ├── crc32.js             # Shared CRC32 implementation
│           └── stringUtils.js       # Hero name normalization & slot formatting
```

---

## 3. Detailed Component Architecture

### 3.1 Shared Modules (`src/shared/`)
- **`heroAliases.js`**: Universal mapping of Valve internal hero names (e.g., `zuus` -> `zeus`, `skeleton_king` -> `wraith_king`, `nevermore` -> `shadow_fiend`). Supports both CommonJS (`module.exports`) and ES Module (`export`) consumption or uses a universal export wrapper.
- **`crc32.js`**: Single implementation of the polynomial CRC32 table used by both `vpkService.js` and `signatureService.js`.
- **`appConfig.js`**: App metadata derived from `package.json`, replacing ad-hoc `appInfo.js`.

### 3.2 Main Process & IPC (`src/main/`)
- **`index.js`**: Focuses strictly on Electron lifecycle (`app.whenReady`, single instance lock, `BrowserWindow` creation, and registering IPC modules).
- **IPC Handlers**: Split into domain-specific modules:
  - `modsIpc.js`: handles `install-mods`, `uninstall-mods`, `check-status`.
  - `settingsIpc.js`: handles `read-settings`, `write-settings`, `select-directory`.
  - `systemIpc.js`: handles `get-initial-data`, `open-external`.
- **Services**:
  - `dotaPathService.js`: Registry querying and Steam `libraryfolders.vdf` parsing.
  - `gameinfoService.js`: Reads and safely modifies `gameinfo_branchspecific.gi`.
  - `signatureService.js`: Computes SHA1 and CRC32 of gameinfo, patching `dota.signatures`.
  - `vpkService.js`: Builds Source 2 multi-chunk VPK (`pak01_dir.vpk` + `pak01_000.vpk`). Uses async/promisified I/O instead of blocking main thread.
  - `pipelineService.js`: Coordinates the backup, patch, package, and restore steps with smooth async progress notifications.

### 3.3 Item Modifier Rule Engine (`src/main/services/modifier/`)
- **`vdfParser.js`**: Dedicated KeyValues parser scanning `items_game.txt` for `default_item` blocks and cosmetic items.
- **`matcher.js`**: Normalized name and slot matching heuristics.
- **`rules/` Registry**: Hero-specific Arcana rules are decoupled into individual rule handlers:
  - `rules/legionCommander.js`: Ensures `hero_base` (5810) dual-wield particles and models are paired when Arcana is equipped.
  - `rules/tidehunter.js`: Handles `hero_base` (37143) entity model override, hides wooden bracers with `prop_null`, and equips the Megalodon shark weapon.
  - New Arcanas can be registered simply by adding a file into `rules/` without modifying core compiler logic.
- **`modPackager.js`**: Handles temporary staging unpacking and clean teardown.

### 3.4 Data Layer & Performance Optimization
- Remove redundant duplicate `src/data/valveHeroCatalog.js` (2.35 MB) and `valveHeroCatalog.json` (2.87 MB).
- Store single authoritative catalog in `data/valveHeroCatalog.json`.
- In the renderer, load this catalog asynchronously or on-demand rather than synchronously executing a 2.35MB JavaScript object on app load.

### 3.5 Frontend Decoupling via Event Bus (`src/renderer/state/`)
- **`events.js`**: Standard `EventTarget` wrapper providing `emit(event, data)` and `on(event, handler)`.
- Key events:
  - `'hero:selected'` (payload: `hero`): `slotEditor` listens and renders slots; `heroList` updates active highlight.
  - `'slots:changed'` (payload: `{ heroTag, slotId, item }`): `heroList` updates badge count; `slotEditor` re-renders active card; store persists to `localStorage`.
  - `'status:updated'` (payload: `status`): Top bar and sidebar update indicators.
- **Break Circular Dependencies**:
  - `heroList.js` does NOT import `slotEditor.js`.
  - `slotEditor.js` does NOT import `heroList.js`.
  - Both emit and listen to events through `events.js`.

---

## 4. Error Handling & Asynchronous Flow

1. **Non-blocking Execution**:
   - Replace `execSync('tasklist ...')` in process detection with async `util.promisify(exec)`.
   - Mod staging extraction (`tar -xf`) and multi-chunk packaging run with async chunks/promises to prevent any hitching of the Electron window during installation.
2. **IPC Error Normalization**:
   - All IPC handlers return structured payloads `{ ok: true, data }` or `{ ok: false, error: err.message }` rather than throwing uncaught promise rejections across IPC boundaries.
3. **Safe Storage**:
   - `store.js` encapsulates `localStorage` reads and writes with fallbacks, handling corrupted JSON gracefully.

---

## 5. Verification Plan

1. **File System Verification**:
   - Ensure all old redundant files (`valveHeroCatalog.js`, empty `main-process/`) are cleaned up.
   - Verify correct package.json `main` points to `src/main/index.js`.
2. **Syntax & Linter / Import Check**:
   - Run Node syntax checks (`node -c`) on all main process and shared files.
   - Verify all ES Module imports in renderer resolve correctly.
3. **IPC Bridge Verification**:
   - Test `getInitialData`, `checkStatus`, `selectDirectory`, `readSettings`, `writeSettings`.
4. **Mod Pipeline Verification**:
   - Test mod compilation simulation with test loadout to ensure `vdfParser`, `matcher`, and special rules generate correct VPK structures without regression.
5. **UI Smoke Test**:
   - Launch application via `npm start`, verify UI loads, heroes list displays with attributes, equipment slot editor works, and presets save/load seamlessly.
