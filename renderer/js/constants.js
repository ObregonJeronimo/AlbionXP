// Economy constants. Values verified against the Albion wiki + community research
// (see docs/RESEARCH.md). PLACEHOLDER values are marked and re-verified after research.

export const CITIES = ['Bridgewatch', 'Fort Sterling', 'Lymhurst', 'Martlock', 'Thetford', 'Caerleon', 'Brecilien'];
export const CITIES_WITH_BM = [...CITIES, 'Black Market'];
export const ROYAL_CITIES = ['Bridgewatch', 'Fort Sterling', 'Lymhurst', 'Martlock', 'Thetford'];

// Market fees (fraction of sell price)
export const SALES_TAX_PREMIUM = 0.04;
export const SALES_TAX_NO_PREMIUM = 0.08;
export const SETUP_FEE = 0.025; // listing fee for sell orders (also charged on buy orders)

export function sellOrderFees(premium) {
  return (premium ? SALES_TAX_PREMIUM : SALES_TAX_NO_PREMIUM) + SETUP_FEE;
}

// Instant sell to an existing buy order: sales tax only, no setup fee
export function instantSellFees(premium) {
  return premium ? SALES_TAX_PREMIUM : SALES_TAX_NO_PREMIUM;
}

export const QUALITY_NAMES = { 1: 'Normal', 2: 'Bueno', 3: 'Notable', 4: 'Excelente', 5: 'Obra maestra' };

// ---------- Refining ----------
// City refining bonuses (which city has the resource-return bonus for each material)
export const REFINE_BONUS_CITY = {
  ORE: 'Thetford',      // metal bars
  WOOD: 'Fort Sterling',// planks
  FIBER: 'Lymhurst',    // cloth
  HIDE: 'Martlock',     // leather
  ROCK: 'Bridgewatch',  // stone blocks
};

// Resource return rates. Formula: RRR = 1 - 1/(1 + PB/100).
// Royal city baseline PB=18; refining specialty +40; crafting specialty +15; focus +59.
// Verified against wiki.albiononline.com/wiki/Resource_Return_Rate (2026-07).
export const RRR = {
  base: 0.1525,          // royal city without bonus (PB 18)
  bonusCity: 0.3671,     // refining specialty city (PB 58)
  baseFocus: 0.435,      // no bonus + focus (PB 77)
  bonusCityFocus: 0.539, // specialty city + focus (PB 117)
};

export const CRAFT_RRR = {
  base: 0.1525,          // royal city (PB 18)
  bonusCity: 0.248,      // city with crafting specialty for that line (PB 33)
  baseFocus: 0.435,      // + focus (PB 77)
  bonusCityFocus: 0.479, // specialty + focus (PB 92)
};

// City crafting specializations (+15 PB on these lines). Wiki-confirmed.
export const CRAFT_BONUS = {
  Martlock: 'Hachas, bastones ⅄ (quarterstaff), bastones de escarcha, zapatos de placas, off-hands',
  Bridgewatch: 'Ballestas, dagas, bastones malditos, armadura de placas, zapatos de tela',
  Lymhurst: 'Espadas, arcos, bastones arcanos, capucha y zapatos de cuero',
  'Fort Sterling': 'Martillos, lanzas, bastones sagrados, casco de placas, armadura de tela',
  Thetford: 'Mazas, bastones de naturaleza, bastones de fuego, armadura de cuero, capucha de tela',
  Caerleon: 'Guantes de guerra, cambiaformas, equipo de recolección, herramientas, comida',
  Brecilien: 'Capas, bolsas, pociones',
};

// Station usage fee: nutrition = itemValue × 0.1125; fee = nutrition × feePer100/100.
// feePer100 is player-set, capped at 1000. Refined material itemValue = 16 × 2^(T+E-4).
export function stationFee(itemValue, feePer100) {
  return itemValue * 0.1125 * (feePer100 / 100);
}

export function refinedItemValue(tier, ench) {
  return 16 * Math.pow(2, tier + ench - 4);
}

export const RESOURCES = {
  ORE: { raw: 'ORE', refined: 'METALBAR', rawEs: 'Mineral', refinedEs: 'Lingotes' },
  WOOD: { raw: 'WOOD', refined: 'PLANKS', rawEs: 'Madera', refinedEs: 'Tablones' },
  FIBER: { raw: 'FIBER', refined: 'CLOTH', rawEs: 'Fibra', refinedEs: 'Tela' },
  HIDE: { raw: 'HIDE', refined: 'LEATHER', rawEs: 'Piel', refinedEs: 'Cuero' },
  ROCK: { raw: 'ROCK', refined: 'STONEBLOCK', rawEs: 'Piedra', refinedEs: 'Bloques' },
};

// Raw units per refined unit + 1 refined of previous tier from T3 up.
// Verified against ao-bin-dumps items.json craftingrequirements (2026-07).
export const REFINE_INPUTS = {
  2: { raw: 1, prev: 0 },
  3: { raw: 2, prev: 1 },
  4: { raw: 2, prev: 1 },
  5: { raw: 3, prev: 1 },
  6: { raw: 4, prev: 1 },
  7: { raw: 5, prev: 1 },
  8: { raw: 5, prev: 1 },
};

// Max enchantment level that actually exists per resource chain
// (verified: ROCK raw goes to .3, STONEBLOCK has no enchanted variants at all)
export function maxEnch(resource, kind /* 'raw' | 'refined' */) {
  if (resource === 'ROCK') return kind === 'raw' ? 3 : 0;
  return 4;
}

// Item id helpers for resources: raw T5+ enchanted use _LEVELn@n suffix
export function rawId(resource, tier, ench) {
  const base = `T${tier}_${resource}`;
  return ench > 0 ? `${base}_LEVEL${ench}@${ench}` : base;
}

export function refinedId(resource, tier, ench) {
  const map = { ORE: 'METALBAR', WOOD: 'PLANKS', FIBER: 'CLOTH', HIDE: 'LEATHER', ROCK: 'STONEBLOCK' };
  const base = `T${tier}_${map[resource]}`;
  return ench > 0 ? `${base}_LEVEL${ench}@${ench}` : base;
}
