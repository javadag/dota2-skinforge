/**
 * Dota 2 SkinForge — Cosmetic Modifier Compiler Engine (Public Facade)
 */

const { applyModModifications } = require('./compiler');
const { generateModPackage } = require('./modPackager');
const { normalizeName, normalizeSlot, findBestCosmetic, findDefaultItem } = require('./matcher');
const { parseItemsGame } = require('./vdfParser');

module.exports = {
  applyModModifications,
  generateModPackage,
  parseItemsGame,
  normalizeName,
  normalizeSlot,
  findBestCosmetic,
  findDefaultItem,
};
