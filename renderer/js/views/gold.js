// Gold market: price chart + buy/sell signal vs moving average.
import { getGold } from '../api.js';
import { fmt, escapeHtml } from '../state.js';

let chart = null;

export function renderGold(container) {
  container.innerHTML = `
    <h1 class="view-title">🪙 Mercado de oro</h1>
    <p class="view-desc">El oro se compra y vende con plata sin impuestos: es la única inversión "limpia" del juego.
      Estrategia clásica: comprar cuando el precio está claramente por debajo de su media móvil y vender en los picos
      (los picos suelen coincidir con eventos, parches y rachas de contenido nuevo).</p>
    <div id="gold-stats" class="cards-row"></div>
    <div class="card">
      <h3>Precio del oro (últimos 14 días, por hora)</h3>
      <div class="chart-box"><canvas id="gold-chart"></canvas></div>
    </div>
    <div class="card">
      <h3>Señal simple</h3>
      <div id="gold-signal" class="loading"><span class="spinner"></span>Calculando…</div>
    </div>
  `;

  load(container);
}

async function load(container) {
  const statsEl = container.querySelector('#gold-stats');
  const signalEl = container.querySelector('#gold-signal');
  try {
    const raw = await getGold(24 * 14);
    // API returns most-recent-first; chart wants chronological
    const points = [...raw].reverse();
    const prices = points.map(p => p.price);
    const labels = points.map(p => {
      const d = new Date(p.timestamp.endsWith('Z') ? p.timestamp : p.timestamp + 'Z');
      return d.toLocaleDateString('es', { day: '2-digit', month: '2-digit' }) + ' ' + d.getHours() + 'h';
    });

    const current = prices[prices.length - 1];
    const min = Math.min(...prices);
    const max = Math.max(...prices);
    const avg = prices.reduce((a, b) => a + b, 0) / prices.length;
    // 3-day moving average as signal baseline
    const maWindow = 72;
    const ma = prices.map((_, i) => {
      const s = prices.slice(Math.max(0, i - maWindow + 1), i + 1);
      return s.reduce((a, b) => a + b, 0) / s.length;
    });
    const curMa = ma[ma.length - 1];
    const dev = current / curMa - 1;

    statsEl.innerHTML = `
      <div class="stat-card"><div class="stat-label">Actual</div><div class="stat-value gold">${fmt(current)}</div><div class="stat-sub">plata por oro</div></div>
      <div class="stat-card"><div class="stat-label">Media 14d</div><div class="stat-value">${fmt(avg)}</div></div>
      <div class="stat-card"><div class="stat-label">Mínimo 14d</div><div class="stat-value pos">${fmt(min)}</div></div>
      <div class="stat-card"><div class="stat-label">Máximo 14d</div><div class="stat-value neg">${fmt(max)}</div></div>
    `;

    let signal, cls;
    if (dev < -0.02) { signal = `El precio está un ${(Math.abs(dev) * 100).toFixed(1)}% POR DEBAJO de su media móvil de 3 días → zona de compra potencial.`; cls = 'pos'; }
    else if (dev > 0.02) { signal = `El precio está un ${(dev * 100).toFixed(1)}% POR ENCIMA de su media móvil de 3 días → zona de venta potencial.`; cls = 'neg'; }
    else { signal = `El precio está pegado a su media móvil (${(dev * 100).toFixed(1)}%) → sin señal clara, espera.`; cls = ''; }
    signalEl.className = '';
    signalEl.innerHTML = `<p class="${cls}" style="font-size:15px">${signal}</p>
      <p class="hint">Señal orientativa basada en media móvil de 72h. El oro sigue tendencias largas ligadas a la inflación de plata del servidor: no es un mercado para scalping rápido, sino para ciclos de días o semanas.</p>`;

    const ctx = container.querySelector('#gold-chart');
    if (chart) { chart.destroy(); chart = null; }
    chart = new Chart(ctx, {
      type: 'line',
      data: {
        labels,
        datasets: [
          { label: 'Precio', data: prices, borderColor: '#e3b341', backgroundColor: 'rgba(227,179,65,0.08)', fill: true, pointRadius: 0, borderWidth: 1.5, tension: 0.2 },
          { label: 'Media móvil 72h', data: ma, borderColor: '#58a6ff', pointRadius: 0, borderWidth: 1.2, borderDash: [6, 4], tension: 0.2 },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: { legend: { labels: { color: '#8b949e' } } },
        scales: {
          x: { ticks: { color: '#6e7681', maxTicksLimit: 14 }, grid: { color: '#1d2431' } },
          y: { ticks: { color: '#6e7681' }, grid: { color: '#1d2431' } },
        },
      },
    });
  } catch (e) {
    signalEl.className = 'error-box';
    signalEl.textContent = 'Error cargando el precio del oro: ' + e.message;
  }
}
