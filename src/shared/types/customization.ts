export interface ItemCustomization {
  style?: number
}

export type HeroCustomizationsMap = Record<string, Record<string, ItemCustomization>>

/**
 * A saved style belongs to the item it was chosen for — drop it when that slot's item
 * changes. Returns the input untouched (by identity) when nothing changed, so callers
 * can skip the localStorage write and the state update.
 */
export function dropStaleStyles(
  cust: HeroCustomizationsMap,
  heroTag: string,
  before: Record<string, string>,
  after: Record<string, string>
): HeroCustomizationsMap {
  const heroCust = cust[heroTag]
  if (!heroCust) return cust
  let next = heroCust
  for (const slotId of Object.keys(after)) {
    if (before[slotId] !== after[slotId] && next[slotId]) {
      if (next === heroCust) next = { ...heroCust }
      delete next[slotId]
    }
  }
  return next === heroCust ? cust : { ...cust, [heroTag]: next }
}
