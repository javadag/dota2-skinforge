/**
 * Dota 2 SkinForge — Cosmetic Modifier Compiler Engine (Public Facade)
 *
 * The engine is data-driven from the game's own `items_game.txt`:
 *  - `vdf`      span-preserving KeyValues parser, editor and serializer
 *  - `schema`   typed index (items, slots, defaults, personas, localization)
 *  - `visuals`  structural `visuals` / `portraits` / style transforms
 *  - `plan`     turns slot selections into an explainable list of edits
 *  - `compile`  applies the plan to the tree and validates the result
 *
 * Explicit slot selections, persona pieces (`*_persona_N` default items), and localized
 * style names are resolved directly from the schema without hardcoded cosmetic tables.
 */

export {
  compileItemsGame,
  type AppliedPatch,
  type CompileOptions,
  type CompileReport,
  type CompileResult,
  type EntityModelOverride,
  type ModelSwap,
  type PatchReason,
  type ValidationResult
} from './compile'
export { HERO_BASE_MODELS, baseModelForHero } from './heroBaseModels'
export {
  buildPlan,
  ownerFor,
  personaItemFor,
  type CustomizationsMap,
  type ModificationPlan,
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
  personaVariantSlots,
  resolveSlot,
  type SchemaIndex,
  type SchemaItem,
  type SlotSource
} from './schema'
export { parseVdf, serializeValue, detectEol, type VdfDocument, type VdfNode } from './vdf'
export { NULL_MODEL, flattenVisuals, styleOptions, type StyleOption } from './visuals'
