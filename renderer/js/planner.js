// Silver plan engine: DETERMINISTIC. Computes real, data-backed plans to reach
// a silver target — the AI layer only narrates what this engine calculated.
//
// Time model (stated assumptions, shown in the UI):
// - Transport run between royal cities: ~25 min (buy + travel + list).
// - Caerleon / Black Market run: ~35 min (red zone care).
// - Refine cycle (buy + queue + collect + list): ~30 min active per batch.
// - Throughput is capped at a fraction of observed daily volume so the plan
//   doesn't assume you can dump 10k units into a market that trades 500/day.
import { getPrices, getHistoryMulti } from './api.js';
import { CITIES, sellOrderFees, instantSellFees, RRR, REFINE_BONUS_CITY, RESOURCES, REFINE_INPUTS, rawId, refinedId, stationFee, refinedItemValue, maxEnch, SETUP_FEE, CRAFT_RRR } from './constants.js';
import { gearUniverse, liquidUniverse } from './gear.js';
import { loadRecipes, getRecipe, recipeMap, craftProfit } from './recipes.js';
import { itemName } from './items.js';
import { state, dataAge } from './state.js';

const VOLUME_CAPTURE = 0.20;   // assume we can capture ≤20% of daily traded volume
const RUN_MINUTES = { transport: 25, caerleon: 35, refine: 30 };

// Freshness window is user-configurable (sidebar setting: 30 min … 24 h)
function fresh(price, date) {
  return price && (dataAge(date) ?? Infinity) <= state.maxDataAgeMin;
}

// ---------- Strategy scanners: each returns opportunities normalized to
// { kind, title, steps[], profitPerCycle, capitalPerCycle, minutesPerCycle, cyclesPerDay } ----------

// Receives the shared liquid-universe prices (fetched once in buildPlans) so the
// transport and city-flip scanners don't each hit the rate-limited API.
async function scanTransport(prices) {
  const feeRate = sellOrderFees(state.premium);

  const byItem = new Map();
  for (const p of prices) {
    if (!byItem.has(p.itemId)) byItem.set(p.itemId, []);
    byItem.get(p.itemId).push(p);
  }

  // Best route per item
  const routes = [];
  for (const [itemId, rows] of byItem) {
    let best = null;
    for (const buy of rows) {
      if (!fresh(buy.sellMin, buy.sellMinDate)) continue;
      for (const sell of rows) {
        if (sell.city === buy.city || !fresh(sell.sellMin, sell.sellMinDate)) continue;
        const net = (sell.sellMin - 1) * (1 - feeRate) - buy.sellMin;
        if (net <= 0) continue;
        const roi = net / buy.sellMin;
        if (!best || roi > best.roi) best = { itemId, buyCity: buy.city, sellCity: sell.city, buyPrice: buy.sellMin, sellPrice: sell.sellMin, net, roi };
      }
    }
    if (best && best.roi >= 0.08) routes.push(best);
  }
  routes.sort((a, b) => b.roi - a.roi);
  const top = routes.slice(0, 12);
  if (!top.length) return [];

  // Volume caps for the sell cities of top routes
  const bySellCity = new Map();
  for (const r of top) {
    if (!bySellCity.has(r.sellCity)) bySellCity.set(r.sellCity, []);
    bySellCity.get(r.sellCity).push(r.itemId);
  }
  const volume = new Map(); // itemId|city -> { unitsPerDay, avgPrice }
  for (const [city, ids] of bySellCity) {
    try {
      const hist = await getHistoryMulti(ids, { location: city, timeScale: 24, quality: 1 });
      for (const s of hist) {
        const recent = s.data.slice(-7);
        if (!recent.length) continue;
        const days = Math.max(1, Math.min(7, recent.length));
        const units = recent.reduce((a, p) => a + p.itemCount, 0);
        const avg = units ? recent.reduce((a, p) => a + p.avgPrice * p.itemCount, 0) / units : null;
        volume.set(s.itemId + '|' + city, { unitsPerDay: units / days, avgPrice: avg });
      }
    } catch (_) { /* no volume info -> conservative default below */ }
  }

  const out = [];
  for (const r of top) {
    const info = volume.get(r.itemId + '|' + r.sellCity);
    // Ghost-listing guard: a lone overpriced sell order is not a real exit price.
    // Cap the expected sell at 15% above the market's recent traded average.
    let sellPrice = r.sellPrice - 1;
    if (info?.avgPrice) sellPrice = Math.min(sellPrice, Math.round(info.avgPrice * 1.15));
    const net = sellPrice * (1 - feeRate) - r.buyPrice;
    if (net <= 0) continue;
    const roi = net / r.buyPrice;
    if (roi < 0.08) continue;

    const unitsPerDay = Math.max(20, Math.floor((info?.unitsPerDay ?? 150) * VOLUME_CAPTURE));
    const risky = r.sellCity === 'Caerleon' || r.buyCity === 'Caerleon';
    const minutes = risky ? RUN_MINUTES.caerleon : RUN_MINUTES.transport;
    // A run carries what the daily cap allows split over ~4 runs/day max per route
    const unitsPerRun = Math.max(10, Math.ceil(unitsPerDay / 4));
    out.push({
      kind: 'transport',
      title: `Transporte: ${itemName(r.itemId)} — ${r.buyCity} → ${r.sellCity}${risky ? ' ⚠️' : ''}`,
      profitPerCycle: net * unitsPerRun,
      capitalPerCycle: r.buyPrice * unitsPerRun,
      minutesPerCycle: minutes,
      cyclesPerDay: 4,
      detail: {
        item: itemName(r.itemId), buyCity: r.buyCity, sellCity: r.sellCity,
        buyPrice: r.buyPrice, sellPrice, netUnit: net,
        roi, unitsPerRun, volPerDay: info?.unitsPerDay ? Math.round(info.unitsPerDay) : null, risky,
        cappedByAvg: info?.avgPrice ? sellPrice < r.sellPrice - 1 : false,
      },
    });
  }
  return out;
}

