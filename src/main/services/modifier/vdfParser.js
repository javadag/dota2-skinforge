/**
 * VDF / KeyValues items_game.txt Parser
 * Extracts default items and cosmetic loadout entries from Dota 2 schema.
 */

function parseItemsGame(content) {
  const itemsIdx = content.indexOf('"items"');
  if (itemsIdx === -1) {
    return { defaultItems: [], cosmetics: [] };
  }

  const itemsOpen = content.indexOf('{', itemsIdx);
  const itemHeaderRegex = /\t\t"(\d+)"\s*\{/g;
  itemHeaderRegex.lastIndex = itemsOpen;

  const defaultItems = [];
  const cosmetics = [];

  let m;
  while ((m = itemHeaderRegex.exec(content)) !== null) {
    const id = m[1];
    const start = m.index + 2; // skip the leading \t\t
    const openBrace = content.indexOf('{', start);
    if (openBrace === -1) break;

    // Scan until matching closing brace of this item
    let depth = 1;
    let pos = openBrace + 1;
    while (pos < content.length && depth > 0) {
      const ch = content[pos];
      if (ch === '{') depth++;
      else if (ch === '}') depth--;
      pos++;
    }
    const end = pos;
    // Skip regex past this item's end so nested keys are never matched as top-level items
    itemHeaderRegex.lastIndex = end;

    const block = content.substring(start, end);

    const nameMatch = block.match(/"name"\s+"([^"]+)"/);
    if (!nameMatch) continue;
    const name = nameMatch[1];

    const prefabMatch = block.match(/"prefab"\s+"([^"]+)"/);
    const modelMatch = block.match(/"model_player"\s+"([^"]+)"/);
    const slotMatch = block.match(/"item_slot"\s+"([^"]+)"/);
    const particleMatch = block.match(/"particle_folder"\s+"([^"]+)"/);
    const heroMatch = block.match(/"(npc_dota_hero_[^"]+)"/) || block.match(/"(all)"\s+"1"/);

    // Extract visuals block accurately within this item's block
    let visualsBlock = null;
    const vIdx = block.indexOf('"visuals"');
    if (vIdx !== -1) {
      const vOpen = block.indexOf('{', vIdx);
      if (vOpen !== -1) {
        let vDepth = 1;
        let vPos = vOpen + 1;
        while (vPos < block.length && vDepth > 0) {
          if (block[vPos] === '{') vDepth++;
          else if (block[vPos] === '}') vDepth--;
          vPos++;
        }
        if (vDepth === 0) visualsBlock = block.substring(vIdx, vPos);
      }
    }

    const prefab = prefabMatch ? prefabMatch[1] : '';
    let model = modelMatch ? modelMatch[1] : '';
    let slot = slotMatch ? slotMatch[1] : '';
    const hero = heroMatch ? heroMatch[1].replace('npc_dota_hero_', '') : '';
    const particleFolder = particleMatch ? particleMatch[1] : '';

    if (!slot) {
      if (prefab === 'wearable') slot = 'weapon';
      else if (prefab === 'taunt') slot = 'taunt';
    }

    // Tidehunter Maw of the Megalodon Arms fix: wearable with no model
    if (id === '34487' && !model) {
      model = 'models/props_nature/prop_null.vmdl';
    }

    const norm = name
      .toLowerCase()
      .replace(/\([^)]*\)/g, '')
      .replace(/[^a-z0-9]/g, '')
      .trim();

    if (prefab === 'default_item' && hero) {
      defaultItems.push({
        id,
        hero,
        slot,
        name,
        model,
        start,
        end,
        block,
      });
    }

    if (name && (model || visualsBlock || particleFolder)) {
      cosmetics.push({
        id,
        name,
        norm,
        model,
        hero,
        slot,
        particleFolder,
        visualsBlock,
        block,
      });
    }
  }

  return { defaultItems, cosmetics };
}

module.exports = {
  parseItemsGame,
};
