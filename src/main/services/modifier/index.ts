/**
 * Dota 2 SkinForge — Cosmetic Modifier Compiler Engine (Public Facade)
 */

export { applyModModifications, type CompilerResult, type PatchReplacement } from './compiler'
export { generateModPackage, type ModPackageResult, type ModProgressData, type VpkServiceLike } from './modPackager'
export { normalizeName, normalizeSlot, findBestCosmetic, findDefaultItem, type KnownSlot, type NormalizedSlot } from './matcher'
export { parseItemsGame, type DefaultItemEntry, type CosmeticItemEntry, type ParsedItemsGame } from './vdfParser'
export { rules, type ModifierRule, type RuleApplyParams, type CosmeticPartial } from './rules'
