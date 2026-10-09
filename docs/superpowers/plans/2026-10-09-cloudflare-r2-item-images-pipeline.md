# Cloudflare R2 Item Images Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Provide 100% full coverage for all ~11,600 Dota 2 cosmetic item images using an automated Source2Viewer/VRF extraction CLI, WebP compression, Cloudflare R2 storage, and an Electron main process custom protocol with local disk caching (`skinforge-icon://`).

**Architecture:** A developer CLI (`scripts/sync_r2_icons.ts`) decompiles Dota 2's `pak01_dir.vpk` textures via Source2Viewer, compresses them to WebP, and syncs them to Cloudflare R2. In the Electron app, a custom privileged protocol (`skinforge-icon://`) intercepts icon requests, serves them from `%userData%/icon_cache/` in <1ms, fetches uncached icons from the R2 CDN on demand, and saves them to disk. Uncached or offline items cleanly fall back to procedural SVG icons.

**Architecture Diagram:**

```mermaid
graph TD
    subgraph "1. Extraction & Cloud Sync (scripts/sync_r2_icons.ts)"
        VPK["pak01_dir.vpk"] -->|Source2Viewer-CLI| PNG["panorama/images/econ/*.png"]
        PNG -->|sharp Q85| WEBP["*.webp"]
        WEBP -->|@aws-sdk/client-s3| R2["Cloudflare R2 Bucket"]
    end

    subgraph "2. Electron Main Process (src/main/services/iconCacheService.ts)"
        Req["skinforge-icon://econ/..."] --> Check{"Cached in %userData%/icon_cache/?"}
        Check -- Yes --> Disk["Serve from Disk (<1ms)"]
        Check -- No --> Remote["Fetch from R2 CDN"]
        Remote -- 200 OK --> Save["Write to %userData%/icon_cache/ & Stream"]
        Remote -- Fail/Offline --> Err404["Return 404 Response"]
    end

    subgraph "3. Renderer UI (src/renderer/utils/itemImages.ts)"
        Item["Item Descriptor (econ/...)"] --> GetImg["getItemImage()"]
        GetImg --> ImgTag["<img src='skinforge-icon://...'>"]
        ImgTag -->|onerror| Fallback["generateItemSvg()"]
    end
```

**Tech Stack:**

- Node.js / TypeScript / Electron 33
- `@aws-sdk/client-s3` (R2 upload)
- `sharp` (WebP conversion)
- `Source2Viewer-CLI` / VRF (Valve Resource Format extractor)
- Native Node.js `assert` & `tsx` for tests

