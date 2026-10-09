/// <reference types="vite/client" />

export interface SkinforgeApi {
  detectDotaPath: () => Promise<string | null>;
  validateDotaPath: (gameDir: string) => Promise<boolean>;
  checkStatus: (
    gameDir: string
  ) => Promise<{ installed: boolean; searchPathOk: boolean; signatureOk: boolean }>;
  installMods: (payload: {
    heroId: string;
    selectedItems: Record<string, any>;
    gameDir?: string;
  }) => Promise<{ success: boolean; error?: string }>;
  uninstallMods: (gameDir: string) => Promise<{ success: boolean; error?: string }>;
  isDotaRunning: () => Promise<boolean>;
  openDialog: (options: {
    title?: string;
    properties?: string[];
  }) => Promise<{ canceled: boolean; filePaths: string[] }>;
  openExternal: (url: string) => Promise<void>;
  loadPreset: () => Promise<any>;
  savePreset: (preset: any) => Promise<boolean>;
  getAppVersion: () => Promise<string>;
  log: (level: string, message: string) => Promise<void>;
}

declare global {
  interface Window {
    skinforgeApi: SkinforgeApi;
    heroAliases?: {
      HERO_ALIASES: Record<string, string>;
    };
  }
}
