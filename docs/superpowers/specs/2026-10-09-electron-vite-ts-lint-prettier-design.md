# Architecture Design: Modern Developer Toolchain (electron-vite, TypeScript, ESLint, Prettier)

**Date:** 2026-10-09  
**Status:** In Review  
**Project:** Dota 2 SkinForge  

---

## 1. Context & Motivation

Dota 2 SkinForge is currently an Electron desktop application running vanilla CommonJS in the main process and unbundled ES Modules directly in the Chromium renderer via native `<script type="module">`.

While functional, this setup lacks modern developer ergonomics:
1. **No static type checking or IDE autocomplete** across IPC channels or renderer modules.
2. **No automated code formatting or linting enforcement**, leading to style drift and potential runtime mistakes.
3. **No Hot Module Replacement (HMR)** in renderer development, requiring manual restarts for UI changes.
4. **No pre-commit verification**, allowing unformatted or broken code to be committed.

## 2. Goals & Non-Goals

### Goals
- **Toolchain**: Integrate `electron-vite` to handle modern bundling, instant HMR in development, and optimized production builds.
- **TypeScript**: Configure multi-environment TypeScript support (Node runtime for Main/Preload, DOM runtime for Renderer) with incremental migration (`allowJs: true`).
- **Preload & IPC Types**: Provide TypeScript declarations (`env.d.ts`) for `window.skinforgeApi` so renderer code receives full autocomplete and type safety.
- **Code Quality**: Configure ESLint (v9 flat config) with `@typescript-eslint` and Prettier (`.prettierrc`), strictly separating linting (logic/correctness) from formatting (style).
- **Git Automation**: Configure Husky and `lint-staged` so all staged files are automatically formatted and linted prior to commit.
- **Backward Compatibility**: Keep 100% of existing functionality, assets, and tests working without immediate forced rewrites to `.ts`.

### Non-Goals
- Full rewrite of every existing `.js` file to TypeScript in one step (migration is incremental).
- Switching UI to a front-end framework like React/Vue (vanilla component architecture remains intact).

---

## 3. Toolchain & Directory Architecture (`electron-vite`)

### 3.1 Overview
`electron-vite` manages three discrete bundles:
1. **Main Process (`src/main/`)**: Bundles `src/main/index.js` targeting Node/Electron runtime. Externalizes native/Node dependencies with `externalizeDepsPlugin()`.
2. **Preload Process (`src/preload/`)**: Bundles `src/preload/index.js` targeting Electron preload script environment.
3. **Renderer Process (`src/renderer/`)**: Serves and bundles HTML, CSS, assets, and frontend JavaScript/TypeScript with full Vite HMR.

### 3.2 Directory Structure
```
dota2-skinforge/
├── .husky/
│   └── pre-commit              # Runs npx lint-staged
├── out/                        # Build output (gitignored)
│   ├── main/index.js
│   ├── preload/index.js (or .mjs)
│   └── renderer/index.html + assets/
├── src/
│   ├── main/                   # Main process code
│   │   ├── index.js
│   │   ├── ipc/
│   │   └── services/
│   ├── preload/                # Preload context bridge
│   │   ├── index.js
│   │   └── index.d.ts          # API type definitions
│   ├── renderer/               # Renderer UI
│   │   ├── index.html          # Standard Vite entry
│   │   ├── index.js
│   │   ├── env.d.ts            # Window.skinforgeApi type augmentations
│   │   ├── styles/             # Stylesheets (index.css, theme, components)
│   │   ├── components/
│   │   ├── state/
│   │   └── utils/
│   └── shared/                 # Shared constants & helpers
├── electron.vite.config.mjs    # electron-vite configuration
├── eslint.config.mjs           # ESLint v9 flat config
├── .prettierrc                 # Prettier configuration
├── .prettierignore             # Prettier ignores
├── tsconfig.json               # Root TS solution config
├── tsconfig.node.json          # Node/Electron main & preload config
├── tsconfig.web.json           # Browser/Renderer DOM config
└── package.json
```

### 3.3 Configuration (`electron.vite.config.mjs`)
```javascript
import { resolve } from 'path';
import { defineConfig, externalizeDepsPlugin } from 'electron-vite';

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/main/index.js')
        }
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/preload/index.js')
        }
      }
    }
  },
  renderer: {
    root: resolve(__dirname, 'src/renderer'),
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/renderer/index.html')
        }
      }
    }
  }
});
```

