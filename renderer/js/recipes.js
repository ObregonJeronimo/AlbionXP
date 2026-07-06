// Crafting recipes extracted from the raw game dump (ao-bin-dumps items.json).
// XML->JSON quirks: attributes are '@'-prefixed strings; craftingrequirements
// and craftresource are dict-or-list (normalize); enchanted equipment recipes
// live in enchantments.enchantment[] on the base item.
const RAW_ITEMS_URL = 'https://raw.githubusercontent.com/ao-data/ao-bin-dumps/master/items.json';

// Map<marketItemId, { resources: [{id, count}], focus, outCount, itemValue, category }>
export const recipeMap = new Map();
// Map<marketItemId, weight in kg> — for profit-per-weight transport ranking
export const weightMap = new Map();
let loaded = false;

function asList(x) {
  if (!x) return [];
  return Array.isArray(x) ? x : [x];
}

// Raw-dump resource name -> market id (T4_METALBAR_LEVEL1 -> T4_METALBAR_LEVEL1@1)
function marketId(rawName) {
  const m = /_LEVEL(\d)$/.exec(rawName);
  return m ? `${rawName}@${m[1]}` : rawName;
}

function extractRecipe(craftReqs, category, itemValue) {
  // Multiple craftingrequirements = alternative recipes; first is the standard one
  // (the others use faction hearts/tokens which have no market price).
  const req = asList(craftReqs)[0];
  if (!req) return null;
  const resources = asList(req.craftresource)
    .filter(r => r['@uniquename'] && !r['@uniquename'].includes('FACTION'))
    .map(r => ({ id: marketId(r['@uniquename']), count: Number(r['@count'] || 1) }));
  if (!resources.length) return null;
  return {
    resources,
    focus: Number(req['@craftingfocus'] || 0),
    outCount: Number(req['@amountcrafted'] || 1),
    silver: Number(req['@silver'] || 0),
    itemValue: Number(itemValue || 0),
    category,
  };
}

export async function loadRecipes() {
  if (loaded) return recipeMap.size;
  const res = await window.albion.fetchCachedText('items-raw.json', RAW_ITEMS_URL, 14);
  if (!res.ok) throw new Error(res.error || 'no se pudo descargar el volcado de recetas');
  const root = JSON.parse(res.data);
  const items = root.items || {};

  const CATEGORIES = [
    'simpleitem', 'consumableitem', 'equipmentitem', 'weapon',
    'furnitureitem', 'consumablefrominventoryitem', 'mount',
  ];

  // First pass: item values (@itemvalue exists on resources/simple items only)
  const itemValues = new Map();
  for (const cat of CATEGORIES) {
    for (const it of asList(items[cat])) {
      if (it['@uniquename'] && it['@itemvalue']) {
        const iv = Number(it['@itemvalue']);
        itemValues.set(it['@uniquename'], iv);
        // Enchanted resources double item value per level
        for (let e = 1; e <= 4; e++) {
          itemValues.set(`${it['@uniquename']}_LEVEL${e}@${e}`, iv * Math.pow(2, e));
        }
      }
    }
  }

  for (const cat of CATEGORIES) {
    for (const it of asList(items[cat])) {
      const base = it['@uniquename'];
      if (!base) continue;

      if (it['@weight']) {
        const w = Number(it['@weight']);
        weightMap.set(base, w);
        // Enchanted variants share the base weight
        for (let e = 1; e <= 4; e++) {
          weightMap.set(`${base}@${e}`, w);
          weightMap.set(`${base}_LEVEL${e}@${e}`, w);
        }
      }

      if (it.craftingrequirements) {
        const r = extractRecipe(it.craftingrequirements, cat, it['@itemvalue']);
        if (r) recipeMap.set(base, r);
      }

      // Enchanted variants of equipment (@1..@4) carry their own recipes
      if (it.enchantments && it.enchantments.enchantment) {
        for (const ench of asList(it.enchantments.enchantment)) {
          const lvl = ench['@enchantmentlevel'];
          if (!lvl || !ench.craftingrequirements) continue;
          const r = extractRecipe(ench.craftingrequirements, cat, ench['@itemvalue'] || it['@itemvalue']);
          if (r) recipeMap.set(`${base}@${lvl}`, r);
        }
      }
    }
  }
  // Equipment has no @itemvalue in the dump: derive it as the sum of
  // ingredient item values (community-verified rule for nutrition/station fees).
  for (const [, recipe] of recipeMap) {
    if (!recipe.itemValue) {
      recipe.itemValue = recipe.resources.reduce(
        (s, r) => s + (itemValues.get(r.id) || 0) * r.count, 0);
    }
  }

  loaded = true;
  return recipeMap.size;
}

export function getRecipe(itemId) {
  return recipeMap.get(itemId) || null;
}
