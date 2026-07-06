// Market comparison: one item across all cities, sell/buy prices + data age.
import { getPrices, getHistory } from '../api.js';
import { CITIES_WITH_BM, QUALITY_NAMES } from '../constants.js';
import { attachItemSearch, iconUrl, itemName } from '../items.js';
import { fmt, dataAge, ageBadge, escapeHtml } from '../state.js';

let lastItem = null; // remember selection across navigation

export function renderCompare(container, params = {}) {
  container.innerHTML = `
    <h1 class="view-title">⚖️ Comparador de mercados</h1>
    <p class="view-desc">Compara el precio de un item en todas las ciudades. La columna
      "Venta mín." es el precio más barato en venta (lo que pagarías comprando ya);
      "Compra máx." es la mejor orden de compra (lo que te pagarían vendiendo ya).
      La diferencia entre ciudades es tu oportunidad de transporte.</p>

    <div class="controls">
      <div class="ctrl">
        <label>Item</label>
        <div class="item-search"><input type="text" id="cmp-item" placeholder="Busca un item (ej: lingote, espada ancha…)" /></div>
      </div>
      <div class="ctrl">
        <label>Calidad</label>
        <select id="cmp-quality">
          ${Object.entries(QUALITY_NAMES).map(([q, n]) => `<option value="${q}">${q} — ${n}</option>`).join('')}
        </select>
      </div>
      <button class="btn" id="cmp-go" disabled>Comparar</button>
    </div>

    <div id="cmp-results"></div>
  `;

  const input = container.querySelector('#cmp-item');
  const qualSel = container.querySelector('#cmp-quality');
  const goBtn = container.querySelector('#cmp-go');
  const results = container.querySelector('#cmp-results');

  let picked = params.itemId ? { id: params.itemId } : lastItem;
  if (picked) {
    input.value = itemName(picked.id);
    goBtn.disabled = false;
  }

  attachItemSearch(input, (entry) => {
    picked = entry;
    lastItem = entry;
    goBtn.disabled = false;
    run();
  });

  goBtn.addEventListener('click', run);
  qualSel.addEventListener('change', () => { if (picked) run(); });

  async function run() {
    if (!picked) return;
    const q = Number(qualSel.value);
    results.innerHTML = `<div class="loading"><span class="spinner"></span>Consultando mercados…</div>`;
    try {
      const [prices, history] = await Promise.all([
        getPrices([picked.id], CITIES_WITH_BM, [q]),
        getHistory(picked.id, { quality: q, timeScale: 24, days: 14 }).catch(() => []),
      ]);

      // Average daily price across cities for reference
      let histAvg = null;
      const allPoints = history.flatMap(h => h.data);
      if (allPoints.length) {
        histAvg = allPoints.reduce((s, p) => s + p.avgPrice, 0) / allPoints.length;
      }

      const rows = CITIES_WITH_BM.map(city => {
        const r = prices.find(p => p.city === city && p.quality === q)
          || prices.find(p => p.city === city); // BM sometimes normalizes quality
        return { city, r };
      });

      const validSells = rows.map(x => x.r?.sellMin).filter(Boolean);
      const minSell = validSells.length ? Math.min(...validSells) : null;
      const maxSell = validSells.length ? Math.max(...validSells) : null;

      results.innerHTML = `
        <div class="cards-row">
          <div class="stat-card">
            <div class="stat-label">Más barato</div>
            <div class="stat-value gold">${fmt(minSell)}</div>
            <div class="stat-sub">${minSell ? rows.find(x => x.r?.sellMin === minSell).city : '—'}</div>
          </div>
          <div class="stat-card">
            <div class="stat-label">Más caro</div>
            <div class="stat-value gold">${fmt(maxSell)}</div>
            <div class="stat-sub">${maxSell ? rows.find(x => x.r?.sellMin === maxSell).city : '—'}</div>
          </div>
          <div class="stat-card">
            <div class="stat-label">Diferencial máx.</div>
            <div class="stat-value ${minSell && maxSell && maxSell > minSell ? 'pos' : ''}">${minSell && maxSell ? fmt(maxSell - minSell) : '—'}</div>
            <div class="stat-sub">bruto, antes de impuestos</div>
          </div>
          <div class="stat-card">
            <div class="stat-label">Media 14 días</div>
            <div class="stat-value">${fmt(histAvg)}</div>
            <div class="stat-sub">todas las ciudades</div>
          </div>
        </div>

        <div class="card">
          <h3><span class="item-cell"><img src="${iconUrl(picked.id, q, 32)}" alt=""/> ${escapeHtml(itemName(picked.id))} — ${QUALITY_NAMES[q]}</span></h3>
          <div class="table-wrap">
            <table class="data">
              <thead><tr>
                <th>Ciudad</th><th>Venta mín. (comprar)</th><th>vs. media</th>
                <th>Compra máx. (vender)</th><th>Spread</th><th>Datos</th>
              </tr></thead>
              <tbody>
                ${rows.map(({ city, r }) => {
                  const sell = r?.sellMin ?? null;
                  const buy = r?.buyMax ?? null;
                  const spread = sell && buy ? sell - buy : null;
                  const vsAvg = sell && histAvg ? (sell / histAvg - 1) : null;
                  const age = r ? dataAge(r.sellMinDate) : null;
                  return `<tr>
                    <td class="txt">${city}</td>
                    <td class="${sell === minSell && sell ? 'pos' : ''}">${fmt(sell)}</td>
                    <td class="${vsAvg > 0.05 ? 'neg' : vsAvg < -0.05 ? 'pos' : ''}">${vsAvg === null ? '—' : (vsAvg > 0 ? '+' : '') + (vsAvg * 100).toFixed(0) + '%'}</td>
                    <td>${fmt(buy)}</td>
                    <td>${fmt(spread)}</td>
                    <td>${ageBadge(age)}</td>
                  </tr>`;
                }).join('')}
              </tbody>
            </table>
          </div>
          <p class="hint">Los datos son crowdsourceados (Albion Data Project): un precio con antigüedad alta puede haber cambiado. "vs. media" en verde = barato respecto a la media histórica de 14 días.</p>
        </div>
      `;
    } catch (e) {
      results.innerHTML = `<div class="error-box">Error consultando la API: ${escapeHtml(e.message)}</div>`;
    }
  }

  if (picked && params.autorun !== false) run();
}
