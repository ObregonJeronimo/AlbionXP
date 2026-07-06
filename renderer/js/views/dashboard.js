// Dashboard: gold snapshot + quick market pulse on high-liquidity resources.
import { getGold, getPrices } from '../api.js';
import { CITIES } from '../constants.js';
import { state, fmt, dataAge, ageBadge } from '../state.js';

const PULSE_ITEMS = [
  { id: 'T4_METALBAR', label: 'Lingote T4' },
  { id: 'T4_PLANKS', label: 'Tablones T4' },
  { id: 'T4_CLOTH', label: 'Tela T4' },
  { id: 'T4_LEATHER', label: 'Cuero T4' },
  { id: 'T5_METALBAR', label: 'Lingote T5' },
  { id: 'T5_PLANKS', label: 'Tablones T5' },
  { id: 'T5_CLOTH', label: 'Tela T5' },
  { id: 'T5_LEATHER', label: 'Cuero T5' },
];

const SERVER_NAMES = { west: 'América (West)', europe: 'Europa', east: 'Asia (East)' };

export function renderDashboard(container) {
  container.innerHTML = `
    <h1 class="view-title">🏠 Dashboard</h1>
    <p class="view-desc">Pulso rápido del servidor <b>${SERVER_NAMES[state.server]}</b>. Usa las herramientas del menú para cada estrategia — o empieza por la <span class="tool-link" id="dash-guide">Guía de estrategias</span>.</p>
    <div class="cards-row" id="dash-cards">
      <div class="stat-card"><div class="stat-label">Oro</div><div class="stat-value gold" id="dash-gold">…</div><div class="stat-sub">plata por oro</div></div>
      <div class="stat-card"><div class="stat-label">Tendencia oro 24h</div><div class="stat-value" id="dash-gold-trend">…</div><div class="stat-sub" id="dash-gold-trend-sub"></div></div>
      <div class="stat-card"><div class="stat-label">Impuesto de venta</div><div class="stat-value">${state.premium ? '4%' : '8%'}</div><div class="stat-sub">${state.premium ? 'premium' : 'sin premium'} + 2,5% de publicación</div></div>
    </div>
    <div class="card">
      <h3>Pulso de recursos refinados (venta mín. por ciudad)</h3>
      <div id="dash-pulse" class="loading"><span class="spinner"></span>Cargando precios…</div>
      <p class="hint">Estos son los items más líquidos del juego: buen termómetro de dónde está caro y barato hoy. Verde = ciudad más barata, rojo = más cara.</p>
    </div>
  `;

  container.querySelector('#dash-guide').addEventListener('click', () => window.__navigate('guide'));
  load(container);
}

async function load(container) {
  // Gold snapshot
  try {
    const gold = await getGold(25);
    const cur = gold[0]?.price;
    const prev = gold[24]?.price ?? gold[gold.length - 1]?.price;
    container.querySelector('#dash-gold').textContent = fmt(cur);
    const delta = cur && prev ? (cur / prev - 1) : null;
    const trendEl = container.querySelector('#dash-gold-trend');
    if (delta !== null) {
      trendEl.textContent = (delta > 0 ? '+' : '') + (delta * 100).toFixed(2) + '%';
      trendEl.className = 'stat-value ' + (delta > 0 ? 'neg' : 'pos'); // gold up = silver weaker
      container.querySelector('#dash-gold-trend-sub').textContent = delta > 0 ? 'el oro sube (vende oro)' : 'el oro baja (compra oro)';
    }
  } catch (_) {
    container.querySelector('#dash-gold').textContent = '—';
  }

  // Resource pulse table
  const pulseEl = container.querySelector('#dash-pulse');
  try {
    const prices = await getPrices(PULSE_ITEMS.map(i => i.id), CITIES, [1]);
    const byItem = new Map();
    for (const p of prices) {
      if (!byItem.has(p.itemId)) byItem.set(p.itemId, new Map());
      byItem.get(p.itemId).set(p.city, p);
    }

    pulseEl.className = 'table-wrap';
    pulseEl.innerHTML = `
      <table class="data">
        <thead><tr><th>Item</th>${CITIES.map(c => `<th>${c.replace(' ', '&nbsp;')}</th>`).join('')}<th>Datos</th></tr></thead>
        <tbody>
          ${PULSE_ITEMS.map(({ id, label }) => {
            const cityMap = byItem.get(id) || new Map();
            const vals = CITIES.map(c => cityMap.get(c)?.sellMin ?? null);
            const valid = vals.filter(Boolean);
            const mn = valid.length ? Math.min(...valid) : null;
            const mx = valid.length ? Math.max(...valid) : null;
            const newest = Math.min(...CITIES.map(c => {
              const a = cityMap.get(c) ? dataAge(cityMap.get(c).sellMinDate) : null;
              return a === null ? Infinity : a;
            }));
            return `<tr>
              <td class="txt">${label}</td>
              ${vals.map(v => `<td class="${v && v === mn ? 'pos' : v && v === mx && mx !== mn ? 'neg' : ''}">${fmt(v)}</td>`).join('')}
              <td>${ageBadge(newest === Infinity ? null : newest)}</td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>`;
  } catch (e) {
    pulseEl.className = 'error-box';
    pulseEl.textContent = 'Error cargando precios: ' + e.message;
  }
}
