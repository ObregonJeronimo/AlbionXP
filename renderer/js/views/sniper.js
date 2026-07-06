// Deal sniper: finds items listed well below their own recent historical average.
// Buy them, relist at market value (same city, zero transport risk).
import { getPrices, getHistory } from '../api.js';
import { CITIES, sellOrderFees } from '../constants.js';
import { itemName, iconUrl } from '../items.js';
import { state, fmt, fmtPct, dataAge, ageBadge, escapeHtml } from '../state.js';

import { gearUniverse } from '../gear.js';

function universe(tier) {
  return gearUniverse([tier], [0]);
}

export function renderSniper(container) {
  container.innerHTML = `
    <h1 class="view-title">🎯 Sniper de gangas</h1>
    <p class="view-desc">Busca equipo listado muy por debajo de su precio medio histórico en la misma ciudad:
      lo compras y lo relistas a precio de mercado. Sin transporte, sin riesgo de zona roja — solo capital y paciencia.
      Típico de gente que lista rápido para deshacerse del loot.</p>

    <div class="controls">
      <div class="ctrl">
        <label>Ciudad</label>
        <select id="snp-city">${CITIES.map(c => `<option ${c === 'Caerleon' ? 'selected' : ''}>${c}</option>`).join('')}</select>
      </div>
      <div class="ctrl">
        <label>Tier</label>
        <select id="snp-tier"><option value="4">T4</option><option value="5" selected>T5</option><option value="6">T6</option><option value="7">T7</option></select>
      </div>
      <div class="ctrl">
        <label>Descuento mínimo</label>
        <select id="snp-disc">
          <option value="0.15">15%</option>
          <option value="0.25" selected>25%</option>
          <option value="0.40">40%</option>
        </select>
      </div>
      <button class="btn" id="snp-go">Buscar gangas</button>
    </div>

    <div id="snp-results"><p class="hint">Compara el precio actual de ~30 líneas de equipo populares contra su media de 7 días (esto lanza una consulta de histórico por item: tarda ~20-30 s por el límite de la API).</p></div>
  `;

  container.querySelector('#snp-go').addEventListener('click', () => run(container));
}

async function run(container) {
  const results = container.querySelector('#snp-results');
  const city = container.querySelector('#snp-city').value;
  const tier = Number(container.querySelector('#snp-tier').value);
  const minDisc = Number(container.querySelector('#snp-disc').value);
  const goBtn = container.querySelector('#snp-go');
  goBtn.disabled = true;

  try {
    const ids = universe(tier);
    results.innerHTML = `<div class="loading"><span class="spinner"></span>Precios actuales en ${escapeHtml(city)}…</div>`;
    // All qualities: deals hide in every quality level
    const prices = await getPrices(ids, [city], [1, 2, 3, 4, 5]);
    const listed = prices.filter(p => p.sellMin && (dataAge(p.sellMinDate) ?? Infinity) < state.maxDataAgeMin);

    // Only fetch history for items that actually have live listings
    const itemsWithListings = [...new Set(listed.map(p => p.itemId))];
    const deals = [];
    let i = 0;
    for (const itemId of itemsWithListings) {
      i++;
      results.innerHTML = `<div class="loading"><span class="spinner"></span>Histórico ${i}/${itemsWithListings.length}: ${escapeHtml(itemName(itemId))}…</div>`;
      let hist;
      try {
        hist = await getHistory(itemId, { locations: [city], timeScale: 24, days: 7, quality: 0 });
      } catch (_) { continue; }

      for (const p of listed.filter(x => x.itemId === itemId)) {
        // Only compare against the SAME quality's history — another quality's
        // average would fabricate false bargains
        const series = hist.find(h => h.quality === p.quality);
        if (!series || !series.data.length) continue;
        const totCount = series.data.reduce((s, d) => s + d.itemCount, 0);
        if (totCount < 10) continue; // illiquid: average is meaningless
        const avg = series.data.reduce((s, d) => s + d.avgPrice * d.itemCount, 0) / totCount;
        const disc = 1 - p.sellMin / avg;
        if (disc < minDisc) continue;

        // Profit: buy now, relist at avg with sell-order fees
        const net = avg * (1 - sellOrderFees(state.premium)) - p.sellMin;
        if (net <= 0) continue;
        deals.push({ itemId, quality: p.quality, price: p.sellMin, avg, disc, net, vol: totCount / 7, date: p.sellMinDate });
      }
    }

    deals.sort((a, b) => b.disc - a.disc);

    if (!deals.length) {
      results.innerHTML = `<div class="card"><p>Sin gangas ahora mismo en ${escapeHtml(city)} con ≥${fmtPct(minDisc, 0)} de descuento. Los mejores momentos: después de eventos grandes y en horas punta del servidor, cuando la gente vuelca loot.</p></div>`;
      goBtn.disabled = false;
      return;
    }

    results.innerHTML = `
      <div class="card">
        <h3>${deals.length} posibles gangas en ${escapeHtml(city)}</h3>
        <div class="table-wrap">
          <table class="data">
            <thead><tr>
              <th>Item</th><th>Calidad</th><th>Precio listado</th><th>Media 7d</th>
              <th>Descuento</th><th>Beneficio relist</th><th>Vol/día</th><th>Visto</th>
            </tr></thead>
            <tbody>
              ${deals.map(d => `<tr>
                <td class="txt"><span class="item-cell"><img src="${iconUrl(d.itemId, d.quality, 32)}" loading="lazy" alt=""/>${escapeHtml(itemName(d.itemId))}</span></td>
                <td class="q${d.quality}">${d.quality}</td>
                <td class="pos">${fmt(d.price)}</td>
                <td>${fmt(d.avg)}</td>
                <td class="pos">${fmtPct(d.disc, 0)}</td>
                <td class="pos">${fmt(d.net)}</td>
                <td>${fmt(d.vol)}</td>
                <td>${ageBadge(dataAge(d.date))}</td>
              </tr>`).join('')}
            </tbody>
          </table>
        </div>
        <p class="hint">"Beneficio relist" = vender a la media de 7 días menos impuestos. Cuidado con volúmenes bajos:
          si se venden 2 al día, puedes tardar días en recolocarlo. Un descuento enorme en un item ilíquido no es ganga, es trampa.</p>
      </div>`;
  } catch (e) {
    results.innerHTML = `<div class="error-box">Error: ${escapeHtml(e.message)}</div>`;
  }
  goBtn.disabled = false;
}
