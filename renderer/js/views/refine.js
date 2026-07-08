// Refining profit calculator: buy raw + lower-tier refined, refine with the
// city's return-rate bonus, sell the refined product.
import { getPrices } from '../api.js';
import {
  CITIES, RESOURCES, REFINE_BONUS_CITY, RRR, REFINE_INPUTS,
  rawId, refinedId, sellOrderFees, maxEnch, stationFee, refinedItemValue,
} from '../constants.js';
import { itemName, iconUrl } from '../items.js';
import { state, fmt, fmtPct, dataAge, ageBadge, escapeHtml } from '../state.js';

export function renderRefine(container) {
  container.innerHTML = `
    <h1 class="view-title">⛏️ Refinado</h1>
    <p class="view-desc">Compra materia prima, refínala en la ciudad con bono (devuelve ~${(RRR.bonusCity * 100).toFixed(0)}%
      de los recursos, ~${(RRR.bonusCityFocus * 100).toFixed(0)}% con foco) y vende el producto.
      La tabla calcula el beneficio por unidad refinada para cada tier y encantamiento.</p>

    <div class="controls">
      <div class="ctrl">
        <label>Recurso</label>
        <select id="ref-res">
          ${Object.entries(RESOURCES).map(([k, v]) =>
            `<option value="${k}">${v.rawEs} → ${v.refinedEs} (bono: ${REFINE_BONUS_CITY[k]})</option>`).join('')}
        </select>
      </div>
      <div class="ctrl">
        <label>Ciudad de refinado</label>
        <select id="ref-city"></select>
      </div>
      <div class="ctrl">
        <label>Compra de materias</label>
        <select id="ref-buymode">
          <option value="same">En la ciudad de refinado</option>
          <option value="cheapest">Ciudad más barata (transporte)</option>
        </select>
      </div>
      <div class="ctrl">
        <label>Tarifa estación /100 nutr.</label>
        <input type="number" id="ref-fee" value="100" min="0" max="1000" style="width:90px" />
      </div>
      <button class="btn" id="ref-go">Calcular</button>
    </div>

    <div id="ref-results"><p class="hint">El beneficio ya descuenta el impuesto de venta (${fmtPct(sellOrderFees(state.premium), 1)} con orden de venta) y aplica la tasa de retorno como descuento sobre las materias consumidas.</p></div>
  `;

  const resSel = container.querySelector('#ref-res');
  const citySel = container.querySelector('#ref-city');

  function syncCity() {
    const bonus = REFINE_BONUS_CITY[resSel.value];
    citySel.innerHTML = CITIES.map(c =>
      `<option value="${c}" ${c === bonus ? 'selected' : ''}>${c}${c === bonus ? ' ★ bono' : ''}</option>`).join('');
  }
  syncCity();
  resSel.addEventListener('change', syncCity);
  container.querySelector('#ref-go').addEventListener('click', () => run(container));
}

