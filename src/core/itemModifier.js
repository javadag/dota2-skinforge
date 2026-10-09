const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const vpk = require('./vpk');

function normalizeName(str) {
  if (!str) return '';
  return str.toLowerCase()
    .replace(/\([^)]*\)/g, '')   // Remove parenthetical details like (Arcana - Red Butcher)
    .replace(/[^a-z0-9]/g, '')   // Keep alphanumerics only
    .trim();
}

function normalizeSlot(slot) {
  if (!slot) return '';
  const s = slot.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (s === 'weapon' || s === 'primary') return 'weapon';
  if (s === 'offhand' || s === 'leftweapon') return 'offhand_weapon';
  if (s === 'herobase') return 'hero_base';
  return s;
}

// Valve internal hero name aliases mapping
const HERO_ALIASES = {
  'zeus': 'zuus',
  'windranger': 'windrunner',
  'necrophos': 'necrolyte',
  'wraith_king': 'skeleton_king',
  'wraith king': 'skeleton_king',
  'clockwerk': 'rattletrap',
  'timbersaw': 'shredder',
  'natures_prophet': 'furion',
  "nature's_prophet": 'furion',
  "nature's prophet": 'furion',
  'underlord': 'abyssal_underlord',
  'io': 'wisp',
  'magnus': 'magnataur',
  'shadow_fiend': 'nevermore',
  'shadow fiend': 'nevermore',
  'doom': 'doom_bringer',
  'lifestealer': 'life_stealer',
  'treant_protector': 'treant',
  'treant protector': 'treant',
  'queen_of_pain': 'queenofpain',
  'queen of pain': 'queenofpain',
  'outworld_destroyer': 'obsidian_destroyer',
  'outworld destroyer': 'obsidian_destroyer',
  'outworld_devourer': 'obsidian_destroyer',
  'outworld devourer': 'obsidian_destroyer',
  'vengeful_spirit': 'vengefulspirit',
  'vengeful spirit': 'vengefulspirit',
  'centaur_warrunner': 'centaur',
  'centaur warrunner': 'centaur',
  'anti-mage': 'antimage',
  'antimage': 'antimage'
};

function getCanonicalHero(heroTag) {
  if (!heroTag) return '';
  const raw = heroTag.toLowerCase().trim();
  const norm = raw.replace(/\s+/g, '_').replace(/-/g, '_');
  const clean = raw.replace(/[^a-z0-9]/g, '');
  return HERO_ALIASES[raw] || HERO_ALIASES[norm] || HERO_ALIASES[clean] || norm;
}

// Build index of default items and cosmetics from items_game.txt content
function parseItemsGame(content) {
  const itemsIdx = content.indexOf('"items"');
  if (itemsIdx === -1) {
    return { defaultItems: [], cosmetics: [] };
  }

  const itemsOpen = content.indexOf('{', itemsIdx);
  // Match top-level item definition headers inside "items" { ... }
  // Top-level item keys are preceded by \t\t"(\d+)"\s*\{ (or at least 2 tabs)
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
    // Skip regex past this item's end so nested keys (like styles "0") are never matched as top-level items!
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

    // Special fix for Tidehunter Maw of the Megalodon - Arms:
    // It's a wearable with no model (the Arcana body covers the arms), so null out default bracers
    if (id === '34487' && !model) {
      model = 'models/props_nature/prop_null.vmdl';
    }

    const norm = normalizeName(name);

    if (prefab === 'default_item' && hero) {
      defaultItems.push({
        id,
        hero,
        slot,
        name,
        model,
        start,
        end,
        block
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
        block
      });
    }
  }

  return { defaultItems, cosmetics };
}

