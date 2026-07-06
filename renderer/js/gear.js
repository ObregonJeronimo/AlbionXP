// Shared universe of liquid gear lines for scanners (sniper, black market).
export const GEAR_LINES = [
  '2H_CLAYMORE', 'MAIN_SWORD', '2H_AXE', '2H_HALBERD', 'MAIN_MACE', '2H_BOW',
  '2H_CROSSBOWLARGE', 'MAIN_FIRESTAFF', '2H_FIRESTAFF', 'MAIN_FROSTSTAFF',
  '2H_ARCANESTAFF', 'MAIN_CURSEDSTAFF', 'MAIN_HOLYSTAFF', '2H_HOLYSTAFF',
  '2H_NATURESTAFF', 'MAIN_SPEAR', '2H_SPEAR', 'MAIN_DAGGER', '2H_DAGGERPAIR',
  '2H_QUARTERSTAFF', 'MAIN_HAMMER', '2H_POLEHAMMER',
  'ARMOR_PLATE_SET1', 'ARMOR_PLATE_SET2', 'ARMOR_PLATE_SET3',
  'ARMOR_LEATHER_SET1', 'ARMOR_LEATHER_SET2', 'ARMOR_LEATHER_SET3',
  'ARMOR_CLOTH_SET1', 'ARMOR_CLOTH_SET2', 'ARMOR_CLOTH_SET3',
  'HEAD_PLATE_SET1', 'HEAD_LEATHER_SET1', 'HEAD_CLOTH_SET1',
  'SHOES_PLATE_SET1', 'SHOES_LEATHER_SET1', 'SHOES_CLOTH_SET1',
  'BAG', 'CAPE',
];

export function gearUniverse(tiers = [4, 5, 6], enchants = [0, 1]) {
  const ids = [];
  for (const line of GEAR_LINES) {
    for (const t of tiers) {
      for (const e of enchants) {
        ids.push(e > 0 ? `T${t}_${line}@${e}` : `T${t}_${line}`);
      }
    }
  }
  return ids;
}

// Liquid, transport-worthy universe: resources + food + potions.
// Shared by the flip scanner and the volume/movers view.
export function liquidUniverse() {
  const ids = [];
  // STONEBLOCK has no enchanted variants; ROCK raw only up to .3
  const RES = ['METALBAR', 'PLANKS', 'CLOTH', 'LEATHER', 'STONEBLOCK'];
  for (const r of RES) {
    for (let t = 4; t <= 8; t++) {
      ids.push(`T${t}_${r}`);
      if (r !== 'STONEBLOCK') for (let e = 1; e <= 3; e++) ids.push(`T${t}_${r}_LEVEL${e}@${e}`);
    }
  }
  const RAW = ['ORE', 'WOOD', 'FIBER', 'HIDE', 'ROCK'];
  for (const r of RAW) {
    for (let t = 4; t <= 8; t++) {
      ids.push(`T${t}_${r}`);
      for (let e = 1; e <= 3; e++) ids.push(`T${t}_${r}_LEVEL${e}@${e}`);
    }
  }
  // Food & consumables (light and liquid)
  ids.push(
    'T6_MEAL_STEW', 'T8_MEAL_STEW', 'T6_MEAL_OMELETTE', 'T8_MEAL_OMELETTE',
    'T6_MEAL_PIE', 'T8_MEAL_PIE', 'T6_MEAL_SALAD', 'T7_MEAL_SANDWICH',
    'T4_POTION_HEAL', 'T6_POTION_HEAL', 'T4_POTION_ENERGY', 'T6_POTION_ENERGY',
  );
  return ids;
}