async function scanBlackMarket() {
  const ids = gearUniverse([4, 5, 6], [0, 1]);
  const prices = await getPrices(ids, [...CITIES, 'Black Market'], [1, 2, 3, 4, 5]);
  const feeRate = instantSellFees(state.premium);

  const byKey = new Map();
  for (const p of prices) {
    const k = p.itemId + '|' + p.quality;
    if (!byKey.has(k)) byKey.set(k, []);
    byKey.get(k).push(p);
  }

  const opps = [];
  for (const [, rows] of byKey) {
    const bm = rows.find(r => r.city === 'Black Market');
    if (!bm || !fresh(bm.buyMax, bm.buyMaxDate)) continue;
    let best = null;
    for (const r of rows) {
      if (r.city === 'Black Market' || !fresh(r.sellMin, r.sellMinDate)) continue;
      if (!best || r.sellMin < best.sellMin) best = r;
    }
    if (!best) continue;
    const net = bm.buyMax * (1 - feeRate) - best.sellMin;
    if (net > 3000) {
      opps.push({ itemId: bm.itemId, quality: bm.quality, buyCity: best.city, buyPrice: best.sellMin, bmPrice: bm.buyMax, net });
    }
  }
  opps.sort((a, b) => b.net - a.net);
  const basket = opps.slice(0, 10); // one Caerleon run carries a basket of items
  if (!basket.length) return [];

  const profit = basket.reduce((s, o) => s + o.net, 0);
  const capital = basket.reduce((s, o) => s + o.buyPrice, 0);
  return [{
    kind: 'blackmarket',
    title: `Mercado Negro: cesta de ${basket.length} items → Caerleon ⚠️`,
    profitPerCycle: profit,
    capitalPerCycle: capital,
    minutesPerCycle: RUN_MINUTES.caerleon + 15, // multi-city pickup
    cyclesPerDay: 3, // BM orders refill with PvE activity
    detail: { basket: basket.map(o => ({ item: itemName(o.itemId), quality: o.quality, buyCity: o.buyCity, buyPrice: o.buyPrice, bmPays: o.bmPrice, net: o.net })) },
  }];
}