function findBestCosmetic(cosmetics, heroTag, slotId, itemName) {
  const normTarget = normalizeName(itemName);
  if (!normTarget) return null;

  const canonical = getCanonicalHero(heroTag);
  const cleanHero = canonical.replace(/[^a-z0-9]/g, '');

  // 1. Exact match on hero & normalized name
  let found = cosmetics.find(c => 
    c.norm === normTarget && (!c.hero || c.hero.replace(/[^a-z0-9]/g, '') === cleanHero)
  );
  if (found) return found;

  // 2. Starts with / includes match on hero & name
  found = cosmetics.find(c =>
    (c.norm.startsWith(normTarget) || normTarget.startsWith(c.norm) || c.norm.includes(normTarget)) &&
    (!c.hero || c.hero.replace(/[^a-z0-9]/g, '') === cleanHero)
  );
  if (found) return found;

  // 3. Fallback to any hero match
  found = cosmetics.find(c => c.norm === normTarget || c.norm.startsWith(normTarget) || normTarget.startsWith(c.norm));
  return found || null;
}

function findDefaultItem(defaultItems, heroTag, slotId) {
  const canonical = getCanonicalHero(heroTag);
  const cleanHero = canonical.replace(/[^a-z0-9]/g, '');
  const normSlot = normalizeSlot(slotId);

  // Filter default items for this hero (or universal default items like All Heroes' Default Taunt)
  const heroDefs = defaultItems.filter(d => d.hero.replace(/[^a-z0-9]/g, '') === cleanHero || d.hero === 'all');
  if (heroDefs.length === 0) return null;

  // 1. Exact slot match
  let matched = heroDefs.find(d => normalizeSlot(d.slot) === normSlot);
  if (matched) return matched;

  // 2. Name contains slot keyword fallback
  matched = heroDefs.find(d => {
    const n = d.name.toLowerCase();
    if (normSlot === 'weapon') {
      if (cleanHero === 'tidehunter' && (d.id === '36' || n.includes('anchor'))) return true;
      if (n.includes('weapon') || n.includes('glaive') || n.includes('axe') || n.includes('hook') || n.includes('blade') || n.includes('sword') || n.includes('bow') || n.includes('gun') || n.includes('staff') || n.includes('dagger') || n.includes('anchor') || n.includes('mace') || n.includes('flail') || n.includes('cudgel') || n.includes('spear') || n.includes('hammer') || n.includes('totem') || n.includes('club')) return true;
    }
    if (normSlot === 'mount' && (n.includes('mount') || n.includes('bat') || n.includes('steed') || n.includes('beast') || n.includes('chameleon'))) return true;
    if (normSlot === 'belt' && (n.includes('belt') || n.includes('waist') || n.includes('sash') || n.includes('molotov') || n.includes('girth'))) return true;
    if (normSlot === 'head' && (n.includes('head') || n.includes('hair') || n.includes('mask') || n.includes('helm') || n.includes('toupee') || n.includes('crown') || n.includes('bandana') || n.includes('hood'))) return true;
    if (normSlot === 'back' && (n.includes('back') || n.includes('cape') || n.includes('wings') || n.includes('quiver') || n.includes('cloak'))) return true;
    if (normSlot === 'arms' && (n.includes('arm') || n.includes('bracer') || n.includes('glove') || n.includes('wrist'))) return true;
    if (normSlot === 'shoulder' && (n.includes('shoulder') || n.includes('pauldron') || n.includes('spaulder'))) return true;
    if (normSlot === 'armor' && (n.includes('armor') || n.includes('robe') || n.includes('costume') || n.includes('apron') || n.includes('tunic') || n.includes('body'))) return true;
    if (normSlot === 'offhand' || normSlot === 'offhand_weapon') {
      if (n.includes('offhand') || n.includes('shield') || n.includes('cleaver') || n.includes('buckler') || n.includes('fish') || n.includes('lunch')) return true;
    }
    if (normSlot === 'tail' && n.includes('tail')) return true;
    if (normSlot === 'legs' && (n.includes('legs') || n.includes('boots') || n.includes('feet') || n.includes('hakama'))) return true;
    if (normSlot === 'misc' && (n.includes('misc') || n.includes('quiver') || n.includes('special'))) return true;
    if (normSlot === 'taunt' && n.includes('taunt')) return true;
    if (normSlot === 'persona_selector' && (n.includes('persona') || n.includes('base'))) return true;
    return false;
  });

  return matched || null;
}

