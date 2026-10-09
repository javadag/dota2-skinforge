# Dota 2 Item Images Full Coverage: Cloudflare R2 & Electron Cache Pipeline Design

## 1. Overview & Problem Statement

Currently, Dota 2 SkinForge bundles only 169 curated item icons offline in `assets/items/`, leaving over 98.5% of the ~11,600 cosmetic items in `data/valveHeroCatalog.json` without authentic artwork. These missing items fall back to procedural generic SVG slot icons.

This specification defines a complete, high-performance, and cost-free architecture using:

1. Direct extraction of all ~11,600 official item textures from local Dota 2 game files (`pak01_dir.vpk`) using Valve Resource Format (VRF / Source2Viewer).
2. Optimization and compression to `.webp` format, reducing total catalog size from ~320 MB to ~120 MB.
3. Storage and global delivery via Cloudflare R2 with zero data egress costs and Cloudflare Edge Caching / WAF rate limiting.
4. An Electron main process custom protocol (`skinforge-icon://`) that provides transparent local disk caching (`%userData%/icon_cache/`), guaranteeing offline persistence and 0 duplicate network downloads per user.
5. Graceful fallback hierarchy in the renderer UI to the procedural SVG engine when offline and uncached.

---

## 2. Architecture & Data Flow

```mermaid
flowchart TD
    subgraph 1. Extraction & Build Pipeline (Developer CLI)
        DotaVPK[Dota 2 pak01_dir.vpk] -->|Source2Viewer-CLI| RawPNG[Extracted PNG Textures]
        RawPNG -->|sharp WebP Q85| OptimizedWebP[Optimized WebP Icons]
        OptimizedWebP -->|@aws-sdk/client-s3| R2Bucket[Cloudflare R2 Bucket]
    end

    subgraph 2. Remote CDN Layer
        R2Bucket --> EdgeCDN[Cloudflare CDN & WAF Cache]
    end

    subgraph 3. Client Runtime (Electron App)
        UI[Renderer <img>] -->|skinforge-icon://econ/...| ProtocolHandler[Main Process Protocol Handler]
        ProtocolHandler --> CheckDisk{Cached on Disk?}
        CheckDisk -- Yes (<1ms) --> ServeDisk[Serve from %userData%/icon_cache/]
        ServeDisk --> UI
        CheckDisk -- No --> FetchCDN[Fetch from Cloudflare CDN]
        FetchCDN -- HTTP 200 --> WriteDisk[Save to %userData%/icon_cache/]
        WriteDisk --> UI
        FetchCDN -- Network Fail / 404 --> Fallback404[Return 404]
        Fallback404 --> ProceduralSVG[Renderer onError: Procedural SVG]
    end
```

---

## 3. Subsystem Detailed Design

### 3.1. Developer Extraction & Cloud Sync Tool (`scripts/sync_r2_icons.ts`)

- **Executable entry**: Invoked via `npm run sync:icons` or `npx tsx scripts/sync_r2_icons.ts`.
- **Dota 2 detection**:
  - Automatically queries registry / Steam `libraryfolders.vdf` (using `dotaPathService`) to locate `pak01_dir.vpk` (e.g. `D:\SteamLibrary\steamapps\common\dota 2 beta\game\dota\pak01_dir.vpk`).
  - Supports manual CLI override via `--vpk "<path>"`.
- **VRF / Source2Viewer Tooling**:
  - Automatically checks `tools/Source2Viewer-CLI.exe`. If missing, downloads the official release binary from the `SteamDatabase/ValveResourceFormat` GitHub repository.
  - Decompiles `panorama/images/econ/` into a temporary staging folder.
- **Image Conversion**:
  - Iterates through extracted PNGs, mapping to their internal game relative path (e.g. `econ/items/invoker/dark_artistry/dark_artistry_hair_model.webp`).
  - Converts images using `sharp`:
    ```typescript
    await sharp(inputPng).webp({ quality: 85, effort: 4 }).toFile(outputWebp)
    ```
- **Cloudflare R2 S3 Sync**:
  - Reads credentials from `.env`:
    - `R2_ACCOUNT_ID`
    - `R2_ACCESS_KEY_ID`
    - `R2_SECRET_ACCESS_KEY`
    - `R2_BUCKET_NAME`
    - `R2_PUBLIC_URL`
  - Uploads in a concurrent pool (concurrency: 20).
  - Sets headers:
    - `Content-Type: image/webp`
    - `Cache-Control: public, max-age=31536000, immutable`
  - Checks object existence/size before uploading to enable incremental re-syncs when Dota 2 updates.

---