**Spec:** [docs/superpowers/specs/2026-10-09-cloudflare-r2-item-images-pipeline-design.md](file:///e:/My/dota2-skinforge/docs/superpowers/specs/2026-10-09-cloudflare-r2-item-images-pipeline-design.md)

## Global Constraints

- Do not introduce breaking changes to existing modding or VPK pipeline logic.
- Protocol scheme `skinforge-icon` must be registered as standard, secure, and support fetch API before `app.whenReady()`.
- Use native Node.js `assert` for testing with `tsx` test runners.
- Maintain ESLint and Prettier compliance across all new and modified TypeScript/JavaScript files.

---

### Task 1: Main Process Icon Cache Service & Protocol Registration

**Files:**

- Create: `src/main/services/iconCacheService.ts`
- Modify: `src/main/index.ts:1-85`
- Test: `test/iconCache.test.js`

**Interfaces:**

- Produces:
  - `registerIconScheme(): void` — Registers privileged scheme with Electron
  - `registerIconProtocol(getSettings: () => { r2CdnUrl?: string }): void` — Handles `skinforge-icon://` requests
  - `getIconCacheStats(): Promise<{ count: number, sizeBytes: number }>` — Cache metrics
  - `clearIconCache(): Promise<boolean>` — Cache purge

- [ ] **Step 1: Write the failing test for iconCacheService logic**

Create `test/iconCache.test.js`:

```javascript
const assert = require('assert')
const path = require('path')
const fs = require('fs')

// Test mockable helper functions of iconCacheService
const { resolveCachePath, normalizeIconPath, formatBytes } = require('../src/main/services/iconCacheService')

assert.strictEqual(typeof resolveCachePath, 'function', 'resolveCachePath must be exported')
assert.strictEqual(typeof normalizeIconPath, 'function', 'normalizeIconPath must be exported')

// 1. Path normalization
assert.strictEqual(normalizeIconPath('skinforge-icon://econ/items/invoker/dark_artistry.webp'), 'econ/items/invoker/dark_artistry.webp')
assert.strictEqual(normalizeIconPath('skinforge-icon://econ/items/invoker/dark_artistry.png'), 'econ/items/invoker/dark_artistry.webp')

// 2. Cache path resolution
const mockBase = 'C:\\mockUserData'
const resolved = resolveCachePath(mockBase, 'econ/items/invoker/dark_artistry.webp')
assert.strictEqual(resolved, path.join(mockBase, 'icon_cache', 'econ/items/invoker/dark_artistry.webp'))

// 3. Format bytes helper
assert.strictEqual(formatBytes(0), '0 B')
assert.strictEqual(formatBytes(1024), '1.0 KB')
assert.strictEqual(formatBytes(1024 * 1024 * 2.5), '2.5 MB')

console.log('Icon cache service unit tests passed!')
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx test/iconCache.test.js`
Expected: FAIL with `Cannot find module '../src/main/services/iconCacheService'`

- [ ] **Step 3: Implement iconCacheService**

Create `src/main/services/iconCacheService.ts`:

```typescript
/**
 * Dota 2 SkinForge — Icon Cache & Custom Protocol Service
 * Handles skinforge-icon:// requests with local disk write-through caching.
 */

import { app, net, protocol } from 'electron'
import fs from 'fs'
import path from 'path'
import { pathToFileURL } from 'url'

export const DEFAULT_CDN_URL = 'https://assets.dota2skinforge.com'
const inFlightRequests = new Map<string, Promise<Response>>()

export function normalizeIconPath(uri: string): string {
  let clean = uri.replace(/^skinforge-icon:\/\/+/, '')
  clean = clean.split('?')[0].split('#')[0]
  if (clean.endsWith('.png') || clean.endsWith('.vtex_c')) {
    clean = clean.replace(/\.(png|vtex_c)$/i, '.webp')
  }
  if (!clean.endsWith('.webp')) {
    clean = `${clean}.webp`
  }
  return clean
}

export function resolveCachePath(baseDir: string, relativePath: string): string {
  return path.join(baseDir, 'icon_cache', relativePath)
}

export function formatBytes(bytes: number): string {
  if (bytes <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(1024))
  return `${(bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`
}

export function registerIconScheme(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: 'skinforge-icon',
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        corsEnabled: true
      }
    }
  ])
}

export function registerIconProtocol(getSettings?: () => { r2CdnUrl?: string }): void {
  protocol.handle('skinforge-icon', async (request) => {
    const relativePath = normalizeIconPath(request.url)
    const cacheDir = app.getPath('userData')
    const localPath = resolveCachePath(cacheDir, relativePath)

    // Tier 1: Local Disk Cache Hit
    try {
      if (fs.existsSync(localPath)) {
        const stat = fs.statSync(localPath)
        if (stat.size > 0) {
          return await net.fetch(pathToFileURL(localPath).toString())
        }
      }
    } catch {
      // Continue to remote fetch on read error
    }

    // Deduplicate in-flight requests for identical images
    const existing = inFlightRequests.get(relativePath)
    if (existing) {
      return existing
    }

    const fetchPromise = (async (): Promise<Response> => {
      const settings = getSettings ? getSettings() : {}
      const cdnBase = (settings.r2CdnUrl || DEFAULT_CDN_URL).replace(/\/+$/, '')
      const remoteUrl = `${cdnBase}/${relativePath}`

      try {
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), 6000)

        const res = await net.fetch(remoteUrl, { signal: controller.signal })
        clearTimeout(timeoutId)

        if (res.ok) {
          const arrayBuf = await res.arrayBuffer()
          const buffer = Buffer.from(arrayBuf)

          // Asynchronously write to local disk cache
          fs.promises
            .mkdir(path.dirname(localPath), { recursive: true })
            .then(() => fs.promises.writeFile(localPath, buffer))
            .catch((err) => console.error('[IconCache] Cache write error:', err))

          return new Response(buffer, {
            status: 200,
            headers: { 'Content-Type': 'image/webp' }
          })
        }
      } catch {
        // Network timeout / DNS error / offline
      }

      return new Response('Icon not found', { status: 404 })
    })().finally(() => {
      inFlightRequests.delete(relativePath)
    })

    inFlightRequests.set(relativePath, fetchPromise)
    return fetchPromise
  })
}

export async function getIconCacheStats(
  baseDir = app.getPath('userData')
): Promise<{ count: number; sizeBytes: number; formattedSize: string }> {
  const root = path.join(baseDir, 'icon_cache')
  let count = 0
  let sizeBytes = 0

  async function walk(dir: string): Promise<void> {
    if (!fs.existsSync(dir)) return
    const entries = await fs.promises.readdir(dir, { withFileTypes: true })
    for (const entry of entries) {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        await walk(full)
      } else if (entry.isFile()) {
        count++
        const stat = await fs.promises.stat(full)
        sizeBytes += stat.size
      }
    }
  }

  await walk(root)
  return { count, sizeBytes, formattedSize: formatBytes(sizeBytes) }
}

export async function clearIconCache(baseDir = app.getPath('userData')): Promise<boolean> {
  const root = path.join(baseDir, 'icon_cache')
  try {
    if (fs.existsSync(root)) {
      await fs.promises.rm(root, { recursive: true, force: true })
    }
    return true
  } catch (e) {
    console.error('[IconCache] Clear cache error:', e)
    return false
  }
}
```

- [ ] **Step 4: Register scheme & protocol in main process entry**

Modify `src/main/index.ts`:
Call `registerIconScheme()` at top-level before `app.whenReady()`, and call `registerIconProtocol()` inside `app.whenReady()`.

- [ ] **Step 5: Run test to verify it passes**

Run: `npx tsx test/iconCache.test.js`
Expected: PASS with "Icon cache service unit tests passed!"

- [ ] **Step 6: Commit**

```bash
git add src/main/services/iconCacheService.ts src/main/index.ts test/iconCache.test.js
git commit -m "feat: add iconCacheService with skinforge-icon protocol and disk caching"
```

---

### Task 2: Renderer Item Images Resolution & UI Fallback

**Files:**

- Modify: `src/renderer/utils/itemImages.ts:270-302`
- Test: `test/itemImages.test.js`

**Interfaces:**

- Consumes: `ItemDescriptor` (id, img, isDefault, name)
- Produces: `getItemImage(item, slotId, heroTag, heroObj): string` (maps `econ/` paths to `skinforge-icon://`)

- [ ] **Step 1: Write the failing test for getItemImage protocol mapping**

Create `test/itemImages.test.js`:

```javascript
const assert = require('assert')
const { getItemImage } = require('../src/renderer/utils/itemImages')

// 1. Bundled item should return local assets path
const bundled = getItemImage({ id: '7986', name: 'Dark Artistry Hair', img: 'econ/items/invoker/dark_artistry/dark_artistry_hair_model' })
assert.strictEqual(bundled, '../assets/items/7986.png', 'Bundled items must use assets/items/')

// 2. Unbundled item with econ/ path should route through skinforge-icon:// protocol
const unbundled = getItemImage({ id: '999999', name: 'New Set Item', img: 'econ/items/invoker/magus_apex/magus_apex2' })
assert.strictEqual(
  unbundled,
  'skinforge-icon://econ/items/invoker/magus_apex/magus_apex2.webp',
  'Econ items must route through skinforge-icon:// with .webp'
)

// 3. Default base item should return hero portrait or base SVG
const defaultBase = getItemImage({ isDefault: true, name: 'Default Base' }, 'weapon', 'invoker')
assert.strictEqual(defaultBase, '../assets/heroes/invoker.png', 'Default base should use hero portrait')

// 4. Missing/empty item should return procedural SVG data URI
const empty = getItemImage(null, 'weapon', 'invoker')
assert.ok(empty.startsWith('data:image/svg+xml'), 'Empty item should return SVG')

console.log('getItemImage protocol tests passed!')
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx test/itemImages.test.js`
Expected: FAIL because unbundled econ items currently fall back to procedural SVG.

- [ ] **Step 3: Update getItemImage in itemImages.ts**

Modify `src/renderer/utils/itemImages.ts`:

```typescript
export function getItemImage(item?: ItemDescriptor | null, slotId = 'weapon', heroTag = '', heroObj?: HeroImageTarget | null): string {
  if (!item || item.isDefault || (item.name && item.name.toLowerCase().includes('official base'))) {
    if (heroObj && heroObj.img) {
      return heroObj.img
    }
    if (heroTag) {
      const cleanTag = heroTag.toLowerCase().replace(/\s+/g, '_').replace(/-/g, '_')
      return `../assets/heroes/${cleanTag}.png`
    }
    return generateItemSvg({ name: 'Default Base', tag: 'default', isDefault: true }, slotId, heroTag)
  }

  // Tier 1: Local curated offline bundle
  if (item && item.id && AVAILABLE_ITEM_ICONS.has(String(item.id))) {
    return `../assets/items/${item.id}.png`
  }

  // Tier 2: Official Valve econ cosmetic asset -> skinforge-icon protocol
  if (item && item.img && item.img.startsWith('econ/')) {
    const cleanImg = item.img.replace(/\.(png|vtex_c)$/i, '')
    return `skinforge-icon://${cleanImg}.webp`
  }

  // Tier 3: Direct custom image path / URL
  if (item && item.img && typeof item.img === 'string' && item.img.length > 0) {
    return item.img
  }

  // Tier 4: Procedural SVG Fallback
  return generateItemSvg(item, slotId, heroTag)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx test/itemImages.test.js`
Expected: PASS with "getItemImage protocol tests passed!"

- [ ] **Step 5: Commit**

```bash
git add src/renderer/utils/itemImages.ts test/itemImages.test.js
git commit -m "feat: route econ item images to skinforge-icon protocol in getItemImage"
```

---

### Task 3: Settings Integration & Cache Management IPC

**Files:**

- Modify: `src/main/ipc/settingsIpc.ts:1-49`
- Modify: `src/renderer/env.d.ts:1-80`
- Modify: `src/renderer/components/settingsView.ts:1-50`
- Test: `test/settingsIpc.test.js`

**Interfaces:**

- Produces IPC handlers:
  - `get-cache-stats` -> `{ count: number, sizeBytes: number, formattedSize: string }`
  - `clear-icon-cache` -> `{ ok: boolean }`
- Extends `SkinForgeSettings`:
  - `r2CdnUrl?: string`

- [ ] **Step 1: Write the failing test for cache IPC handlers**

Create `test/settingsIpc.test.js`:

```javascript
const assert = require('assert')
const { getIconCacheStats, clearIconCache } = require('../src/main/services/iconCacheService')
const fs = require('fs')
const path = require('path')
const os = require('os')

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skinforge-cache-test-'))
const sampleFile = path.join(tempDir, 'icon_cache', 'econ', 'sample.webp')
fs.mkdirSync(path.dirname(sampleFile), { recursive: true })
fs.writeFileSync(sampleFile, Buffer.from('test-image-content'))

getIconCacheStats(tempDir).then((stats) => {
  assert.strictEqual(stats.count, 1, 'Should find 1 cached file')
  assert.ok(stats.sizeBytes > 0, 'Size must be greater than 0')

  clearIconCache(tempDir).then((ok) => {
    assert.strictEqual(ok, true, 'Clear cache should return true')
    getIconCacheStats(tempDir).then((after) => {
      assert.strictEqual(after.count, 0, 'Cache should be empty after clear')
      fs.rmSync(tempDir, { recursive: true, force: true })
      console.log('Settings & Cache IPC helper test passed!')
    })
  })
})
```

- [ ] **Step 2: Run test to verify it passes**

Run: `npx tsx test/settingsIpc.test.js`
Expected: PASS with "Settings & Cache IPC helper test passed!"

- [ ] **Step 3: Register get-cache-stats and clear-icon-cache in settingsIpc.ts**

Modify `src/main/ipc/settingsIpc.ts`:
Add handlers for `get-cache-stats` and `clear-icon-cache` calling `getIconCacheStats()` and `clearIconCache()`.

- [ ] **Step 4: Update types in src/renderer/env.d.ts**

Add `getCacheStats()` and `clearIconCache()` to `window.skinforge` interface.

- [ ] **Step 5: Add cache management section in settingsView.ts**

Modify `src/renderer/components/settingsView.ts`:
Display cache stats (e.g. `245 items cached (14.2 MB)`) with a "Clear Cache" button.

- [ ] **Step 6: Run existing test suite**

Run: `npm test`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/main/ipc/settingsIpc.ts src/renderer/env.d.ts src/renderer/components/settingsView.ts test/settingsIpc.test.js
git commit -m "feat: add icon cache stats and clear cache IPC in settings"
```

---

### Task 4: Developer Extraction, Optimization & Cloudflare R2 Sync CLI

**Files:**

- Create: `scripts/sync_r2_icons.ts`
- Create: `.env.example`
- Modify: `package.json:10-25`
- Test: `test/syncCli.test.js`

**Interfaces:**

- CLI: `npm run sync:icons [--vpk <path>] [--limit <n>] [--dry-run]`
- Environment variables: `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`, `R2_PUBLIC_URL`

- [ ] **Step 1: Install devDependencies for extraction & S3 sync**

Run: `npm install -D @aws-sdk/client-s3 sharp`
Verify: `package.json` contains `@aws-sdk/client-s3` and `sharp` in `devDependencies`.

- [ ] **Step 2: Create .env.example template**

Create `.env.example`:

```env
# Cloudflare R2 Credentials for Dota 2 SkinForge Icon Sync
R2_ACCOUNT_ID=your_cloudflare_account_id
R2_ACCESS_KEY_ID=your_r2_access_key_id
R2_SECRET_ACCESS_KEY=your_r2_secret_access_key
R2_BUCKET_NAME=skinforge-assets
R2_PUBLIC_URL=https://assets.dota2skinforge.com
```

- [ ] **Step 3: Implement scripts/sync_r2_icons.ts**

Create `scripts/sync_r2_icons.ts`:

- Auto-detect Dota 2 path via registry / Steam libraries (with CLI override)
- Locate or download `tools/Source2Viewer-CLI.exe`
- Execute batch decompile of `panorama/images/econ/` into a temporary staging directory
- Batch convert PNG files to `.webp` with `sharp`
- Concurrently upload to Cloudflare R2 bucket with `Cache-Control: public, max-age=31536000, immutable`
- Provide `--dry-run` and `--limit <n>` flags for safe testing

- [ ] **Step 4: Add "sync:icons" script to package.json**

Modify `package.json`:
Add `"sync:icons": "tsx scripts/sync_r2_icons.ts"` to `scripts`.

- [ ] **Step 5: Write unit test for CLI argument parsing & dry run**

Create `test/syncCli.test.js`:

```javascript
const assert = require('assert')
const { parseArgs } = require('../scripts/sync_r2_icons')

assert.strictEqual(typeof parseArgs, 'function', 'parseArgs must be exported')

const parsed = parseArgs(['--vpk', 'D:\\dummy\\pak01_dir.vpk', '--limit', '10', '--dry-run'])
assert.strictEqual(parsed.vpk, 'D:\\dummy\\pak01_dir.vpk')
assert.strictEqual(parsed.limit, 10)
assert.strictEqual(parsed.dryRun, true)

console.log('Sync CLI argument parsing test passed!')
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npx tsx test/syncCli.test.js`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add scripts/sync_r2_icons.ts .env.example package.json package-lock.json test/syncCli.test.js
git commit -m "feat: add sync_r2_icons CLI tool for VPK extraction and R2 upload"
```

---

### Task 5: End-to-End Verification & Quality Checks

**Files:**

- Modify: `package.json` (add new tests to `npm test`)

- [ ] **Step 1: Update package.json test script**

Modify `package.json:23`:
Include `tsx test/iconCache.test.js`, `tsx test/itemImages.test.js`, `tsx test/settingsIpc.test.js`, `tsx test/syncCli.test.js` in `npm test`.

- [ ] **Step 2: Run full test suite**

Run: `npm test`
Expected: All tests pass cleanly.

- [ ] **Step 3: Run TypeScript typecheck**

Run: `npm run typecheck`
Expected: 0 errors.

- [ ] **Step 4: Run ESLint and Prettier check**

Run: `npm run lint && npm run format:check`
Expected: Clean pass.

- [ ] **Step 5: Commit**

```bash
git add package.json
git commit -m "test: add item images and icon cache tests to test suite"
```