async function scanRefining() {
  const out = [];
  const feeRate = sellOrderFees(state.premium);
  for (const res of Object.keys(RESOURCES)) {
    const city = REFINE_BONUS_CITY[res];
    const ids = new Set();
    for (let t = 2; t <= 8; t++) {
      const eMax = t >= 4 ? Math.min(maxEnch(res, 'raw'), maxEnch(res, 'refined')) : 0;
      for (let e = 0; e <= eMax; e++) { ids.add(rawId(res, t, e)); ids.add(refinedId(res, t, e)); }
    }
    let prices;
    try { prices = await getPrices([...ids], [city], [1]); } catch (_) { continue; }
    const get = (id) => prices.find(p => p.itemId === id && fresh(p.sellMin, p.sellMinDate));

    let best = null;
    const eMax = Math.min(maxEnch(res, 'raw'), maxEnch(res, 'refined'));
    for (let t = 4; t <= 8; t++) {
      for (let e = 0; e <= eMax; e++) {
        const inp = REFINE_INPUTS[t];
        const raw = get(rawId(res, t, e));
        const prev = get(refinedId(res, t - 1, t - 1 >= 4 ? e : 0));
        const outP = get(refinedId(res, t, e));
        if (!raw || !prev || !outP) continue;
        const inputCost = (inp.raw * raw.sellMin + inp.prev * prev.sellMin) * (1 - RRR.bonusCity) + stationFee(refinedItemValue(t, e), 100);
        const net = (outP.sellMin - 1) * (1 - feeRate) - inputCost;
        if (net <= 0) continue;
        const roi = net / inputCost;
        if (!best || roi > best.roi) best = { tier: t, ench: e, net, roi, inputCost, sellPrice: outP.sellMin, rawPrice: raw.sellMin, rawCount: inp.raw };
      }
    }
    if (!best) continue;

    // Volume cap from refined product's daily volume in the bonus city
    let volPerDay = null;
    try {
      const hist = await getHistoryMulti([refinedId(res, best.tier, best.ench)], { location: city, timeScale: 24, quality: 1 });
      if (hist[0] && hist[0].data.length) {
        volPerDay = hist[0].data.slice(-7).reduce((a, p) => a + p.itemCount, 0) / Math.max(1, Math.min(7, hist[0].data.length));
      }
    } catch (_) { /* default below */ }
    const unitsPerDay = Math.max(30, Math.floor((volPerDay ?? 300) * VOLUME_CAPTURE));
    const unitsPerBatch = Math.max(20, Math.ceil(unitsPerDay / 3));

    out.push({
      kind: 'refine',
      title: `Refinado: ${itemName(refinedId(res, best.tier, best.ench))} en ${city} ★`,
      profitPerCycle: best.net * unitsPerBatch,
      capitalPerCycle: best.inputCost * unitsPerBatch,
      minutesPerCycle: RUN_MINUTES.refine,
      cyclesPerDay: 3,
      detail: {
        resource: RESOURCES[res].rawEs, city, tier: best.tier, ench: best.ench,
        product: itemName(refinedId(res, best.tier, best.ench)),
        netUnit: best.net, roi: best.roi, unitsPerBatch, volPerDay: volPerDay ? Math.round(volPerDay) : null,
        rrr: RRR.bonusCity,
      },
    });
  }
  out.sort((a, b) => (b.profitPerCycle / b.capitalPerCycle) - (a.profitPerCycle / a.capitalPerCycle));
  return out.slice(0, 3);
}