### 3.4 Main Process Dev / Prod Window Handling
Update [`src/main/index.js`](file:///e:/My/dota2-skinforge/src/main/index.js):
* In development (`process.env.ELECTRON_RENDERER_URL` exists), load the Vite HMR URL:
  ```javascript
  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  }
  ```
* Preload resolution:
  ```javascript
  preload: path.join(__dirname, '../preload/index.js')
  ```

---

## 4. TypeScript Architecture

### 4.1 Solution Configuration (`tsconfig.json`)
```json
{
  "files": [],
  "references": [
    { "path": "./tsconfig.node.json" },
    { "path": "./tsconfig.web.json" }
  ]
}
```

### 4.2 Node Context Configuration (`tsconfig.node.json`)
```json
{
  "compilerOptions": {
    "composite": true,
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "allowJs": true,
    "checkJs": false,
    "strict": true,
    "noEmit": true,
    "types": ["node"]
  },
  "include": [
    "src/main/**/*",
    "src/preload/**/*",
    "src/shared/**/*",
    "scripts/**/*",
    "test/**/*",
    "electron.vite.config.*"
  ]
}
```

### 4.3 Web Context Configuration (`tsconfig.web.json`)
```json
{
  "compilerOptions": {
    "composite": true,
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "allowJs": true,
    "checkJs": false,
    "strict": true,
    "noEmit": true,
    "lib": ["ES2022", "DOM", "DOM.Iterable"]
  },
  "include": [
    "src/renderer/**/*",
    "src/shared/**/*"
  ]
}
```

### 4.4 IPC Type Declarations (`src/renderer/env.d.ts`)
Declare global window extensions matching the API defined in `src/preload/index.js`:
```typescript
export interface SkinforgeApi {
  detectDotaPath: () => Promise<string | null>;
  validateDotaPath: (gameDir: string) => Promise<boolean>;
  checkStatus: (gameDir: string) => Promise<any>;
  installMods: (payload: any) => Promise<any>;
  uninstallMods: (gameDir: string) => Promise<any>;
  isDotaRunning: () => Promise<boolean>;
  openDialog: (options: any) => Promise<any>;
  openExternal: (url: string) => Promise<void>;
  loadPreset: () => Promise<any>;
  savePreset: (preset: any) => Promise<boolean>;
  getAppVersion: () => Promise<string>;
  log: (level: string, message: string) => Promise<void>;
}

declare global {
  interface Window {
    skinforgeApi: SkinforgeApi;
  }
}
```

---

## 5. Code Quality: ESLint, Prettier, & Husky

### 5.1 ESLint Flat Config (`eslint.config.mjs`)
- Standard JavaScript rules (`@eslint/js.configs.recommended`).
- TypeScript parser and recommended rules (`typescript-eslint`).
- Disable conflicting formatting rules with `eslint-config-prettier`.
- Custom rule tweaks:
  - `no-unused-vars`: `['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }]`
  - `no-console`: `'off'` (standard logging in desktop apps).

### 5.2 Prettier Configuration (`.prettierrc`)
```json
{
  "semi": true,
  "singleQuote": true,
  "tabWidth": 2,
  "trailingComma": "es5",
  "printWidth": 100
}
```

### 5.3 Git Pre-Commit Hooks
- **Husky**: installed and initialized (`.husky/pre-commit` executes `npx lint-staged`).
- **lint-staged** (in `package.json`):
  ```json
  "lint-staged": {
    "*.{js,ts,mjs}": [
      "eslint --fix",
      "prettier --write"
    ],
    "*.{json,css,html,md}": [
      "prettier --write"
    ]
  }
  ```

---

## 6. Package Scripts

```json
"scripts": {
  "dev": "electron-vite dev",
  "build": "electron-vite build",
  "preview": "electron-vite preview",
  "typecheck": "tsc --noEmit",
  "lint": "eslint .",
  "lint:fix": "eslint . --fix",
  "format": "prettier --write \"src/**/*.{js,ts,css,html}\"",
  "format:check": "prettier --check \"src/**/*.{js,ts,css,html}\"",
  "test": "node test/services.test.js && node test/modifier.test.js && node test/catalog.test.js && node test/shared.test.js",
  "prepare": "husky"
}
```

---

## 7. Verification & Testing Strategy

1. **Build Verification**:
   - Run `npm run build` to verify `electron-vite` outputs valid bundles to `out/main`, `out/preload`, and `out/renderer`.
2. **Type Safety Verification**:
   - Run `npm run typecheck` to confirm zero TypeScript compilation errors across all processes.
3. **Lint & Format Verification**:
   - Run `npm run lint` and `npm run format:check` to ensure repository compliance.
4. **Integration & Smoke Testing**:
   - Run existing unit tests (`npm test`).
   - Run `node test/electron-smoke.js` to ensure Electron boots and loads without runtime crashes.
5. **Git Hook Verification**:
   - Verify `lint-staged` triggers on git commits.