async function run(container) {
  const results = container.querySelector('#ref-results');
  const res = container.querySelector('#ref-res').value;
  const city = container.querySelector('#ref-city').value;
  const buyMode = container.querySelector('#ref-buymode').value;
  const feePer100 = Number(container.querySelector('#ref-fee').value) || 0;
  const goBtn = container.querySelector('#ref-go');
  goBtn.disabled = true;

  const isBonusCity = REFINE_BONUS_CITY[res] === city;
  const rrr = isBonusCity ? RRR.bonusCity : RRR.base;
  const rrrFocus = isBonusCity ? RRR.bonusCityFocus : RRR.baseFocus;

  results.innerHTML = `<div class="loading"><span class="spinner"></span>Consultando precios…</div>`;

  try {
    // Collect all needed item ids: raws T2-T8 ench 0-3(4+), refined T2-T8
    const ids = new Set();
    for (let t = 2; t <= 8; t++) {
      const eMaxRaw = t >= 4 ? maxEnch(res, 'raw') : 0;
      const eMaxRef = t >= 4 ? maxEnch(res, 'refined') : 0;
      for (let e = 0; e <= eMaxRaw; e++) ids.add(rawId(res, t, e));
      for (let e = 0; e <= eMaxRef; e++) ids.add(refinedId(res, t, e));
    }
    const buyCities = buyMode === 'same' ? [city] : CITIES;
    const prices = await getPrices([...ids], [...new Set([...buyCities, city])], [1]);

    // price lookup: cheapest sell / in-city sell
    function buyPrice(id) {
      const rows = prices.filter(p => p.itemId === id && p.sellMin && buyCities.includes(p.city));
      if (!rows.length) return null;
      const best = rows.reduce((a, b) => (a.sellMin <= b.sellMin ? a : b));
      return { price: best.sellMin, city: best.city, date: best.sellMinDate };
    }
    function sellPrice(id) {
      const row = prices.find(p => p.itemId === id && p.city === city && p.sellMin);
      return row ? { price: row.sellMin, date: row.sellMinDate } : null;
    }

    const feeRate = sellOrderFees(state.premium);
    const rows = [];
    const eMax = Math.min(maxEnch(res, 'raw'), maxEnch(res, 'refined'));
    for (let t = 4; t <= 8; t++) {
      for (let e = 0; e <= eMax; e++) {
        const inp = REFINE_INPUTS[t];
        const raw = buyPrice(rawId(res, t, e));
        const prevEnch = t - 1 >= 4 ? e : 0;
        const prev = inp.prev ? buyPrice(refinedId(res, t - 1, prevEnch)) : { price: 0, city: '—' };
        const out = sellPrice(refinedId(res, t, e));
        if (!raw || !prev || !out) continue;

        const inputCost = inp.raw * raw.price + inp.prev * (prev.price || 0);
        const craftFee = stationFee(refinedItemValue(t, e), feePer100);
        const calc = (rate) => {
          const cost = inputCost * (1 - rate) + craftFee;
          const net = (out.price - 1) * (1 - feeRate) - cost;
          return { cost, net, roi: net / cost };
        };
        rows.push({
          tier: t, ench: e,
          rawP: raw.price, rawCity: raw.city,
          prevP: prev.price || null, outP: out.price,
          noFocus: calc(rrr), focus: calc(rrrFocus),
          age: dataAge(out.date),
          outId: refinedId(res, t, e),
        });
      }
    }

    if (!rows.length) {
      results.innerHTML = `<div class="card"><p>Sin datos suficientes de precios en ${escapeHtml(city)} ahora mismo. Prueba otro recurso o abre el juego con el cliente de Albion Data corriendo para refrescar los mercados.</p></div>`;
      goBtn.disabled = false;
      return;
    }

    rows.sort((a, b) => b.noFocus.roi - a.noFocus.roi);
    const R = RESOURCES[res];

    // "Recomendado hoy": la fila con mejor beneficio (sin/con foco), para que el novato
    // no tenga que interpretar 20 filas y sepa exactamente qué refinar.
    const bestRow = rows.reduce((a, b) => (Math.max(b.noFocus.net, b.focus.net) > Math.max(a.noFocus.net, a.focus.net) ? b : a));
    const recCard = (bestRow.noFocus.net > 0 || bestRow.focus.net > 0) ? `
      <div class="card" style="border-color:var(--accent)">
        <h3>Recomendado hoy</h3>
        <p style="font-size:14px;line-height:1.6">Lo que más rinde ahora: refinar <b>${escapeHtml(itemName(bestRow.outId))}</b>${isBonusCity ? '' : ` — pero hacelo en <b>${REFINE_BONUS_CITY[res]}</b> (la ciudad con bono), no en ${escapeHtml(city)}`}.
          ${bestRow.noFocus.net > 0 ? `Ganás <b class="pos">${fmt(bestRow.noFocus.net)}/unidad</b> (${fmtPct(bestRow.noFocus.roi, 0)} ROI) sin foco` : 'Sin foco no es rentable'}${bestRow.focus.net > bestRow.noFocus.net ? `, o <b class="pos">${fmt(bestRow.focus.net)}/unidad</b> (${fmtPct(bestRow.focus.roi, 0)}) con foco.` : '.'}
          ${bestRow.focus.net > Math.max(0, bestRow.noFocus.net) * 1.3 ? ' <b>El foco casi lo duplica: si lo tenés, gastalo en este.</b>' : ''}</p>
      </div>` : '';

    results.innerHTML = `
      ${recCard}
      <div class="card">
        <h3>${R.rawEs} → ${R.refinedEs} en ${escapeHtml(city)} ${isBonusCity ? '★ (ciudad con bono)' : `(sin bono — el bono está en ${REFINE_BONUS_CITY[res]})`}</h3>
        <div class="table-wrap">
          <table class="data">
            <thead><tr>
              <th>Producto</th><th>Materia (${buyMode === 'same' ? 'misma ciudad' : 'más barata'})</th>
              <th>Coste inputs/unidad</th><th>Venta</th>
              <th>Beneficio/unidad</th><th>ROI</th>
              <th>Con foco</th><th>ROI foco</th><th>Datos</th>
            </tr></thead>
            <tbody>
              ${rows.map(r => `<tr>
                <td class="txt"><span class="item-cell"><img src="${iconUrl(r.outId, 1, 32)}" loading="lazy" alt=""/>${escapeHtml(itemName(r.outId))}</span></td>
                <td class="txt">${fmt(r.rawP)} <span class="hint">(${r.rawCity})</span></td>
                <td>${fmt(r.noFocus.cost)}</td>
                <td>${fmt(r.outP)}</td>
                <td class="${r.noFocus.net > 0 ? 'pos' : 'neg'}">${fmt(r.noFocus.net)}</td>
                <td class="${r.noFocus.net > 0 ? 'pos' : 'neg'}">${fmtPct(r.noFocus.roi, 0)}</td>
                <td class="${r.focus.net > 0 ? 'pos' : 'neg'}">${fmt(r.focus.net)}</td>
                <td class="${r.focus.net > 0 ? 'pos' : 'neg'}">${fmtPct(r.focus.roi, 0)}</td>
                <td>${ageBadge(r.age)}</td>
              </tr>`).join('')}
            </tbody>
          </table>
        </div>
        <p class="hint">Coste = (materias × precio) × (1 − tasa de retorno ${fmtPct(rrr, 1)}) + tarifa de estación
          (nutrición = valor del item × 0,1125 × tarifa/100; el tope legal es 1.000 por 100 de nutrición).
          El retorno actúa como descuento porque los recursos devueltos se reutilizan en la siguiente tanda.
          Con volumen alto, comprueba también la profundidad del mercado en el juego: el precio "venta mín." es solo la primera orden.</p>
      </div>`;
  } catch (e) {
    results.innerHTML = `<div class="error-box">Error: ${escapeHtml(e.message)}</div>`;
  }
  goBtn.disabled = false;
}