// City flip: buy with a buy order and sell with a sell order in the SAME city — no
// travel, no red zone, near-AFK. Reuses the shared liquid prices. Low risk, ideal for
// a beginner with some capital and little time.
async function scanCityFlip(prices) {
  const feeRate = sellOrderFees(state.premium);
  const flips = [];
  for (const p of prices) {
    if (!fresh(p.sellMin, p.sellMinDate) || !fresh(p.buyMax, p.buyMaxDate)) continue;
    // To actually get filled you must outbid: buy at buyMax+1, undercut to sellMin-1.
    // Buy orders also pay the 2.5% setup fee; sell orders pay tax + setup (sellOrderFees).
    const buyCost = (p.buyMax + 1) * (1 + SETUP_FEE);
    const sell = p.sellMin - 1;
    const net = sell * (1 - feeRate) - buyCost;
    if (net <= 0) continue;
    const roi = net / buyCost;
    if (roi < 0.12) continue; // below this, market friction eats the flip
    flips.push({ itemId: p.itemId, city: p.city, buyCost, sell, net, roi });
  }
  if (!flips.length) return [];
  flips.sort((a, b) => b.roi - a.roi);
  const top = flips.slice(0, 12);

  // Liquidity + ghost-listing guard (needs rotation, else the order never fills)
  const byCity = new Map();
  for (const f of top) {
    if (!byCity.has(f.city)) byCity.set(f.city, []);
    byCity.get(f.city).push(f.itemId);
  }
  const vol = new Map();
  for (const [city, itemIds] of byCity) {
    try {
      const hist = await getHistoryMulti(itemIds, { location: city, timeScale: 24, quality: 1 });
      for (const s of hist) {
        const recent = s.data.slice(-7);
        if (!recent.length) continue;
        const days = Math.max(1, Math.min(7, recent.length));
        const units = recent.reduce((a, p) => a + p.itemCount, 0);
        const avg = units ? recent.reduce((a, p) => a + p.avgPrice * p.itemCount, 0) / units : null;
        vol.set(s.itemId + '|' + city, { unitsPerDay: units / days, avgPrice: avg });
      }
    } catch (_) { /* no volume -> skipped below */ }
  }

  const out = [];
  for (const f of top) {
    const info = vol.get(f.itemId + '|' + f.city);
    if (!info || info.unitsPerDay < 50) continue; // order flipping needs real rotation
    let sell = f.sell;
    if (info.avgPrice) sell = Math.min(sell, Math.round(info.avgPrice * 1.15)); // no ghost sell
    const net = sell * (1 - feeRate) - f.buyCost;
    if (net <= 0) continue;
    const roi = net / f.buyCost;
    if (roi < 0.12) continue;
    const unitsPerRound = Math.max(10, Math.floor((info.unitsPerDay * VOLUME_CAPTURE) / 2));
    out.push({
      kind: 'cityflip',
      title: `Flipeo en ${f.city}: ${itemName(f.itemId)} (sin viajar)`,
      profitPerCycle: net * unitsPerRound,
      capitalPerCycle: f.buyCost * unitsPerRound,
      minutesPerCycle: 10,       // place/collect orders; the rest is waiting
      cyclesPerDay: 2,           // check ~twice a day
      detail: { item: itemName(f.itemId), city: f.city, buy: Math.round(f.buyCost), sell, netUnit: Math.round(net), roi, unitsPerRound, volPerDay: Math.round(info.unitsPerDay) },
    });
  }
  return out;
}

// Crafting -> Black Market basket, using the real game recipes (same math as the
// craft view via the shared craftProfit helper). Requires a Caerleon (red-zone) trip.
async function scanCraft() {
  let n = 0;
  try { n = await loadRecipes(); } catch (_) { return []; }
  if (!n) return [];
  const candidates = gearUniverse([4, 5, 6], [0, 1]).filter(id => recipeMap.has(id));
  if (!candidates.length) return [];
  const matSet = new Set();
  for (const id of candidates) for (const r of getRecipe(id).resources) matSet.add(r.id);

  let matPrices, bmPrices;
  try {
    [matPrices, bmPrices] = await Promise.all([
      getPrices([...matSet], CITIES, [1]),
      getPrices(candidates, ['Black Market'], null),
    ]);
  } catch (_) { return []; }

  const matBest = new Map();
  for (const p of matPrices) {
    if (!fresh(p.sellMin, p.sellMinDate)) continue;
    const cur = matBest.get(p.itemId);
    if (!cur || p.sellMin < cur.sellMin) matBest.set(p.itemId, p);
  }

  const rows = [];
  for (const id of candidates) {
    const recipe = getRecipe(id);
    const bm = bmPrices.find(p => p.itemId === id && p.quality === 1 && fresh(p.buyMax, p.buyMaxDate));
    if (!bm) continue;
    const pr = craftProfit(recipe, matBest, { rrr: CRAFT_RRR.bonusCity, feePer100: 100, premium: state.premium, bmBuyMax: bm.buyMax, bmTaxed: true });
    if (!pr || pr.net <= 0) continue;
    rows.push({ id, cost: pr.cost, bmPays: bm.buyMax, net: pr.net });
  }
  if (!rows.length) return [];
  rows.sort((a, b) => b.net - a.net);
  const basket = rows.slice(0, 10);
  return [{
    kind: 'craft',
    title: `Crafteo: cesta de ${basket.length} items → Mercado Negro ⚠️`,
    profitPerCycle: basket.reduce((s, o) => s + o.net, 0),
    capitalPerCycle: basket.reduce((s, o) => s + o.cost, 0),
    minutesPerCycle: RUN_MINUTES.caerleon,
    cyclesPerDay: 3,
    detail: { risky: true, basket: basket.map(o => ({ item: itemName(o.id), cost: Math.round(o.cost), bmPays: o.bmPays, net: Math.round(o.net) })) },
  }];
}

