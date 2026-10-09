const fs = require('fs');
const https = require('https');
const path = require('path');

const catalogPath = fs.existsSync('data/valveHeroCatalog.json') ? 'data/valveHeroCatalog.json' : 'src/data/valveHeroCatalog.json';
const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));

// Build name -> item lookup map
const nameToItem = new Map();
for (const [heroKey, heroData] of Object.entries(catalog)) {
  if (!heroData.items) continue;
  for (const [slotKey, items] of Object.entries(heroData.items)) {
    for (const item of items) {
      if (!item.name || item.isDefault) continue;
      const clean = item.name.toLowerCase().trim();
      if (!nameToItem.has(clean)) {
        nameToItem.set(clean, item);
      }
    }
  }
}

console.log(`Indexed ${nameToItem.size} unique cosmetic names from catalog.`);

function fetchMarket(url) {
  return new Promise((resolve) => {
    https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' } }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try {
          const j = JSON.parse(data);
          resolve(j.results || []);
        } catch (e) {
          resolve([]);
        }
      });
    }).on('error', () => resolve([]));
  });
}

function downloadIcon(iconHash, outPath) {
  return new Promise((resolve) => {
    if (fs.existsSync(outPath) && fs.statSync(outPath).size > 1000) {
      return resolve(true);
    }
    const url = `https://community.steamstatic.com/economy/image/${iconHash}`;
    const file = fs.createWriteStream(outPath);
    https.get(url, (res) => {
      if (res.statusCode !== 200) {
        file.close();
        if (fs.existsSync(outPath)) fs.unlinkSync(outPath);
        return resolve(false);
      }
      res.pipe(file);
      file.on('finish', () => file.close(() => resolve(true)));
    }).on('error', () => {
      file.close();
      if (fs.existsSync(outPath)) fs.unlinkSync(outPath);
      resolve(false);
    });
  });
}

async function processResults(results, label) {
  let matched = 0;
  let downloaded = 0;
  for (const res of results) {
    if (!res.name || !res.asset_description?.icon_url) continue;
    let cleanName = res.name.toLowerCase().trim();
    // Strip prefixes like "Inscribed ", "Autographed ", "Corrupted ", "Genuine "
    cleanName = cleanName.replace(/^(inscribed|autographed|corrupted|genuine|cursed|frozen|heroic|exalted)\s+/i, '');
    
    const matchedItem = nameToItem.get(cleanName);
    if (matchedItem) {
      matched++;
      const outPath = path.join('assets/items', `${matchedItem.id}.png`);
      const ok = await downloadIcon(res.asset_description.icon_url, outPath);
      if (ok) downloaded++;
    }
  }
  console.log(`[${label}] Results: ${results.length} | Matched: ${matched} | Downloaded/Cached: ${downloaded}`);
}

async function main() {
  if (!fs.existsSync('assets/items')) {
    fs.mkdirSync('assets/items', { recursive: true });
  }

  // 1. Fetch Immortals pages (first 10 pages = 100 items)
  console.log('--- Fetching Popular Immortals ---');
  for (let page = 0; page < 8; page++) {
    const start = page * 10;
    const url = `https://steamcommunity.com/market/search/render/?query=immortal&start=${start}&count=10&search_descriptions=0&sort_column=popular&sort_dir=desc&appid=570&norender=1`;
    const res = await fetchMarket(url);
    await processResults(res, `Immortal p${page + 1}`);
    await new Promise(r => setTimeout(r, 600));
  }

  // 2. Fetch popular hero cosmetic pages
  const topHeroes = [
    'pudge', 'invoker', 'juggernaut', 'phantom_assassin',
    'nevermore', 'legion_commander', 'tidehunter', 'axe',
    'faceless_void', 'rubick', 'crystal_maiden', 'anti_mage'
  ];

  console.log('--- Fetching Top Heroes Popular Cosmetics ---');
  for (const h of topHeroes) {
    const url = `https://steamcommunity.com/market/search/render/?category_570_Hero%5B%5D=tag_npc_dota_hero_${h}&start=0&count=10&search_descriptions=0&sort_column=popular&sort_dir=desc&appid=570&norender=1`;
    const res = await fetchMarket(url);
    await processResults(res, `Hero: ${h}`);
    await new Promise(r => setTimeout(r, 600));
  }

  // 3. Scan assets/items and write availableIcons.js
  const files = fs.readdirSync('assets/items').filter(f => f.endsWith('.png'));
  const ids = files.map(f => f.replace('.png', '')).sort();
  console.log(`\n========================================`);
  console.log(`Total Curated Items in assets/items: ${ids.length}`);
  console.log(`========================================\n`);

  const code = `// ============================================================================
// Dota 2 SkinForge — Curated Offline Armory Icons Set
// Auto-generated manifest of bundled official high-definition cosmetic icons.
// ============================================================================

export const AVAILABLE_ITEM_ICONS = new Set(${JSON.stringify(ids, null, 2)});
export default AVAILABLE_ITEM_ICONS;
`;

  fs.writeFileSync('src/data/availableIcons.js', code, 'utf8');
  console.log('Generated src/data/availableIcons.js successfully.');
}

main().catch(console.error);
