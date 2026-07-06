// Crafting profit calculator: real recipes from the game dump.
// Mode 1: analyze one item (materials, cost with RRR, profit per city + Black Market).
// Mode 2: scan gear lines for craft -> Black Market profit.
import { getPrices } from '../api.js';
import {
  CITIES, CRAFT_RRR, CRAFT_BONUS, sellOrderFees, instantSellFees, stationFee,
} from '../constants.js';
import { loadRecipes, getRecipe, recipeMap } from '../recipes.js';
import { gearUniverse } from '../gear.js';
import { attachItemSearch, itemName, iconUrl } from '../items.js';
import { state, fmt, fmtPct, dataAge, ageBadge, escapeHtml } from '../state.js';

const RRR_OPTIONS = [
  { v: CRAFT_RRR.base, label: `Ciudad sin bono — ${(CRAFT_RRR.base * 100).toFixed(1)}%` },
  { v: CRAFT_RRR.bonusCity, label: `Ciudad con bono — ${(CRAFT_RRR.bonusCity * 100).toFixed(1)}%` },
  { v: CRAFT_RRR.baseFocus, label: `Sin bono + foco — ${(CRAFT_RRR.baseFocus * 100).toFixed(1)}%` },
  { v: CRAFT_RRR.bonusCityFocus, label: `Con bono + foco — ${(CRAFT_RRR.bonusCityFocus * 100).toFixed(1)}%` },
];

export function renderCraft(container) {
  container.innerHTML = `
    <h1 class="view-title">🔨 Crafteo</h1>
    <p class="view-desc">Calcula el beneficio de craftear con las recetas reales del juego (volcado oficial de datos).
      Craftea en la ciudad con bono de tu línea para el 24,8% de retorno (47,9% con foco).</p>

    <div class="card">
      <h3>Bonos de crafteo por ciudad</h3>
      <div class="table-wrap"><table class="data"><tbody>
        ${Object.entries(CRAFT_BONUS).map(([c, lines]) => `<tr><td class="txt" style="font-weight:600">${c}</td><td class="txt">${lines}</td></tr>`).join('')}
      </tbody></table></div>
    </div>

    <div class="controls">
      <div class="ctrl">
        <label>Item a craftear</label>
        <div class="item-search"><input type="text" id="crf-item" placeholder="Busca un item (ej: espada ancha, arco…)" /></div>
      </div>
      <div class="ctrl">
        <label>Retorno de recursos</label>
        <select id="crf-rrr">${RRR_OPTIONS.map((o, i) => `<option value="${o.v}" ${i === 1 ? 'selected' : ''}>${o.label}</option>`).join('')}</select>
      </div>
      <div class="ctrl">
        <label>Tarifa estación /100 nutr.</label>
        <input type="number" id="crf-fee" value="100" min="0" max="1000" style="width:90px" />
      </div>
      <label class="ctrl set-check" style="flex-direction:row;align-items:center">
        <input type="checkbox" id="crf-bmtax" checked />
        <span style="font-size:12px">Impuesto al vender en MN</span>
      </label>
      <button class="btn secondary" id="crf-scan">🌑 Escanear crafteo → Mercado Negro</button>
    </div>

    <div id="crf-results"><p class="hint" id="crf-status">Cargando recetas del juego… (la primera vez descarga el volcado oficial, ~17 MB; después queda cacheado)</p></div>
  `;

  const status = container.querySelector('#crf-status');
  const input = container.querySelector('#crf-item');
  let picked = null;

  loadRecipes().then(n => {
    status.textContent = `${n.toLocaleString('es')} recetas cargadas. Busca un item o lanza el escáner del Mercado Negro.`;
  }).catch(e => {
    status.textContent = 'Error cargando recetas: ' + e.message;
    status.className = 'error-box';
  });

  attachItemSearch(input, (entry) => {
    picked = entry;
    analyzeItem(container, entry.id);
  });

  container.querySelector('#crf-rrr').addEventListener('change', () => picked && analyzeItem(container, picked.id));
  container.querySelector('#crf-fee').addEventListener('change', () => picked && analyzeItem(container, picked.id));
  container.querySelector('#crf-scan').addEventListener('click', () => scanBlackMarket(container));
}