// Gathering: which raw resource yields the most silver PER UNIT right now and where to
// sell it. The no-capital starter method. We can't estimate silver/hour (the API has no
// gather rate — it depends on your skill, mount and node competition), so this is a
// qualitative pick returned SEPARATELY (it doesn't fit the time-based plan pipeline).
async function scanGathering() {
  const ids = [];
  for (const res of Object.keys(RESOURCES)) {
    for (let t = 2; t <= 6; t++) ids.push(rawId(res, t, 0)); // beginner tiers, unenchanted
  }
  let prices;
  try { prices = await getPrices(ids, CITIES, [1]); } catch (_) { return []; }
  const instFee = instantSellFees(state.premium);
  const ordFee = sellOrderFees(state.premium);

  const byItem = new Map();
  for (const p of prices) {
    if (!byItem.has(p.itemId)) byItem.set(p.itemId, []);
    byItem.get(p.itemId).push(p);
  }
  const out = [];
  for (const [itemId, rows] of byItem) {
    let best = null;
    for (const r of rows) {
      if (fresh(r.buyMax, r.buyMaxDate)) {
        const net = r.buyMax * (1 - instFee);
        if (!best || net > best.net) best = { itemId, name: itemName(itemId), city: r.city, net, how: 'instant', price: r.buyMax };
      }
      if (fresh(r.sellMin, r.sellMinDate)) {
        const net = (r.sellMin - 1) * (1 - ordFee);
        if (!best || net > best.net) best = { itemId, name: itemName(itemId), city: r.city, net, how: 'order', price: r.sellMin };
      }
    }
    if (best && best.net > 0) out.push(best);
  }
  out.sort((a, b) => b.net - a.net);
  return out.slice(0, 6);
}

// Beginner-friendliness score (higher = easier/safer). Lets the view rank a novice's
// plan by ease + safety + capital fit instead of raw speed.
export function beginnerScore(p) {
  let s = 0;
  if (p.kind === 'cityflip') s += 3;                    // no travel, no red zone
  else if (p.kind === 'refine') s += 3;                 // in-city with bonus, no PvP
  else if (p.kind === 'transport') s += p.detail?.risky ? 1 : 2;
  else s += 0;                                          // blackmarket / craft = Caerleon (red)
  if (!p.capitalShort) s += 1;                          // one full batch fits their capital
  return s;
}

// ---------- Plan assembly ----------

/**
 * Build ranked plans for a silver target with the capital the user can invest.
 * Each plan: strategy scaled by capital, honest time estimate to hit target.
 */
