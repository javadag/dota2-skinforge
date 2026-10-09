# Design Spec: Tailwind CSS v4 Migration & Styling Modernization

**Date:** 2026-10-10  
**Status:** Approved  
**Author:** Antigravity & User

---

## 1. Objective & Scope

Integrate **Tailwind CSS v4** into the Dota 2 SkinForge Electron desktop application via `@tailwindcss/vite`, replacing repetitive vanilla CSS rules with Tailwind utility classes and `@apply` component layers. Maintain 100% of the custom gaming aesthetic (dark surfaces, neon glow effects, attributes colors) and guarantee that existing DOM selectors, event listeners, and tests continue to function flawlessly.

---

## 2. Architecture & Build Configuration

### 2.1 Dependencies

Install the latest Tailwind CSS v4 engine and its official Vite plugin:

- `tailwindcss@^4.0.0`
- `@tailwindcss/vite@^4.0.0`
  Added to `devDependencies` in `package.json`.

### 2.2 Vite Plugin Setup

Update [electron.vite.config.mjs](file:///e:/My/dota2-skinforge/electron.vite.config.mjs):

```javascript
import tailwindcss from '@tailwindcss/vite'

// In renderer configuration:
renderer: {
  plugins: [
    tailwindcss(),
    serveStaticFolder('assets', resolve(projectRoot, 'assets')),
    serveStaticFolder('data', resolve(projectRoot, 'data')),
    copyStaticFolderPlugin([...])
  ],
  // ...
}
```

### 2.3 Style Architecture

Update [src/renderer/index.css](file:///e:/My/dota2-skinforge/src/renderer/index.css) as the single master entry point:

```css
@import 'tailwindcss';

@theme {
  /* Surface colors */
  --color-bg-app: #080a10;
  --color-bg-sidebar: #0c0f18;
  --color-bg-surface: #101422;
  --color-bg-surface-elevated: #161c2e;
  --color-bg-card: rgba(18, 24, 38, 0.72);
  --color-bg-card-hover: rgba(28, 38, 60, 0.88);
  --color-bg-glass: rgba(14, 18, 29, 0.85);

  /* Borders */
  --color-border-subtle: rgba(255, 255, 255, 0.07);
  --color-border-light: rgba(255, 255, 255, 0.13);
  --color-border-focus: rgba(139, 92, 246, 0.55);

  /* Accent highlights */
  --color-accent-purple: #8b5cf6;
  --color-accent-violet: #7c3aed;
  --color-accent-cyan: #06b6d4;
  --color-accent-gold: #f59e0b;
  --color-accent-amber: #d97706;
  --color-accent-rose: #f43f5e;
  --color-accent-emerald: #10b981;

  /* Dota attribute colors */
  --color-attr-str: #ef4444;
  --color-attr-agi: #10b981;
  --color-attr-int: #06b6d4;
  --color-attr-uni: #a855f7;

  /* Typography */
  --font-sans: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  --font-mono: 'JetBrains Mono', 'Fira Code', monospace;
}

@import './styles/variables.css';
@import './styles/layout.css';
@import './styles/cosmetics.css';
@import './styles/panels.css';
@import './styles/console.css';
@import './styles/modals.css';
```

---

## 3. Migration Details

### 3.1 Buttons & Controls ([layout.css](file:///e:/My/dota2-skinforge/src/renderer/styles/layout.css))

- Refactor `.btn` to use `@apply inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-[13px] font-semibold cursor-pointer border-none outline-none select-none transition-all`.
- Modernize `.btn-primary`, `.btn-play`, `.btn-ghost`, `.btn-danger`, `.btn-sm`, `.btn-icon` with Tailwind color tokens, utility transitions, and hover transforms (`hover:-translate-y-px`).

### 3.2 Navigation & Layout ([layout.css](file:///e:/My/dota2-skinforge/src/renderer/styles/layout.css))

- `.app-shell`: `@apply flex w-screen h-screen relative overflow-hidden`.
- `.sidebar`: `@apply w-[220px] h-full flex flex-col shrink-0 z-20 border-r border-border-subtle bg-bg-sidebar`.
- `.topbar`: `@apply h-16 px-6 flex items-center justify-between border-b border-border-subtle bg-bg-glass backdrop-blur-md z-10 shrink-0`.
- `.topbar-right`: `@apply flex items-center gap-2.5`.

### 3.3 Cards & Cosmetics ([cosmetics.css](file:///e:/My/dota2-skinforge/src/renderer/styles/cosmetics.css), [panels.css](file:///e:/My/dota2-skinforge/src/renderer/styles/panels.css))

- Standardize grid layouts and cards (`.hero-card`, `.slot-card`, `.tweak-card`, `.preset-card`) using Tailwind flex, grid, border, and backdrop utilities.
- Preserve all custom glow animations (`box-shadow: 0 0 18px var(--accent-purple-glow)`).

### 3.4 In-Markup & Script Compatibility

- Crucial IDs and class names queried in JavaScript (`.snav-btn`, `.hero-card`, `.slot-card`, `.hf-btn`, `#btnPlayDota`, `#btnApplyAll`, `#dotaRunningPill`) remain intact.
- Dynamic style toggles (`.hidden`, `.active`, `.open`) continue working without any behavioral changes.

---

## 4. Verification & Validation Plan

1. **Build Validation**:
   - Run `npm run build` to confirm `@tailwindcss/vite` compiles CSS chunks with 0 errors.
2. **Code Quality**:
   - Run `npm run typecheck` to ensure no TypeScript breakages.
   - Run `npm run lint` to ensure ESLint conformance.
3. **Automated Smoke Test**:
   - Run `npm test` which triggers `test/electron-smoke.js`.
   - Verify all 187 heroes load, hero cards display, equipment slot grids render, item modal filters operate, and non-hero items (couriers, creeps, HUDs, loading screens) render images.
