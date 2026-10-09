/**
 * Dota 2 SkinForge — Cosmetic Compiler
 */

const { parseItemsGame } = require('./vdfParser');
const { normalizeName, normalizeSlot, findBestCosmetic, findDefaultItem } = require('./matcher');
const { getCanonicalHero } = require('../../../shared/constants/heroAliases');
const rules = require('./rules');

function applyModModifications(content, equipped = {}) {
  const { defaultItems, cosmetics } = parseItemsGame(content);
  let modifiedContent = content;

  const replacementMap = new Map();

  function patchDefaultItem(defaultItem, cosmetic) {
    if (!defaultItem) return;
    let currentBlock = replacementMap.has(defaultItem.id)
      ? replacementMap.get(defaultItem.id).replacement
      : defaultItem.block;

    // Replace model_player if cosmetic has a model
    if (cosmetic.model) {
      if (currentBlock.includes('"model_player"')) {
        currentBlock = currentBlock.replace(
          /"model_player"\s+"[^"]+"/,
          `"model_player"\t\t"${cosmetic.model}"`
        );
      } else {
        currentBlock = currentBlock.replace(
          /(\t*\}\s*)$/,
          `\t\t"model_player"\t\t"${cosmetic.model}"\n$1`
        );
      }
    }

    // Add particle_folder if cosmetic has one
    if (cosmetic.particleFolder) {
      if (currentBlock.includes('"particle_folder"')) {
        currentBlock = currentBlock.replace(
          /"particle_folder"\s+"[^"]+"/,
          `"particle_folder"\t\t"${cosmetic.particleFolder}"`
        );
      } else {
        currentBlock = currentBlock.replace(
          /(\t*\}\s*)$/,
          `\t\t"particle_folder"\t\t"${cosmetic.particleFolder}"\n$1`
        );
      }
    }

    // Add or merge visuals block
    if (cosmetic.visualsBlock) {
      if (currentBlock.includes('"visuals"')) {
        const vIdx = currentBlock.indexOf('"visuals"');
        const vOpen = currentBlock.indexOf('{', vIdx);
        let depth = 1;
        let vClose = vOpen + 1;
        while (vClose < currentBlock.length && depth > 0) {
          if (currentBlock[vClose] === '{') depth++;
          else if (currentBlock[vClose] === '}') depth--;
          vClose++;
        }
        currentBlock =
          currentBlock.substring(0, vIdx) + cosmetic.visualsBlock + currentBlock.substring(vClose);
      } else {
        currentBlock = currentBlock.replace(/(\t*\}\s*)$/, `\t\t${cosmetic.visualsBlock}\n$1`);
      }
    }

    replacementMap.set(defaultItem.id, {
      start: defaultItem.start,
      end: defaultItem.end,
      replacement: currentBlock,
    });
  }

  for (const [heroTag, slots] of Object.entries(equipped)) {
    if (!slots || typeof slots !== 'object') continue;

    for (const [slotId, itemName] of Object.entries(slots)) {
      if (!itemName || typeof itemName !== 'string') continue;
      const cleanItemName = itemName.trim();
      if (
        cleanItemName.toLowerCase().includes('official base') ||
        cleanItemName.toLowerCase() === 'default'
      ) {
        continue;
      }

      const cosmetic = findBestCosmetic(cosmetics, heroTag, slotId, cleanItemName);
      if (!cosmetic) continue;

      let defaultItem = findDefaultItem(defaultItems, heroTag, slotId);
      if (!defaultItem && cosmetic.slot) {
        defaultItem = findDefaultItem(defaultItems, heroTag, cosmetic.slot);
      }
      if (!defaultItem) continue;

      patchDefaultItem(defaultItem, cosmetic);
    }

    // Execute any registered hero-specific Arcana rules
    const canonical = getCanonicalHero(heroTag);
    const cleanHero = canonical.replace(/[^a-z0-9]/g, '');

    for (const rule of rules) {
      if (rule.hero === cleanHero) {
        rule.apply({
          heroTag,
          slots,
          cosmetics,
          defaultItems,
          patchDefaultItem,
        });
      }
    }
  }

  // Sort replacements in reverse order so character offsets do not shift
  const replacements = Array.from(replacementMap.values());
  replacements.sort((a, b) => b.start - a.start);

  for (const r of replacements) {
    modifiedContent =
      modifiedContent.substring(0, r.start) + r.replacement + modifiedContent.substring(r.end);
  }

  return { modifiedContent, patchedCount: replacements.length };
}

module.exports = {
  applyModModifications,
};