export async function buildPlans(targetSilver, capital, onProgress = () => {}) {
  onProgress('Escaneando transporte y flipeo en ciudad…');
  // Transport and city-flip share ONE liquid-universe price fetch (the API rate limit
  // of 100/min is the real bottleneck — don't fetch the same prices twice).
  const liquidPrices = await getPrices(liquidUniverse(), CITIES, [1]).catch(() => []);
  const transport = await scanTransport(liquidPrices).catch(() => []);
  const cityflip = await scanCityFlip(liquidPrices).catch(() => []);
  onProgress('Escaneando Mercado Negro…');
  const bm = await scanBlackMarket().catch(() => []);
  onProgress('Escaneando refinado en ciudades con bono…');
  const refine = await scanRefining().catch(() => []);
  onProgress('Escaneando crafteo → Mercado Negro…');
  const craft = await scanCraft().catch(() => []);
  onProgress('Buscando el mejor recurso para recolectar…');
  const gathering = await scanGathering().catch(() => []);

  const all = [...transport, ...cityflip, ...bm, ...refine, ...craft];
  const plans = [];

  for (const opp of all) {
    // Scale cycles to the user's capital: how many parallel "units" of this
    // opportunity can they fund? (capital compounds after each cycle, we keep it simple/flat)
    const scale = Math.min(3, Math.max(0.2, capital / Math.max(1, opp.capitalPerCycle)));
    const effProfit = opp.profitPerCycle * Math.min(1, scale);
    const effCapital = Math.min(capital, opp.capitalPerCycle);
    if (effProfit < 1000) continue;

    const cycles = Math.ceil(targetSilver / effProfit);
    const days = cycles / opp.cyclesPerDay;
    const activeHours = (cycles * opp.minutesPerCycle) / 60;
    const capitalShort = opp.capitalPerCycle > capital;

    plans.push({
      ...opp,
      effProfit: Math.round(effProfit),
      effCapital: Math.round(effCapital),
      cycles,
      days: Math.max(days, activeHours / 8), // can't play more than ~8h/day
      activeHours,
      silverPerActiveHour: Math.round(effProfit / (opp.minutesPerCycle / 60)),
      capitalShort,
      beginner: beginnerScore({ ...opp, capitalShort }),
    });
  }

  plans.sort((a, b) => a.days - b.days);
  return {
    plans: plans.slice(0, 6),
    gathering,                              // qualitative, no-capital method (rendered apart)
    scanned: { transport: transport.length, cityflip: cityflip.length, bm: bm.length, refine: refine.length, craft: craft.length },
  };
}

// ---------- Template narration (fallback when no AI is available) ----------

