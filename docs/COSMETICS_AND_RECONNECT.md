# Cosmetics, Overlays & Reconnect Maintenance

Practical reference for updating heroes after Dota 2 patches, maintaining Arcana/Persona overlays, and keeping empty-slot wearables visible after match reconnects.

---

## 1. Adding or Updating Heroes After a Dota 2 Patch

1. **Add base model path** (new heroes only) in `src/main/services/modifier/heroBaseModels.ts` (`HERO_BASE_MODELS`).
2. **Add UI-to-schema aliases** (if display name differs from Valve's internal name) in `src/shared/constants/heroAliases.ts`.
3. **Add a roster stub** (new heroes only) in `data/heroes_armory.json`:
   ```json
   "new hero": { "tag": "new hero", "variant_default": "hero", "slots": [], "sets": [] }
   ```
   Primary attributes are read automatically from Valve's `npc_dota_hero_<name>.txt` during the armory build.
4. **Regenerate catalogs & verify:**
   ```powershell
   npm run armory
   npm run armory:check
   npm run build:styles
   npm test
   ```
5. **Refresh bundled icons** (if new icons were added, with `tools/Source2Viewer-CLI.exe` present):
   ```powershell
   npm run extract:icons
   npm run build:icon-pack
   npm run test:icons
   ```

---

## 2. Adding an Arcana or Persona Overlay

Cosmetics that swap the hero's root body model or ship custom compiled assets are configured in `data/cosmetic-assets.json` (keyed by numeric Valve item ID).

1. **Persona base slot bridges (if needed):** If a Persona uses custom slot stems (e.g. Crystal Maiden wolf `tail_persona_1` -> `back`), add the mapping to `PERSONA_BASE_SLOT_BRIDGES` in `src/main/services/modifier/schema.ts`.
2. **Register the overlay in `data/cosmetic-assets.json`:**
   - `group`: folder name inside `SKINFORGE_ASSET_SOURCE` and R2 package name.
   - `files`: custom compiled files shipped in the package.
   - `aliases`: copy one shipped file to additional game-relative destinations (e.g. staging the Arcana body at the base hero `.vmdl_c` path).
   - `valveCopies`: copy verified stock files directly from Valve's `pak01_dir.vpk` at build time instead of shipping duplicates.
   - `patch` & `basePatchIds`: `items_patch.txt` and the default item block IDs it owns.
   - `styles` & `refits`: per-style overrides and companion wearable refits.
3. **Package & upload to R2** (`.tar.br` format):
   ```powershell
   npm run sync:assets -- --dry-run
   npm run sync:assets -- --upload --group <group>
   npm run check:assets -- --prepare
   ```
   See [RELEASE_GUIDE.md](../RELEASE_GUIDE.md) for the full release flow.

---

## 3. Reconnect-Safe Wearables (Empty Default Slots)

### Why a wearable can disappear on reconnect
When a hero's default slot already has a `model_player`, SkinForge delivers the selected cosmetic by overwriting that stock `.vmdl_c` path (a **model swap**), which always survives reconnects.

When a hero's default slot has **no `model_player`** (for example, Legion Commander legs or Ancient Apparition head/arms), the Dota server never allocates a wearable entity for that slot. Assigning a model in `items_game.txt` works on first spawn, then disappears or shows an ERROR model on reconnect.

### How SkinForge keeps them visible
Two mechanisms in `src/main/services/pipeline/passes/` solve this:

1. **Model Merging (`mergeReconnectWearables.ts`)** — configured in `data/cosmetic-assets.json` under `reconnectRules`:
   - Merges the empty-slot mesh into a model the client already loads (another wearable slot or the hero's root body), preserving host animations/skeleton and remapping guest bones.
   - **Apply-time merging** invokes `tools/wearable-merger` (`wearable-merger.exe`) when model hashes match a whitelisted `applyTime` rule.
   - **Saved recipe catalogs** live in `assets/reconnect/<group>/` (`.json.br` or 256-shard `WMR1` `.wmr` files) and ship directly with the app (`resources/reconnect/`). They are **not** uploaded to R2 — just place new recipes in `assets/reconnect/<group>/` and set `merges[].file` to the basename.
   - **Advisory companions:** `reconnectRules[].companions` show a picker hint suggesting a same-set carrier slot for reconnect safety. Selecting or removing a companion never auto-modifies other slots; if no carrier or body route applies, Apply still succeeds with a warning.
   - Keep `order` values unique across `companions` and across `merges` (append after the current maximum when adding new rules).

2. **Empty-Slot Attachment Routing (`routeEmptySlotAttachments.ts`)** — configured in `data/cosmetic-assets.json` under `emptySlotRoutes`:
   - Routes an empty-slot wearable through another slot's existing `additional_wearable` path (e.g. Axe's misc slot routed through his belt's `additional_wearable`). When `particle_create` is present, swaps the misc model onto the host's primary `model_player` so cloth-skinned particles attach properly.

---

## 4. Cleaning Up Redundant Overlay Assets

When auditing an overlay group to shrink package size or remove legacy paths:

1. **Inventory the group:** Run `npx tsx scripts/bundle_audit.ts` or `npx tsx scripts/item_assets.ts --item <id> --json` to classify files as stock duplicates, stock copies at a different path, or genuinely custom assets.
2. **Choose how each file is supplied:**
   - **Byte-identical to Valve at the same path:** Remove from the overlay; stock fallback covers it.
   - **Byte-identical to Valve at a different path:** Replace with a `valveCopies` entry in `data/cosmetic-assets.json`.
   - **Same custom bytes needed at multiple paths:** Keep one source file and use `aliases`.
   - **Unique custom bytes (refit, merged body, morph atlas, animation donor):** Keep it.
3. **Verify in a staged build and in game:**
   ```powershell
   npm run test:selection -- --pick "<hero>|<slot>|<item>"
   ```
   Inspect the output VPK, check `game/dota/console.log` for `Bad KV3` / `Decompression failure`, and test a **match disconnect + reconnect** for any body-swapping Arcana, Persona, or merged wearable.

---

## 5. Known Game-Specific Exceptions

- **Persona Base Slot Bridges** (`src/main/services/modifier/schema.ts` — `PERSONA_BASE_SLOT_BRIDGES`): Maps persona slot stems to base slots for Crystal Maiden, Dragon Knight, Invoker, Legion Commander, Mirana, Phantom Assassin, and Pudge.
- **Stray Persona Items** (`src/main/services/modifier/schema.ts` — `personaVariantSlots`): Heroes without a `persona_selector` default (Clockwerk, Timbersaw, Terrorblade, Ember Spirit, Underlord, Muerta) are excluded from persona handling.
- **Empty-Slot `bodygroup_visibility` Protection** (`src/main/services/modifier/compile.ts`): Never copies `bodygroup_visibility` hides onto model-less default slots during normal compilation so base hero geometry doesn't turn invisible on reconnect.
