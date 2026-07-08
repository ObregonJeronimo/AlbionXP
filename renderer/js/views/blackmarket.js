// Black Market flipper: buy gear cheap in royal cities / Brecilien,
// haul to Caerleon, instant-sell to Black Market buy orders.
import { getPrices } from '../api.js';
import { CITIES, instantSellFees } from '../constants.js';
import { gearUniverse } from '../gear.js';
import { itemName, iconUrl } from '../items.js';
import { state, fmt, fmtPct, dataAge, ageBadge, escapeHtml } from '../state.js';

export function renderBlackMarket(container) {
  container.innerHTML = `
    <h1 class="view-title">🌑 Mercado Negro</h1>
    <p class="view-desc">El Mercado Negro de Caerleon compra equipo con órdenes de compra NPC (alimenta el loot de los mobs).
      Estrategia: comprar equipo barato en ciudades reales, llevarlo a Caerleon y vendérselo al instante.
      El beneficio ya descuenta el impuesto de venta (${fmtPct(instantSellFees(state.premium), 1)}).</p>

    <div class="controls">
      <div class="ctrl">
        <label>Tiers</label>
        <select id="bm-tiers">
          <option value="4,5">T4–T5</option>
          <option value="4,5,6" selected>T4–T6</option>
          <option value="6,7,8">T6–T8</option>
        </select>
      </div>
      <div class="ctrl">
        <label>Encantamientos</label>
        <select id="bm-ench">
          <option value="0">Solo planos</option>
          <option value="0,1" selected>Planos y .1</option>
          <option value="0,1,2">Hasta .2</option>
        </select>
      </div>
      <div class="ctrl">
        <label>Beneficio mínimo/unidad</label>
        <input type="number" id="bm-minprofit" value="5000" min="0" style="width:100px" />
      </div>
      <div class="ctrl">
        <label>Antigüedad máx. datos</label>
        <select id="bm-age">
          <option value="30">30 minutos</option>
          <option value="60">1 hora</option>
          <option value="360">6 horas</option>
          <option value="1440">24 horas</option>
        </select>
      </div>
      <label class="ctrl set-check" style="flex-direction:row;align-items:center" title="Las fuentes no se ponen de acuerdo en si el MN cobra impuesto de venta; déjalo activado para ser conservador">
        <input type="checkbox" id="bm-tax" checked />
        <span style="font-size:12px">Aplicar impuesto de venta</span>
      </label>
      <button class="btn" id="bm-go">Escanear</button>
    </div>

    <div id="bm-results"><p class="hint">Compara el precio de compra en las 7 ciudades contra las órdenes de compra del Mercado Negro para ~40 líneas de equipo, en todas las calidades.</p></div>
  `;

  // Default the local filter to the global freshness setting
  const ageSel = container.querySelector('#bm-age');
  ageSel.value = String(state.maxDataAgeMin);
  if (ageSel.selectedIndex < 0) ageSel.value = '60';

  container.querySelector('#bm-go').addEventListener('click', () => run(container));
}

async function run(container) {
  const results = container.querySelector('#bm-results');
  const tiers = container.querySelector('#bm-tiers').value.split(',').map(Number);
  const enchs = container.querySelector('#bm-ench').value.split(',').map(Number);
  const minProfit = Number(container.querySelector('#bm-minprofit').value) || 0;
  const maxAge = Number(container.querySelector('#bm-age').value);
  const goBtn = container.querySelector('#bm-go');
  goBtn.disabled = true;

  results.innerHTML = `<div class="loading"><span class="spinner"></span>Escaneando Mercado Negro vs ciudades…</div>`;

  try {
    const ids = gearUniverse(tiers, enchs);
    const prices = await getPrices(ids, [...CITIES, 'Black Market'], [1, 2, 3, 4, 5]);
    const feeRate = container.querySelector('#bm-tax').checked ? instantSellFees(state.premium) : 0;

    const opps = [];
    const byItemQ = new Map();
    for (const p of prices) {
      const k = p.itemId + '|' + p.quality;
      if (!byItemQ.has(k)) byItemQ.set(k, []);
      byItemQ.get(k).push(p);
    }

    for (const [, rows] of byItemQ) {
      const bm = rows.find(r => r.city === 'Black Market');
      if (!bm || !bm.buyMax) continue;
      if ((dataAge(bm.buyMaxDate) ?? Infinity) > maxAge) continue;

      // Cheapest fresh city listing
      let best = null;
      for (const r of rows) {
        if (r.city === 'Black Market' || !r.sellMin) continue;
        if ((dataAge(r.sellMinDate) ?? Infinity) > maxAge) continue;
        if (!best || r.sellMin < best.sellMin) best = r;
      }
      if (!best) continue;

      const net = bm.buyMax * (1 - feeRate) - best.sellMin;
      if (net < minProfit) continue;
      opps.push({
        itemId: bm.itemId, quality: bm.quality,
        buyCity: best.city, buyPrice: best.sellMin,
        bmPrice: bm.buyMax, net, roi: net / best.sellMin,
        age: Math.max(dataAge(bm.buyMaxDate) ?? 0, dataAge(best.sellMinDate) ?? 0),
      });
    }

    opps.sort((a, b) => b.net - a.net);
    const top = opps.slice(0, 80);

    if (!top.length) {
      results.innerHTML = `<div class="card"><p>Sin oportunidades con esos filtros ahora mismo. El Mercado Negro se mueve mucho: las órdenes se rellenan cada pocos minutos según muere gente en el juego. Prueba a bajar el beneficio mínimo o vuelve a escanear en un rato.</p></div>`;
      goBtn.disabled = false;
      return;
    }

    results.innerHTML = `
      <div class="card">
        <h3>${top.length} oportunidades (ordenado por beneficio absoluto)</h3>
        <div class="table-wrap">
          <table class="data">
            <thead><tr>
              <th>Item</th><th>Calidad</th><th>Comprar en</th><th>Precio</th>
              <th>MN paga</th><th>Beneficio/unidad</th><th>ROI</th><th>Datos</th>
            </tr></thead>
            <tbody>
              ${top.map(o => `<tr>
                <td class="txt"><span class="item-cell"><img src="${iconUrl(o.itemId, o.quality, 32)}" loading="lazy" alt=""/>${escapeHtml(itemName(o.itemId))}</span></td>
                <td class="q${o.quality}">${o.quality}</td>
                <td class="txt">${o.buyCity}</td>
                <td>${fmt(o.buyPrice)}</td>
                <td class="gold">${fmt(o.bmPrice)}</td>
                <td class="pos">${fmt(o.net)}</td>
                <td class="pos">${fmtPct(o.roi, 0)}</td>
                <td>${ageBadge(o.age)}</td>
              </tr>`).join('')}
            </tbody>
          </table>
        </div>
        <p class="hint">⚠️ Llegar a Caerleon implica zona roja: ve ligero, usa monturas rápidas y evita horas punta de ganks.
          Las órdenes del MN tienen cantidad limitada: la orden que ves puede estar ya consumida (verifica antigüedad).
          Pro-tip: los items con calidad "Excelente/Obra maestra" suelen tener las mejores órdenes.</p>
      </div>`;
  } catch (e) {
    results.innerHTML = `<div class="error-box">Error: ${escapeHtml(e.message)}</div>`;
  }
  goBtn.disabled = false;
}
