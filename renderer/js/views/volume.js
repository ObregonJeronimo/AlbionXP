// Market movement: rank items by units traded in a city over recent hours,
// using the history endpoint's item_count (hourly buckets, sell-order sales).
import { getHistoryMulti } from '../api.js';
import { CITIES } from '../constants.js';
import { gearUniverse, liquidUniverse } from '../gear.js';
import { itemName, iconUrl } from '../items.js';
import { fmt, escapeHtml } from '../state.js';

const UNIVERSES = {
  liquid: { label: 'Recursos, comida y pociones (~200 items)', ids: () => liquidUniverse() },
  gear: { label: 'Equipo popular T4–T6 (~120 items)', ids: () => gearUniverse([4, 5, 6], [0]) },
};

export function renderVolume(container) {
  container.innerHTML = `
    <h1 class="view-title">📊 Movimiento de mercado</h1>
    <p class="view-desc">Qué se está comerciando de verdad en un mercado: unidades vendidas por hora
      (histórico de ventas del juego). Úsalo para saber dónde hay demanda antes de transportar o craftear —
      un margen enorme en un item que mueve 3 unidades al día es una trampa.</p>

    <div class="controls">
      <div class="ctrl">
        <label>Ciudad</label>
        <select id="vol-city">${CITIES.map(c => `<option ${c === 'Caerleon' ? 'selected' : ''}>${c}</option>`).join('')}</select>
      </div>
      <div class="ctrl">
        <label>Universo</label>
        <select id="vol-universe">
          ${Object.entries(UNIVERSES).map(([k, u]) => `<option value="${k}">${u.label}</option>`).join('')}
        </select>
      </div>
      <div class="ctrl">
        <label>Ventana</label>
        <select id="vol-window">
          <option value="24" selected>Últimas 24 h</option>
          <option value="48">Últimas 48 h</option>
          <option value="168">Últimos 7 días</option>
        </select>
      </div>
      <button class="btn" id="vol-go">Analizar</button>
    </div>

    <div id="vol-results"><p class="hint">Rankea por unidades movidas y plata total, con la tendencia de precio dentro de la ventana.</p></div>
  `;

  container.querySelector('#vol-go').addEventListener('click', () => run(container));
}

async function run(container) {
  const results = container.querySelector('#vol-results');
  const city = container.querySelector('#vol-city').value;
  const universe = UNIVERSES[container.querySelector('#vol-universe').value];
  const hours = Number(container.querySelector('#vol-window').value);
  const goBtn = container.querySelector('#vol-go');
  goBtn.disabled = true;

  results.innerHTML = `<div class="loading"><span class="spinner"></span>Descargando histórico horario de ${escapeHtml(city)}…</div>`;

  try {
    const series = await getHistoryMulti(universe.ids(), { location: city, timeScale: 1, quality: 1 });
    const cutoff = Date.now() - hours * 3600 * 1000;

    const rows = [];
    for (const s of series) {
      const points = s.data.filter(p => Date.parse(p.timestamp.endsWith('Z') ? p.timestamp : p.timestamp + 'Z') >= cutoff);
      if (!points.length) continue;
      const units = points.reduce((a, p) => a + p.itemCount, 0);
      if (!units) continue;
      const silver = points.reduce((a, p) => a + p.itemCount * p.avgPrice, 0);
      const avgPrice = silver / units;
      // Price trend: first vs last third of the window
      const third = Math.max(1, Math.floor(points.length / 3));
      const early = points.slice(0, third);
      const late = points.slice(-third);
      const wavg = (arr) => {
        const u = arr.reduce((a, p) => a + p.itemCount, 0);
        return u ? arr.reduce((a, p) => a + p.itemCount * p.avgPrice, 0) / u : null;
      };
      const e = wavg(early);
      const l = wavg(late);
      const trend = e && l ? l / e - 1 : null;
      rows.push({ itemId: s.itemId, units, silver, avgPrice, trend, hoursActive: points.length });
    }

    rows.sort((a, b) => b.silver - a.silver);
    const top = rows.slice(0, 50);
    const totalSilver = rows.reduce((a, r) => a + r.silver, 0);

    if (!top.length) {
      results.innerHTML = `<div class="card"><p>Sin actividad registrada en ${escapeHtml(city)} en esa ventana para este universo.
        Recuerda: los datos vienen del cliente crowdsourceado — mercados poco visitados tienen huecos.</p></div>`;
      goBtn.disabled = false;
      return;
    }

    results.innerHTML = `
      <div class="cards-row">
        <div class="stat-card"><div class="stat-label">Plata movida (universo)</div><div class="stat-value gold">${fmt(totalSilver)}</div><div class="stat-sub">últimas ${hours} h en ${escapeHtml(city)}</div></div>
        <div class="stat-card"><div class="stat-label">Items con actividad</div><div class="stat-value">${rows.length}</div><div class="stat-sub">de ${universe.ids().length} consultados</div></div>
      </div>
      <div class="card">
        <h3>Top ${top.length} por plata movida — ${escapeHtml(city)}, últimas ${hours} h</h3>
        <div class="table-wrap">
          <table class="data">
            <thead><tr>
              <th>Item</th><th>Unidades</th><th>Plata movida</th><th>Precio medio</th><th>Tendencia precio</th><th>Horas con ventas</th>
            </tr></thead>
            <tbody>
              ${top.map(r => `<tr>
                <td class="txt"><span class="item-cell"><img src="${iconUrl(r.itemId, 1, 32)}" loading="lazy" alt=""/>${escapeHtml(itemName(r.itemId))}</span></td>
                <td>${fmt(r.units)}</td>
                <td class="gold">${fmt(r.silver)}</td>
                <td>${fmt(r.avgPrice)}</td>
                <td class="${r.trend > 0.03 ? 'pos' : r.trend < -0.03 ? 'neg' : ''}">${r.trend === null ? '—' : (r.trend > 0 ? '+' : '') + (r.trend * 100).toFixed(1) + '%'}</td>
                <td>${r.hoursActive}</td>
              </tr>`).join('')}
            </tbody>
          </table>
        </div>
        <p class="hint">El histórico cuenta ventas de órdenes de venta (lo que la pestaña de historial del juego muestra).
          Tendencia en verde = el precio sube dentro de la ventana (demanda creciente: buen destino para transportar);
          en rojo = cae (mercado saturándose). Cruza esto con Transporte/Flip: margen alto + volumen alto = la ruta perfecta.</p>
      </div>`;
  } catch (e) {
    results.innerHTML = `<div class="error-box">Error: ${escapeHtml(e.message)}</div>`;
  }
  goBtn.disabled = false;
}