function applyModModifications(content, equipped = {}) {
  const { defaultItems, cosmetics } = parseItemsGame(content);
  let modifiedContent = content;

  // Use Map to store unique replacements by defaultItem.id so range replacements don't collide
  const replacementMap = new Map();

  function patchDefaultItem(defaultItem, cosmetic) {
    if (!defaultItem) return;
    let currentBlock = replacementMap.has(defaultItem.id)
      ? replacementMap.get(defaultItem.id).replacement
      : defaultItem.block;

    // Replace model_player if cosmetic has a model
    if (cosmetic.model) {
      if (currentBlock.includes('"model_player"')) {
        currentBlock = currentBlock.replace(/"model_player"\s+"[^"]+"/, `"model_player"\t\t"${cosmetic.model}"`);
      } else {
        currentBlock = currentBlock.replace(/(\t*\}\s*)$/, `\t\t"model_player"\t\t"${cosmetic.model}"\n$1`);
      }
    }

    // Add particle_folder if cosmetic has one
    if (cosmetic.particleFolder) {
      if (currentBlock.includes('"particle_folder"')) {
        currentBlock = currentBlock.replace(/"particle_folder"\s+"[^"]+"/, `"particle_folder"\t\t"${cosmetic.particleFolder}"`);
      } else {
        currentBlock = currentBlock.replace(/(\t*\}\s*)$/, `\t\t"particle_folder"\t\t"${cosmetic.particleFolder}"\n$1`);
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
        currentBlock = currentBlock.substring(0, vIdx) + cosmetic.visualsBlock + currentBlock.substring(vClose);
      } else {
        currentBlock = currentBlock.replace(/(\t*\}\s*)$/, `\t\t${cosmetic.visualsBlock}\n$1`);
      }
    }

    replacementMap.set(defaultItem.id, {
      start: defaultItem.start,
      end: defaultItem.end,
      replacement: currentBlock
    });
  }

  for (const [heroTag, slots] of Object.entries(equipped)) {
    if (!slots || typeof slots !== 'object') continue;

    for (const [slotId, itemName] of Object.entries(slots)) {
      if (!itemName || typeof itemName !== 'string') continue;
      const cleanItemName = itemName.trim();
      if (cleanItemName.toLowerCase().includes('official base') || cleanItemName.toLowerCase() === 'default') {
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

    // Special handling for Legion Commander Arcana (Blades of Voth Domosh):
    // The Arcana consists of a hero_base itemdef (5810) providing dualwield/arcana activities,
    // ambient particles, custom duel ring & sounds, and voice criteria,
    // paired with dual blades (models/heroes/legion_commander/legion_commander_sword_weapon.vmdl).
    // If Arcana is equipped on either hero_base or weapon, ensure both base and weapon are properly patched!
    const cleanHero = getCanonicalHero(heroTag).replace(/[^a-z0-9]/g, '');
    if (cleanHero === 'legioncommander') {
      const arcanaEquippedInBase = slots['hero_base'] && (
        normalizeName(slots['hero_base']).includes('vothdomosh') ||
        normalizeName(slots['hero_base']).includes('arcana')
      );
      const arcanaEquippedInWeapon = slots['weapon'] && (
        normalizeName(slots['weapon']).includes('vothdomosh')
      );

      if (arcanaEquippedInBase || arcanaEquippedInWeapon) {
        const c5810 = cosmetics.find(c => c.id === '5810');
        const defBase = defaultItems.find(d => d.hero.replace(/[^a-z0-9]/g, '') === 'legioncommander' && (normalizeSlot(d.slot) === 'hero_base' || d.id === '847'));
        const defWeapon = defaultItems.find(d => d.hero.replace(/[^a-z0-9]/g, '') === 'legioncommander' && (normalizeSlot(d.slot) === 'weapon' || d.id === '434'));

        // Always ensure hero_base has Arcana visuals & particles
        if (c5810 && defBase) {
          patchDefaultItem(defBase, c5810);
        }

        // If weapon is not equipped with an explicit different custom weapon, ensure weapon has the dual swords model
        const hasOtherCustomWeapon = slots['weapon'] &&
          !normalizeName(slots['weapon']).includes('vothdomosh') &&
          !normalizeName(slots['weapon']).includes('officialbase') &&
          !normalizeName(slots['weapon']).includes('default');

        if (!hasOtherCustomWeapon && defWeapon) {
          patchDefaultItem(defWeapon, { model: 'models/heroes/legion_commander/legion_commander_sword_weapon.vmdl' });
        }
      }
    }

    // Special handling for Tidehunter Arcana (Maw of the Megalodon):
    // The Arcana consists of a hero_base itemdef (37143) providing the full entity_model override,
    // custom Ravage effects & sound, ambient particles, pedestals, and styles.
    // When equipped, ensure hero_base is patched with 37143 visuals.
    // Also, if arms (ID 34) is not overridden with another custom cosmetic, hide default wooden bracers with prop_null.
    // If weapon (ID 36) is not overridden with another custom weapon, ensure weapon has the Megalodon shark weapon model.
    if (cleanHero === 'tidehunter') {
      const arcanaEquippedInBase = slots['hero_base'] && (
        normalizeName(slots['hero_base']).includes('megalodon') ||
        normalizeName(slots['hero_base']).includes('arcana')
      );
      const anyArcanaEquipped = Object.values(slots).some(v => typeof v === 'string' && normalizeName(v).includes('megalodon'));

      if (arcanaEquippedInBase || anyArcanaEquipped) {
        const c37143 = cosmetics.find(c => c.id === '37143');
        const defBase = defaultItems.find(d => d.hero.replace(/[^a-z0-9]/g, '') === 'tidehunter' && (normalizeSlot(d.slot) === 'hero_base' || d.id === '904'));
        const defWeapon = defaultItems.find(d => d.hero.replace(/[^a-z0-9]/g, '') === 'tidehunter' && (d.id === '36' || normalizeSlot(d.slot) === 'weapon'));
        const defArms = defaultItems.find(d => d.hero.replace(/[^a-z0-9]/g, '') === 'tidehunter' && (d.id === '34' || normalizeSlot(d.slot) === 'arms'));
        const defBelt = defaultItems.find(d => d.hero.replace(/[^a-z0-9]/g, '') === 'tidehunter' && (d.id === '35' || normalizeSlot(d.slot) === 'belt'));
        const defOffhand = defaultItems.find(d => d.hero.replace(/[^a-z0-9]/g, '') === 'tidehunter' && (d.id === '37' || normalizeSlot(d.slot) === 'offhand_weapon'));

        if (c37143 && defBase) {
          patchDefaultItem(defBase, c37143);
        }

        const hasOtherCustomWeapon = slots['weapon'] &&
          !normalizeName(slots['weapon']).includes('megalodon') &&
          !normalizeName(slots['weapon']).includes('officialbase') &&
          !normalizeName(slots['weapon']).includes('default');

        if (!hasOtherCustomWeapon && defWeapon) {
          const c34483 = cosmetics.find(c => c.id === '34483');
          if (c34483) {
            patchDefaultItem(defWeapon, c34483);
          } else {
            patchDefaultItem(defWeapon, { model: 'models/items/tidehunter/tidehunter_arcana/tidehunter_arcana_weapon.vmdl' });
          }
        }

        const hasOtherCustomArms = slots['arms'] &&
          !normalizeName(slots['arms']).includes('megalodon') &&
          !normalizeName(slots['arms']).includes('officialbase') &&
          !normalizeName(slots['arms']).includes('default');

        if (!hasOtherCustomArms && defArms) {
          patchDefaultItem(defArms, { model: 'models/props_nature/prop_null.vmdl' });
        }

        const hasOtherCustomBelt = slots['belt'] &&
          !normalizeName(slots['belt']).includes('megalodon') &&
          !normalizeName(slots['belt']).includes('officialbase') &&
          !normalizeName(slots['belt']).includes('default');

        if (!hasOtherCustomBelt && defBelt) {
          const c34484 = cosmetics.find(c => c.id === '34484');
          if (c34484) {
            patchDefaultItem(defBelt, c34484);
          }
        }

        const hasOtherCustomOffhand = slots['offhand_weapon'] &&
          !normalizeName(slots['offhand_weapon']).includes('megalodon') &&
          !normalizeName(slots['offhand_weapon']).includes('officialbase') &&
          !normalizeName(slots['offhand_weapon']).includes('default');

        if (!hasOtherCustomOffhand && defOffhand) {
          const c34485 = cosmetics.find(c => c.id === '34485');
          if (c34485) {
            patchDefaultItem(defOffhand, c34485);
          }
        }
      }
    }
  }

  // Sort replacements from end of file to beginning so string replacements don't shift earlier offsets

  const replacements = Array.from(replacementMap.values());
  replacements.sort((a, b) => b.start - a.start);

  for (const r of replacements) {
    modifiedContent = modifiedContent.substring(0, r.start) + r.replacement + modifiedContent.substring(r.end);
  }

  return { modifiedContent, patchedCount: replacements.length };
}

async function generateModPackage(dotaGameDir, stagingDir, equipped = {}, onProgress = () => {}) {
  if (fs.existsSync(stagingDir)) {
    fs.rmSync(stagingDir, { recursive: true, force: true });
  }
  fs.mkdirSync(stagingDir, { recursive: true });

  const templateZip = path.resolve(__dirname, '../../data/mod_template.zip');
  if (!fs.existsSync(templateZip)) {
    throw new Error(`Base template archive missing at ${templateZip}`);
  }

  // Extract base template assets
  onProgress({ step: 3, total: 5, message: 'Unpacking base mod template assets...' });
  execSync(`tar -xf "${templateZip}" -C "${stagingDir}"`);

  // Try extracting the game's actual up-to-date items_game.txt and localization
  const dotaVpk = path.join(dotaGameDir, 'dota', 'pak01_dir.vpk');
  const targetItemsGame = path.join(stagingDir, 'scripts', 'items', 'items_game.txt');
  let baseContent = '';

  if (fs.existsSync(dotaVpk)) {
    try {
      onProgress({ step: 3, total: 5, message: 'Extracting fresh items schema from Dota 2...' });
      await vpk.extract(dotaVpk, 'scripts/items/items_game.txt', targetItemsGame);

      // Also try extracting localization so custom tokens resolve
      const targetLoc = path.join(stagingDir, 'resource', 'localization', 'dota_english.txt');
      try {
        await vpk.extract(dotaVpk, 'resource/localization/dota_english.txt', targetLoc);
      } catch (locErr) {}
    } catch (e) {
      // Fallback to template's items_game.txt
    }
  }

  if (fs.existsSync(targetItemsGame)) {
    baseContent = fs.readFileSync(targetItemsGame, 'utf-8');
  } else {
    throw new Error('Failed to find base items_game.txt');
  }

  onProgress({ step: 3, total: 5, message: 'Compiling custom loadouts into items schema...' });
  const { modifiedContent, patchedCount } = applyModModifications(baseContent, equipped);

  fs.writeFileSync(targetItemsGame, modifiedContent, 'utf-8');

  return { success: true, patchedCount };
}

module.exports = {
  normalizeName,
  normalizeSlot,
  applyModModifications,
  generateModPackage
};
