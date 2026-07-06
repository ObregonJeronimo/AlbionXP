// Inter-city arbitrage scanner: buy in city A (sell_price_min), transport,
// sell in city B. Two exit modes: instant-sell to buy orders, or sell order.
import { getPrices } from '../api.js';
import { CITIES, sellOrderFees, instantSellFees } from '../constants.js';
import { itemName, iconUrl } from '../items.js';
import { loadRecipes, weightMap } from '../recipes.js';
import { state, fmt, fmtPct, dataAge, ageBadge, escapeHtml } from '../state.js';

import { liquidUniverse } from '../gear.js';

export function renderFlip(container) {
  container.innerHTML = `
    <h1 class="view-title">🚚 Transporte / Flip entre ciudades</h1>
    <p class="view-desc">Escanea recursos, comida y pociones buscando diferenciales entre ciudades:
      compras al precio de venta más barato en una ciudad, transportas, y vendes en otra.
      El beneficio ya descuenta impuestos (${state.premium ? '4%' : '8%'} + 2,5% si usas orden de venta).</p>

    <div class="controls">
      <div class="ctrl">
        <label>Comprar en</label>
        <select id="flip-from"><option value="*">Cualquier ciudad</option>${CITIES.map(c => `<option>${c}</option>`).join('')}</select>
      </div>
      <div class="ctrl">
        <label>Vender en</label>
        <select id="flip-to"><option value="*">Cualquier ciudad</option>${CITIES.map(c => `<option>${c}</option>`).join('')}</select>
      </div>
      <div class="ctrl">
        <label>Modo de venta</label>
        <select id="flip-mode">
          <option value="order">Orden de venta (mejor precio, tarda)</option>
          <option value="instant">Venta instantánea (a órdenes de compra)</option>
        </select>
      </div>
      <div class="ctrl">
        <label>Antigüedad máx. datos</label>
        <select id="flip-age">
          <option value="30">30 minutos</option>
          <option value="60">1 hora</option>
          <option value="360">6 horas</option>
          <option value="1440">24 horas</option>
        </select>
      </div>
      <button class="btn" id="flip-go">Escanear</button>
    </div>

    <div id="flip-results"><p class="hint">Pulsa "Escanear" — consulta ~200 items en todas las ciudades (tarda unos segundos).</p></div>
  `;

  // Default the local filter to the global freshness setting
  const ageSel = container.querySelector('#flip-age');
  ageSel.value = String(state.maxDataAgeMin);
  if (ageSel.selectedIndex < 0) ageSel.value = '60';

  container.querySelector('#flip-go').addEventListener('click', () => run(container));
}

