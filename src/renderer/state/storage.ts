/**
 * Safe `localStorage` JSON helpers and storage key constants for renderer state slices.
 * Wrapping `localStorage` here avoids repeating try/catch blocks and raw key strings across slices.
 */

export const STORAGE_KEYS = {
  heroSlots: 'skinforge_hero_slots',
  heroStanceSlots: 'skinforge_hero_stance_slots',
  heroActiveStance: 'skinforge_hero_active_stance',
  heroCustomizations: 'skinforge_hero_customizations',
  abilityIcons: 'skinforge_ability_icons',
  presets: 'skinforge_presets'
} as const

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

export function readJsonStorage<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return fallback
    const parsed: unknown = JSON.parse(raw)
    if (Array.isArray(fallback)) return (Array.isArray(parsed) ? parsed : fallback) as T
    if (isPlainObject(fallback)) return (isPlainObject(parsed) ? parsed : fallback) as T
    return parsed as T
  } catch {
    return fallback
  }
}

export function writeJsonStorage(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Ignore quota or unavailable-storage errors (e.g. Node unit tests).
  }
}

export function removeStorageKeys(...keys: string[]): void {
  try {
    for (const key of keys) localStorage.removeItem(key)
  } catch {
    // Ignore unavailable-storage errors.
  }
}

/** Lowercase all slot keys so legacy mixed-case entries (e.g. Valve's `"Legs"`) normalize cleanly. */
export function lowercaseSlotKeys<T>(slots: Record<string, T> | null | undefined): Record<string, T> {
  if (!isPlainObject(slots)) return {}
  return Object.fromEntries(Object.entries(slots).map(([slot, value]) => [slot.toLowerCase(), value]))
}
