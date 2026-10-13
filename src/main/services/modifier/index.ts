/**
 * Dota 2 SkinForge — Cosmetic Modifier Compiler Engine (Public Facade)
 *
 * The engine is data-driven from the game's own `items_game.txt`:
 *  - `vdf`      span-preserving KeyValues parser, editor and serializer
 *  - `schema`   typed index (items, slots, defaults, item_sets, personas, localization)
 *  - `visuals`  structural `visuals` / `portraits` / style transforms
 *  - `plan`     turns slot selections into an explainable list of edits
 *  - `compile`  applies the plan to the tree and validates the result
 *
 * There are no per-hero rules and no hardcoded cosmetic tables: arcana companions come
 * from `item_sets`, persona pieces from `*_persona_N` default items, and style names
 * from the game's localization file.
 */

export {
  compileItemsGame,
  type AppliedPatch,
  type CompileOptions,
  type CompileReport,
  type CompileResult,
  type ValidationResult
} from './compile'
export { generateModPackage, type ModPackageResult, type ModProgressData, type VpkServiceLike } from './modPackager'
export {
  buildPlan,
  ownerFor,
  personaItemFor,
  type CustomizationsMap,
  type ModificationPlan,
  type PatchReason,
  type PlannedPatch,
  type SkippedSelection
} from './plan'
export {
  buildSchema,
  defaultFor,
  defaultSlots,
  isOpaqueBlock,
  isPersonaSlot,
  itemByName,
  localize,
  personaHeroes,
  personaVariantSlots,
  primarySetFor,
  resolveSlot,
  tokenizeName,
  type SchemaIndex,
  type SchemaItem,
  type SchemaSet,
  type SetChoice,
  type SlotSource
} from './schema'
export { parseVdf, serializeValue, detectEol, type VdfDocument, type VdfNode } from './vdf'
export { NULL_MODEL, flattenVisuals, styleOptions, type StyleOption } from './visuals'