function readParams(container) {
  return {
    rrr: Number(container.querySelector('#crf-rrr').value),
    feePer100: Number(container.querySelector('#crf-fee').value) || 0,
    bmTaxed: container.querySelector('#crf-bmtax').checked,
  };
}

async function analyzeItem(container, itemId) {
  const results = container.querySelector('#crf-results');
  const { rrr, feePer100, bmTaxed } = readParams(container);

  await loadRecipes();
  const recipe = getRecipe(itemId);
  if (!recipe) {
    results.innerHTML = `<div class="card"><p>Ese item no tiene receta de crafteo (¿es un recurso base, drop o item de facción?).</p></div>`;
    return;
  }

  results.innerHTML = `<div class="loading"><span class="spinner"></span>Consultando precios de materiales y producto…</div>`;

  try {
    const matIds = recipe.resources.map(r => r.id);
    const prices = await getPrices([...matIds, itemId], [...CITIES, 'Black Market'], null);

    // Cheapest fresh price per material across cities
    const matRows = recipe.resources.map(r => {
      const rows = prices.filter(p => p.itemId === r.id && p.quality === 1 && p.sellMin && p.city !== 'Black Market');
      const best = rows.length ? rows.reduce((a, b) => (a.sellMin <= b.sellMin ? a : b)) : null;
      return { ...r, best };
    });

    const missing = matRows.filter(m => !m.best);
    // RRR only returns raw/refined resources; artifact components are consumed 100%
    const isArtifact = (id) => id.includes('ARTEFACT');
    const returnableCost = matRows.reduce((s, m) => s + (m.best && !isArtifact(m.id) ? m.best.sellMin * m.count : 0), 0);
    const artifactCost = matRows.reduce((s, m) => s + (m.best && isArtifact(m.id) ? m.best.sellMin * m.count : 0), 0);
    const matCost = returnableCost + artifactCost;
    const craftFee = stationFee(recipe.itemValue, feePer100);
    // Some recipes yield several units per craft (potions x5, food) — cost is per UNIT
    const costPerCraft = (returnableCost * (1 - rrr) + artifactCost + craftFee) / (recipe.outCount || 1);

    // Sale options: each city sell order (quality 1) + BM buy order
    const sellRows = CITIES.map(city => {
      const r = prices.find(p => p.itemId === itemId && p.city === city && p.quality === 1 && p.sellMin);
      if (!r) return null;
      const net = (r.sellMin - 1) * (1 - sellOrderFees(state.premium)) - costPerCraft;
      return { where: city + ' (orden de venta)', gross: r.sellMin, net, date: r.sellMinDate };
    }).filter(Boolean);

    const bmRows = prices.filter(p => p.itemId === itemId && p.city === 'Black Market' && p.buyMax);
    for (const bm of bmRows) {
      const fee = bmTaxed ? instantSellFees(state.premium) : 0;
      const net = bm.buyMax * (1 - fee) - costPerCraft;
      sellRows.push({ where: `Mercado Negro (calidad ${bm.quality})`, gross: bm.buyMax, net, date: bm.buyMaxDate });
    }
    sellRows.sort((a, b) => b.net - a.net);

    results.innerHTML = `
      <div class="card">
        <h3><span class="item-cell"><img src="${iconUrl(itemId, 1, 32)}" alt=""/>${escapeHtml(itemName(itemId))}</span></h3>
        <div class="table-wrap">
          <table class="data">
            <thead><tr><th>Material</th><th>Cantidad</th><th>Mejor precio</th><th>Ciudad</th><th>Subtotal</th><th>Datos</th></tr></thead>
            <tbody>
              ${matRows.map(m => `<tr>
                <td class="txt"><span class="item-cell"><img src="${iconUrl(m.id, 1, 32)}" loading="lazy" alt=""/>${escapeHtml(itemName(m.id))}</span></td>
                <td>${m.count}</td>
                <td>${m.best ? fmt(m.best.sellMin) : '<span class="neg">sin datos</span>'}</td>
                <td class="txt">${m.best ? m.best.city : '—'}</td>
                <td>${m.best ? fmt(m.best.sellMin * m.count) : '—'}</td>
                <td>${m.best ? ageBadge(dataAge(m.best.sellMinDate)) : '—'}</td>
              </tr>`).join('')}
            </tbody>
          </table>
        </div>
        ${missing.length ? `<div class="error-box">Faltan precios de ${missing.length} material(es): el coste real será mayor que el mostrado.</div>` : ''}
        <div class="cards-row" style="margin-top:14px">
          <div class="stat-card"><div class="stat-label">Materiales</div><div class="stat-value">${fmt(matCost)}</div></div>
          <div class="stat-card"><div class="stat-label">Con retorno ${fmtPct(rrr, 1)}</div><div class="stat-value">${fmt(returnableCost * (1 - rrr) + artifactCost)}</div>${artifactCost ? `<div class="stat-sub">artefacto sin retorno: ${fmt(artifactCost)}</div>` : ''}</div>
          <div class="stat-card"><div class="stat-label">Tarifa estación</div><div class="stat-value">${fmt(craftFee)}</div><div class="stat-sub">valor item ${recipe.itemValue} · ${recipe.focus ? recipe.focus + ' foco' : ''}</div></div>
          <div class="stat-card"><div class="stat-label">Coste por unidad</div><div class="stat-value gold">${fmt(costPerCraft)}</div>${(recipe.outCount || 1) > 1 ? `<div class="stat-sub">la receta produce ${recipe.outCount} uds/craft</div>` : ''}</div>
        </div>
      </div>

      <div class="card">
        <h3>¿Dónde vender?</h3>
        ${missing.length ? `<div class="error-box">Beneficio no calculable: faltan precios de ${missing.length} material(es). Los números de abajo usan un coste incompleto — trátalos como techo optimista.</div>` : ''}
        <div class="table-wrap">
          <table class="data">
            <thead><tr><th>Destino</th><th>Precio bruto</th><th>Beneficio neto</th><th>ROI</th><th>Datos</th></tr></thead>
            <tbody>
              ${sellRows.length ? sellRows.map(s => `<tr>
                <td class="txt">${s.where}</td>
                <td>${fmt(s.gross)}</td>
                <td class="${missing.length ? '' : s.net > 0 ? 'pos' : 'neg'}">${missing.length ? '≤ ' : ''}${fmt(s.net)}</td>
                <td class="${missing.length ? '' : s.net > 0 ? 'pos' : 'neg'}">${costPerCraft > 0 && !missing.length ? fmtPct(s.net / costPerCraft, 0) : '—'}</td>
                <td>${ageBadge(dataAge(s.date))}</td>
              </tr>`).join('') : '<tr><td class="txt" colspan="5">Sin precios de venta disponibles ahora mismo.</td></tr>'}
            </tbody>
          </table>
        </div>
        <p class="hint">El crafteo sale en calidad Normal ~69% de las veces; calidades superiores (~31%) pueden rellenar
          órdenes del MN de más valor — el beneficio real suele ser algo mejor que el mostrado.
          Si crafteas encantado (.1+), busca el item con su encantamiento (ej: "@1" en el ID).</p>
      </div>`;
  } catch (e) {
    results.innerHTML = `<div class="error-box">Error: ${escapeHtml(e.message)}</div>`;
  }
}