async function run(container) {
  const results = container.querySelector('#flip-results');
  const from = container.querySelector('#flip-from').value;
  const to = container.querySelector('#flip-to').value;
  const mode = container.querySelector('#flip-mode').value;
  const maxAge = Number(container.querySelector('#flip-age').value);
  const goBtn = container.querySelector('#flip-go');

  goBtn.disabled = true;
  results.innerHTML = `<div class="loading"><span class="spinner"></span>Escaneando mercados de ${CITIES.length} ciudades…</div>`;

  try {
    // Item weights for profit-per-weight (first run downloads the game dump, then cached)
    const weightsReady = loadRecipes().catch(() => null);
    const prices = await getPrices(liquidUniverse(), CITIES, [1]);
    await weightsReady;
    const feeRate = mode === 'order' ? sellOrderFees(state.premium) : instantSellFees(state.premium);

    // Group by item
    const byItem = new Map();
    for (const p of prices) {
      if (!byItem.has(p.itemId)) byItem.set(p.itemId, []);
      byItem.get(p.itemId).push(p);
    }

    const opps = [];
    for (const [itemId, rows] of byItem) {
      for (const buyRow of rows) {
        if (from !== '*' && buyRow.city !== from) continue;
        const buyPrice = buyRow.sellMin;
        if (!buyPrice) continue;
        if ((dataAge(buyRow.sellMinDate) ?? Infinity) > maxAge) continue;

        for (const sellRow of rows) {
          if (sellRow.city === buyRow.city) continue;
          if (to !== '*' && sellRow.city !== to) continue;

          const grossSell = mode === 'order' ? sellRow.sellMin : sellRow.buyMax;
          if (!grossSell) continue;
          const sellDate = mode === 'order' ? sellRow.sellMinDate : sellRow.buyMaxDate;
          if ((dataAge(sellDate) ?? Infinity) > maxAge) continue;

          // Selling with an order: undercut the current cheapest by 1 silver
          const sellPrice = mode === 'order' ? grossSell - 1 : grossSell;
          const net = sellPrice * (1 - feeRate) - buyPrice;
          const roi = net / buyPrice;
          if (net <= 0) continue;

          const weight = weightMap.get(itemId) || null;
          opps.push({
            itemId, buyCity: buyRow.city, sellCity: sellRow.city,
            buyPrice, sellPrice, net, roi,
            perKg: weight ? net / weight : null,
            age: Math.max(dataAge(buyRow.sellMinDate) ?? 0, dataAge(sellDate) ?? 0),
          });
        }
      }
    }

    // Best route per item only, sorted by ROI
    const bestPerItem = new Map();
    for (const o of opps) {
      const cur = bestPerItem.get(o.itemId);
      if (!cur || o.roi > cur.roi) bestPerItem.set(o.itemId, o);
    }
    const top = [...bestPerItem.values()].sort((a, b) => b.roi - a.roi).slice(0, 60);

    if (!top.length) {
      results.innerHTML = `<div class="card"><p>No hay oportunidades con esos filtros. Prueba a ampliar la antigüedad de datos o cambiar el modo de venta.</p></div>`;
      goBtn.disabled = false;
      return;
    }

    results.innerHTML = `
      <div class="card">
        <h3>${top.length} oportunidades (mejor ruta por item, ordenado por ROI)</h3>
        <div class="table-wrap">
          <table class="data">
            <thead><tr>
              <th>Item</th><th>Comprar en</th><th>Precio compra</th>
              <th>Vender en</th><th>Precio venta</th>
              <th>Beneficio/ud</th><th>ROI</th><th>Beneficio/kg</th><th>Datos</th>
            </tr></thead>
            <tbody>
              ${top.map(o => `<tr>
                <td class="txt"><span class="item-cell"><img src="${iconUrl(o.itemId, 1, 32)}" loading="lazy" alt=""/>${escapeHtml(itemName(o.itemId))}</span></td>
                <td class="txt">${o.buyCity}</td>
                <td>${fmt(o.buyPrice)}</td>
                <td class="txt">${o.sellCity === 'Caerleon' ? '⚠️ ' : ''}${o.sellCity}</td>
                <td>${fmt(o.sellPrice)}</td>
                <td class="pos">${fmt(o.net)}</td>
                <td class="pos">${fmtPct(o.roi, 0)}</td>
                <td class="gold">${o.perKg ? fmt(o.perKg) : '—'}</td>
                <td>${ageBadge(o.age)}</td>
              </tr>`).join('')}
            </tbody>
          </table>
        </div>
        <p class="hint">⚠️ = la ruta pasa por Caerleon (zona roja: puedes morir con la carga; lleva solo lo que puedas permitirte perder).
        <b>Beneficio/kg es la métrica del transportista</b>: tu montura carga un peso fijo, así que maximiza plata por kg, no ROI.
        ROI muy altos con datos viejos suelen ser fantasmas: alguien ya se comió la oportunidad. Verifica en el juego antes de comprar fuerte.</p>
      </div>`;
  } catch (e) {
    results.innerHTML = `<div class="error-box">Error: ${escapeHtml(e.message)}</div>`;
  }
  goBtn.disabled = false;
}
