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
import { CITIES, sellOrderFees, instantSellFees, RRR, REFINE_BONUS_CITY, RESOURCES, REFINE_INPUTS, rawId, refinedId, stationFee, refinedItemValue, maxEnch } from './constants.js';
import { gearUniverse, liquidUniverse } from './gear.js';
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

async function scanTransport() {
  const universe = liquidUniverse();
  const prices = await getPrices(universe, CITIES, [1]);
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

// ---------- Plan assembly ----------

/**
 * Build ranked plans for a silver target with the capital the user can invest.
 * Each plan: strategy scaled by capital, honest time estimate to hit target.
 */
export async function buildPlans(targetSilver, capital, onProgress = () => {}) {
  onProgress('Escaneando rutas de transporte…');
  const transport = await scanTransport().catch(() => []);
  onProgress('Escaneando Mercado Negro…');
  const bm = await scanBlackMarket().catch(() => []);
  onProgress('Escaneando refinado en ciudades con bono…');
  const refine = await scanRefining().catch(() => []);

  const all = [...transport, ...bm, ...refine];
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

    plans.push({
      ...opp,
      effProfit: Math.round(effProfit),
      effCapital: Math.round(effCapital),
      cycles,
      days: Math.max(days, activeHours / 8), // can't play more than ~8h/day
      activeHours,
      silverPerActiveHour: Math.round(effProfit / (opp.minutesPerCycle / 60)),
      capitalShort: opp.capitalPerCycle > capital,
    });
  }

  plans.sort((a, b) => a.days - b.days);
  return { plans: plans.slice(0, 5), scanned: { transport: transport.length, bm: bm.length, refine: refine.length } };
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
  }
  L.push('');
  L.push(`⏱️ **Tiempo estimado: ${plan.days < 1 ? Math.ceil(plan.days * 24) + ' horas' : plan.days.toFixed(1) + ' días'}** (${Math.ceil(plan.activeHours)} h activas) · 💰 Inversión: ${plan.effCapital.toLocaleString('es')}${plan.capitalShort ? ' — ⚠️ con más capital irías más rápido' : ''}`);
  return L.join('\n');
}