export function templateNarration(plan, targetSilver) {
  const d = plan.detail;
  const L = [];
  L.push(`**Objetivo: ${Math.round(targetSilver / 1e6 * 10) / 10}M de plata — ${plan.title}**`);
  L.push('');
  if (plan.kind === 'transport') {
    L.push(`1. Ve a **${d.buyCity}** y compra ~${d.unitsPerRun} × ${d.item} a ~${d.buyPrice.toLocaleString('es')} c/u (usa órdenes de compra si no tienes prisa: ahorras otro ~2%).`);
    L.push(`2. Transporta a **${d.sellCity}**${d.risky ? ' — ⚠️ ruta con zona roja: ve ligero y evita horas punta' : ' por zonas seguras'}.`);
    L.push(`3. Lista con orden de venta a ~${d.sellPrice.toLocaleString('es')}${d.cappedByAvg ? ' (precio realista según la media reciente del mercado, no el listing más caro)' : ' (1 de plata bajo el mínimo actual)'}.`);
    L.push(`4. Beneficio esperado: ~${plan.effProfit.toLocaleString('es')} por viaje (${(d.roi * 100).toFixed(0)}% ROI). Repite ${plan.cycles} viajes.`);
    if (d.volPerDay) L.push(`   Volumen real del mercado destino: ~${d.volPerDay.toLocaleString('es')} uds/día — el plan asume capturar solo el 20%.`);
  } else if (plan.kind === 'blackmarket') {
    L.push(`1. Compra esta cesta en sus ciudades (total ~${plan.effCapital.toLocaleString('es')}):`);
    for (const b of d.basket.slice(0, 6)) L.push(`   • ${b.item} (q${b.quality}) en ${b.buyCity} a ${b.buyPrice.toLocaleString('es')} → el MN paga ${b.bmPays.toLocaleString('es')} (+${b.net.toLocaleString('es')})`);
    L.push(`2. Lleva todo a **Caerleon** ⚠️ (zona roja: montura rápida, nada de sobrecarga).`);
    L.push(`3. Vende al instante a las órdenes del Mercado Negro.`);
    L.push(`4. Beneficio ~${plan.effProfit.toLocaleString('es')} por viaje. Las órdenes se recargan con la actividad PvE: ~${plan.cyclesPerDay} viajes/día.`);
  } else if (plan.kind === 'refine') {
    L.push(`1. En **${d.city}** (bono de ${d.resource.toLowerCase()}), compra materia prima para ~${d.unitsPerBatch} uds de ${d.product}.`);
    L.push(`2. Refina con el bono de ciudad (retorno ${(d.rrr * 100).toFixed(1)}%; con foco sería aún mejor).`);
    L.push(`3. Lista el producto con orden de venta en la misma ciudad.`);
    L.push(`4. Beneficio ~${plan.effProfit.toLocaleString('es')} por tanda (~${d.netUnit.toLocaleString('es')}/ud). Repite ${plan.cycles} tandas (~${plan.cyclesPerDay}/día).`);
  } else if (plan.kind === 'cityflip') {
    L.push(`1. En **${d.city}** poné una **orden de compra** de ${d.item} a ${d.buy.toLocaleString('es')} (1 más que la mejor compra actual, para ponerte primero en la cola).`);
    L.push(`2. Cuando se te llene, poné una **orden de venta** a ${d.sell.toLocaleString('es')} (1 menos que la venta más barata).`);
    L.push(`3. No viajás ni cruzás zona roja: revisá tus órdenes ~2 veces al día. Es casi AFK.`);
    L.push(`4. Ganás ~${d.netUnit.toLocaleString('es')}/ud (${(d.roi * 100).toFixed(0)}% ROI). El mercado mueve ~${d.volPerDay.toLocaleString('es')} uds/día, así que tus órdenes rotan.`);
  } else if (plan.kind === 'craft') {
    L.push(`1. Craftea esta cesta donde tengas especialización (mirá la vista "Crafteo" para los bonos por ciudad) — coste total ~${plan.effCapital.toLocaleString('es')}:`);
    for (const b of d.basket.slice(0, 6)) L.push(`   • ${b.item}: cuesta ~${b.cost.toLocaleString('es')} → el MN paga ${b.bmPays.toLocaleString('es')} (+${b.net.toLocaleString('es')})`);
    L.push(`2. Llevá lo crafteado a **Caerleon** ⚠️ (zona roja: montura rápida, sin sobrecarga) y vendé al Mercado Negro.`);
    L.push(`3. Beneficio ~${plan.effProfit.toLocaleString('es')} por tanda. El crafteo sale calidad Normal ~69% de las veces; las calidades altas rinden algo más.`);
  }

  // Beginner-proof footer: what you need, how much you can lose, and a liquidity/tip line.
  L.push('');
  const risky = plan.detail?.risky || plan.kind === 'blackmarket';
  const needs = {
    transport: 'una montura de carga (buey o caballo de carga) para el lote.',
    blackmarket: 'montura de carga y una montura rápida para escapar en Caerleon.',
    craft: 'nivel de crafteo en esa línea y montura de carga; craftea donde tengas especialización de ciudad.',
    refine: 'nada especial. Si tenés foco, el retorno de recursos sube bastante y el margen mejora.',
    cityflip: 'algo de capital y paciencia (las órdenes tardan en llenarse). No hace falta montura ni viajar.',
  }[plan.kind];
  if (needs) L.push(`**Necesitás:** ${needs}`);
  L.push(`**Riesgo:** ${risky
    ? 'zona roja — podés morir y perder TODA la carga. No lleves más del ~10% de tu banco por viaje.'
    : 'bajo — como mucho perdés algo si el precio se mueve; no arriesgás al personaje.'}`);
  if (['transport', 'blackmarket', 'craft', 'refine'].includes(plan.kind)) {
    L.push('**Consejo:** comprá con **orden de compra** (no a precio instantáneo) si no tenés prisa: ahorrás ~2-4%.');
  }
  if (plan.detail?.volPerDay) {
    L.push(`**Liquidez:** el mercado mueve ~${plan.detail.volPerDay.toLocaleString('es')} uds/día — si es bajo, tu venta puede tardar; no te sobreexpongas.`);
  }
  if (plan.detail?.netUnit) L.push(`**Neto por unidad tras impuesto:** ~${plan.detail.netUnit.toLocaleString('es')} de plata.`);
  L.push(`**Si no se vende en ~24h:** bajá el precio un poco o llevalo a otra ciudad — no lo dejes clavado.`);

  L.push('');
  L.push(`⏱️ **Tiempo estimado: ${plan.days < 1 ? Math.ceil(plan.days * 24) + ' horas' : plan.days.toFixed(1) + ' días'}** (${Math.ceil(plan.activeHours)} h activas) · 💰 Inversión: ${plan.effCapital.toLocaleString('es')}${plan.capitalShort ? ' — ⚠️ con más capital irías más rápido' : ''}`);
  return L.join('\n');
}