async function scanBlackMarket(container) {
  const results = container.querySelector('#crf-results');
  const { rrr, feePer100, bmTaxed } = readParams(container);
  const btn = container.querySelector('#crf-scan');
  btn.disabled = true;

  results.innerHTML = `<div class="loading"><span class="spinner"></span>Cargando recetas…</div>`;

  try {
    await loadRecipes();
    const candidates = gearUniverse([4, 5, 6], [0, 1]).filter(id => recipeMap.has(id));

    // All materials needed by all candidate recipes
    const matSet = new Set();
    for (const id of candidates) {
      for (const r of getRecipe(id).resources) matSet.add(r.id);
    }

    results.innerHTML = `<div class="loading"><span class="spinner"></span>Precios de ${matSet.size} materiales y ${candidates.length} productos…</div>`;

    const [matPrices, bmPrices] = await Promise.all([
      getPrices([...matSet], CITIES, [1]),
      getPrices(candidates, ['Black Market'], null),
    ]);

    // Cheapest fresh material price across cities
    const matBest = new Map();
    for (const p of matPrices) {
      if (!p.sellMin) continue;
      if ((dataAge(p.sellMinDate) ?? Infinity) > 24 * 60) continue;
      const cur = matBest.get(p.itemId);
      if (!cur || p.sellMin < cur.sellMin) matBest.set(p.itemId, p);
    }

    const rows = [];
    for (const id of candidates) {
      const recipe = getRecipe(id);
      let returnable = 0;
      let artifact = 0;
      let ok = true;
      for (const r of recipe.resources) {
        const m = matBest.get(r.id);
        if (!m) { ok = false; break; }
        if (r.id.includes('ARTEFACT')) artifact += m.sellMin * r.count;
        else returnable += m.sellMin * r.count;
      }
      if (!ok) continue;

      const cost = (returnable * (1 - rrr) + artifact + stationFee(recipe.itemValue, feePer100)) / (recipe.outCount || 1);
      // Best BM order across qualities (crafted normal can only fill q1 orders,
      // but quality rolls let ~31% fill higher ones — show q1 as the safe basis)
      const bm = bmPrices.find(p => p.itemId === id && p.quality === 1 && p.buyMax);
      if (!bm) continue;
      if ((dataAge(bm.buyMaxDate) ?? Infinity) > 24 * 60) continue;

      const fee = bmTaxed ? instantSellFees(state.premium) : 0;
      const net = bm.buyMax * (1 - fee) - cost;
      if (net <= 0) continue;
      rows.push({ id, cost, bmPrice: bm.buyMax, net, roi: net / cost, age: dataAge(bm.buyMaxDate) });
    }

    rows.sort((a, b) => b.roi - a.roi);

    if (!rows.length) {
      results.innerHTML = `<div class="card"><p>Ningún crafteo rentable hacia el Mercado Negro ahora mismo (con retorno ${fmtPct(rrr, 1)}).
        Prueba con foco (retorno más alto) o vuelve en horas de más actividad PvE, cuando el MN sube sus órdenes.</p></div>`;
      btn.disabled = false;
      return;
    }

    results.innerHTML = `
      <div class="card">
        <h3>${rows.length} crafteos rentables → Mercado Negro (retorno ${fmtPct(rrr, 1)})</h3>
        <div class="table-wrap">
          <table class="data">
            <thead><tr><th>Item</th><th>Coste craft</th><th>MN paga (q1)</th><th>Beneficio</th><th>ROI</th><th>Datos</th></tr></thead>
            <tbody>
              ${rows.slice(0, 60).map(r => `<tr>
                <td class="txt"><span class="item-cell"><img src="${iconUrl(r.id, 1, 32)}" loading="lazy" alt=""/>${escapeHtml(itemName(r.id))}</span></td>
                <td>${fmt(r.cost)}</td>
                <td class="gold">${fmt(r.bmPrice)}</td>
                <td class="pos">${fmt(r.net)}</td>
                <td class="pos">${fmtPct(r.roi, 0)}</td>
                <td>${ageBadge(r.age)}</td>
              </tr>`).join('')}
            </tbody>
          </table>
        </div>
        <p class="hint">Materiales al precio más barato entre ciudades (datos ≤24h). Haz clic en un item del buscador para ver su desglose.
          Recuerda: hay que craftear donde tengas especialización y llevar el producto a Caerleon.</p>
      </div>`;
  } catch (e) {
    results.innerHTML = `<div class="error-box">Error: ${escapeHtml(e.message)}</div>`;
  }
  btn.disabled = false;
}