### 3.2. Electron Main Process Service (`src/main/services/iconCacheService.ts`)

- **Scheme Privilege Registration**:
  - In `src/main/index.ts`, before `app.whenReady()`:
    ```typescript
    protocol.registerSchemesAsPrivileged([
      { scheme: 'skinforge-icon', privileges: { standard: true, secure: true, supportFetchAPI: true } }
    ])
    ```
- **Protocol Handling**:
  - Registers `protocol.handle('skinforge-icon', async (request) => ...)`:
  - Parses pathname: `skinforge-icon://econ/items/invoker/dark_artistry/dark_artistry_hair_model.webp` -> `econ/items/invoker/dark_artistry/dark_artistry_hair_model.webp`.
  - Determines local cache path:
    `const localPath = path.join(app.getPath('userData'), 'icon_cache', relativePath);`
  - **Tier 1 (Disk Cache)**: If `fs.existsSync(localPath)` and file size > 0, returns `net.fetch(pathToFileURL(localPath).toString())`.
  - **Tier 2 (Remote Fetch)**:
    - Reads active CDN URL from user settings (defaulting to configured public domain).
    - Requests `${cdnUrl}/${relativePath}` with a 5-second `AbortController` timeout.
    - On HTTP 200: Writes buffer to `localPath` (creating subdirectories if needed) and returns `Response` with `Content-Type: image/webp`.
    - On failure/timeout: Returns `new Response('Not found', { status: 404 })`.
  - **Concurrency Deduplication**: An in-memory `Map<string, Promise<Response>>` ensures simultaneous requests for the same uncached image share a single network fetch.

---

### 3.3. Renderer Integration (`src/renderer/utils/itemImages.ts`)

The `getItemImage` resolution waterfall:

1. **Base / Default Item**: Returns hero base portrait `../assets/heroes/{hero}.png` or default base SVG.
2. **Bundled Curated Offline Icons**: If `AVAILABLE_ITEM_ICONS.has(item.id)`, returns `../assets/items/${item.id}.png`.
3. **Valve Econ Path**: If `item.img?.startsWith('econ/')`, strips existing extensions and returns:
   `skinforge-icon://${cleanImg}.webp`
4. **Direct URL / Data URI**: Returns `item.img` if non-empty string.
5. **Procedural SVG Fallback**: Returns `generateItemSvg(item, slotId, heroTag)`.

In UI components (`heroList.ts` / item cards):

```typescript
img.onerror = () => {
  img.src = generateItemSvg(item, slotId, heroTag)
}
```

---

### 3.4. App Settings & Cache Management (`src/main/ipc/settingsIpc.ts`)

- Add settings keys:
  - `cdnBaseUrl`: Custom domain URL for R2 assets (e.g. `https://assets.your-skinforge.com`).
- Add IPC handlers:
  - `get-cache-stats`: Returns count and total disk size of `%userData%/icon_cache/`.
  - `clear-icon-cache`: Purges `%userData%/icon_cache/` upon user request.

---

## 4. Error Handling & Edge Cases

| Scenario                                                          | Behavior                                                                                |
| :---------------------------------------------------------------- | :-------------------------------------------------------------------------------------- |
| **User is offline & image is cached**                             | Loaded from disk in <1ms without network attempt.                                       |
| **User is offline & image is not cached**                         | Protocol returns 404 immediately; `img.onerror` displays rarity-colored procedural SVG. |
| **Dota 2 item has placeholder icon (e.g. `testitem_slot_empty`)** | Protocol returns 404 or transparent empty placeholder; UI falls back to procedural SVG. |
| **Network timeout / DNS failure**                                 | 5s abort timeout triggers clean 404 without freezing UI or hanging connections.         |
| **Corrupted / zero-byte local cache file**                        | Detected during read; purged from disk and re-fetched.                                  |

---

## 5. Testing & Verification Plan

1. **Extraction & Optimization Tests**:
   - Run dry-run extraction on 5-10 items to confirm `Source2Viewer-CLI` extracts PNG textures and `sharp` produces valid `.webp` files.
2. **Protocol & Cache Service Unit Tests**:
   - Test cache-hit path: verify disk file served directly without network call.
   - Test cache-miss path: verify remote fetch, disk file creation, and `Content-Type: image/webp`.
   - Test 404 and timeout handling.
3. **End-to-End Visual Verification**:
   - Launch app with `npm run dev`.
   - Browse various hero cosmetic armories (Invoker, Pudge, Juggernaut, Phantom Assassin).
   - Verify armory cards load authentic high-definition item artwork.
   - Test offline mode by simulating network disconnection and confirming instant cached loads and clean SVG fallbacks.
