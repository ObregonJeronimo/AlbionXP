// Silver Plan: pick a target -> the engine scans live markets and produces
// ranked, step-by-step plans (investment, active hours, calendar time).
// An optional AI narrates the top plan; templates cover the no-AI case.
import { buildPlans, templateNarration } from '../planner.js';
import { askAI, healOllama, DEFAULT_MODEL, AI_SYSTEM_PROMPT } from '../ai.js';
import { state, saveSettings, fmt, escapeHtml } from '../state.js';
import { icon } from '../icons.js';

const TARGETS = [
  { label: '1 millón', value: 1e6 },
  { label: '5 millones', value: 5e6 },
  { label: '20 millones', value: 20e6 },
];

function mdToHtml(md) {
  // Minimal, safe markdown: escape first, then re-introduce bold/lists/breaks
  let h = escapeHtml(md);
  h = h.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
  h = h.replace(/^#{1,3} (.+)$/gm, '<b>$1</b>');
  h = h.replace(/\n/g, '<br>');
  return h;
}

export function renderPlanner(container) {
  container.innerHTML = `
    <h1 class="view-title">🧭 Plan de plata</h1>
    <p class="view-desc">Dime cuánta plata quieres y cuánto capital puedes invertir: el motor escanea los mercados
      en vivo y te devuelve las rutas más rápidas con pasos exactos, inversión y tiempo estimado.
      Los números salen de datos reales (precios + volúmenes), no de una IA.</p>

    <div class="card">
      <div class="controls" style="margin-bottom:0">
        <div class="ctrl">
          <label>¿Cuánta plata quieres ganar?</label>
          <div style="display:flex;gap:8px">
            ${TARGETS.map((t, i) => `<button class="btn ${i === 0 ? '' : 'secondary'} tgt-btn" data-v="${t.value}">${t.label}</button>`).join('')}
            <input type="number" id="pln-custom" placeholder="otra (millones)" min="0.1" step="0.5" style="width:130px;background:var(--bg-elevated);color:var(--text);border:1px solid var(--border);border-radius:6px;padding:7px 10px" />
          </div>
        </div>
        <div class="ctrl">
          <label>Capital disponible (plata)</label>
          <select id="pln-capital">
            <option value="200000">200k (empezando)</option>
            <option value="1000000" selected>1M</option>
            <option value="5000000">5M</option>
            <option value="20000000">20M</option>
            <option value="100000000">100M</option>
          </select>
        </div>
        <button class="btn" id="pln-go">Generar plan</button>
      </div>
      <p class="hint">Supuestos del modelo de tiempo: viaje entre ciudades ~25 min (35 con zona roja), tanda de refinado ~30 min activos,
        máx. 4 ciclos/día por ruta y captura del 20% del volumen real de mercado. Sesión máx. contada: 8 h/día.</p>
    </div>

    <div class="card">
      <h3>${icon('spark', 18)} Coach IA — estado</h3>
      <div id="pln-ai-status" class="hint">Diagnosticando IA local…</div>
      <div id="pln-ai-actions" style="margin-top:10px"></div>
      <div id="pln-ai-progress" style="display:none;margin-top:10px">
        <div style="background:var(--bg);border:1px solid var(--border);border-radius:8px;overflow:hidden;height:18px">
          <div id="pln-ai-bar" style="background:var(--accent);height:100%;width:0%;transition:width .3s"></div>
        </div>
        <div id="pln-ai-progress-txt" class="hint" style="margin-top:4px"></div>
      </div>
      <details style="margin-top:12px">
        <summary class="hint" style="cursor:pointer">Proveedores en la nube (opcional, avanzado)</summary>
        <div class="controls" style="margin:10px 0 0">
          <div class="ctrl">
            <label>Groq API key</label>
            <input type="text" id="pln-groq" placeholder="gsk_…" value="${escapeHtml(state.groqKey)}" style="width:220px" />
          </div>
          <div class="ctrl">
            <label>OpenRouter API key</label>
            <input type="text" id="pln-openrouter" placeholder="sk-or-…" value="${escapeHtml(state.openrouterKey)}" style="width:220px" />
          </div>
          <button class="btn secondary" id="pln-savekeys">Guardar claves</button>
        </div>
      </details>
      <p class="hint">El coach usa IA <b>local</b> (Ollama): gratis, sin cuentas y privada. Si algo está roto, este panel lo arregla con un clic.
        Si no hay ninguna IA disponible, el plan se genera igual con narración por plantillas — nunca te quedas sin plan.</p>
    </div>

    <div id="pln-results"></div>
  `;

  let target = TARGETS[0].value;
  const btns = container.querySelectorAll('.tgt-btn');
  btns.forEach(b => b.addEventListener('click', () => {
    target = Number(b.dataset.v);
    container.querySelector('#pln-custom').value = '';
    btns.forEach(x => x.classList.toggle('secondary', x !== b));
  }));
  container.querySelector('#pln-custom').addEventListener('input', (e) => {
    const v = Number(e.target.value);
    if (v > 0) { target = v * 1e6; btns.forEach(x => x.classList.add('secondary')); }
  });

  container.querySelector('#pln-savekeys').addEventListener('click', async () => {
    state.groqKey = container.querySelector('#pln-groq').value.trim();
    state.openrouterKey = container.querySelector('#pln-openrouter').value.trim();
    await saveSettings();
    refreshAIStatus(container);
  });

  container.querySelector('#pln-go').addEventListener('click', () => run(container, () => target));
  refreshAIStatus(container);
}

async function refreshAIStatus(container) {
  const status = container.querySelector('#pln-ai-status');
  const actions = container.querySelector('#pln-ai-actions');
  if (!status) return;
  status.textContent = 'Diagnosticando IA local…';
  actions.innerHTML = '';

  const heal = await healOllama((msg) => { status.textContent = msg; });
  const extra = [];
  if (state.groqKey) extra.push('Groq conectado');
  if (state.openrouterKey) extra.push('OpenRouter conectado');
  const extraTxt = extra.length ? ` · Nube: ${extra.join(', ')}` : '';

  if (heal.ok) {
    status.innerHTML = `<span class="pos">${icon('check', 14)} Coach IA listo</span> — Ollama local con ${heal.models.length} modelo(s): ${escapeHtml(heal.models.slice(0, 3).join(', '))}${extraTxt}`;
    return;
  }

  if (heal.stage === 'no-model') {
    status.innerHTML = `<span class="neg">${icon('warn', 14)} ${escapeHtml(heal.detail)}</span>${extraTxt}`;
    actions.innerHTML = `<button class="btn" id="pln-fix-pull">${icon('download', 15)} Descargar modelo ${DEFAULT_MODEL} (~2 GB, una sola vez)</button>`;
    actions.querySelector('#pln-fix-pull').addEventListener('click', () => pullModel(container));
  } else if (heal.stage === 'not-installed') {
    status.innerHTML = `<span class="neg">${icon('warn', 14)} ${escapeHtml(heal.detail)}</span>${extraTxt}`;
    actions.innerHTML = `
      <button class="btn" id="pln-fix-install">${icon('install', 15)} Instalar Ollama automáticamente (descarga + instalación silenciosa + modelo)</button>
      <p class="hint" style="margin-top:6px">Requisitos: ~4 GB de disco y 8 GB de RAM recomendados. Todo local y gratuito.</p>`;
    actions.querySelector('#pln-fix-install').addEventListener('click', () => installOllama(container));
  } else { // start-failed
    status.innerHTML = `<span class="neg">${icon('warn', 14)} ${escapeHtml(heal.detail)}</span>${extraTxt}`;
    actions.innerHTML = `
      <div class="error-box">Pasos manuales: 1) Menú Inicio → escribe "Ollama" → ábrelo. 2) Si no aparece, reinstálalo con el botón de abajo. 3) Si sigue fallando, reinicia el PC (otro proceso puede estar ocupando el puerto 11434).</div>
      <button class="btn secondary" id="pln-fix-retry">${icon('refresh', 15)} Reintentar diagnóstico</button>
      <button class="btn" id="pln-fix-reinstall">${icon('install', 15)} Reinstalar Ollama</button>`;
    actions.querySelector('#pln-fix-retry').addEventListener('click', () => refreshAIStatus(container));
    actions.querySelector('#pln-fix-reinstall').addEventListener('click', () => installOllama(container));
  }
}

function showProgress(container, show) {
  const box = container.querySelector('#pln-ai-progress');
  if (box) box.style.display = show ? 'block' : 'none';
}

function wireProgress(container) {
  const bar = container.querySelector('#pln-ai-bar');
  const txt = container.querySelector('#pln-ai-progress-txt');
  return window.albion.onOllamaProgress((p) => {
    if (!bar || !txt) return;
    if (p.phase === 'download') { txt.textContent = `Descargando instalador de Ollama… ${p.pct ?? 0}%`; bar.style.width = (p.pct ?? 0) + '%'; }
    else if (p.phase === 'install') { txt.textContent = 'Instalando Ollama (silencioso)…'; bar.style.width = '100%'; }
    else if (p.phase === 'start') { txt.textContent = 'Arrancando el servidor de IA…'; }
    else if (p.phase === 'pull') { txt.textContent = `Descargando modelo: ${p.status || ''} ${p.pct !== null && p.pct !== undefined ? p.pct + '%' : ''}`; if (p.pct) bar.style.width = p.pct + '%'; }
  });
}

async function installOllama(container) {
  const status = container.querySelector('#pln-ai-status');
  const actions = container.querySelector('#pln-ai-actions');
  actions.innerHTML = '';
  showProgress(container, true);
  const unsub = wireProgress(container);
  try {
    status.textContent = 'Instalando Ollama…';
    const res = await window.albion.ollamaInstall();
    if (!res.ok) throw new Error(res.error || 'instalación fallida');
    status.textContent = 'Ollama instalado — descargando el modelo…';
    const pull = await window.albion.ollamaPull(DEFAULT_MODEL);
    if (!pull.ok) throw new Error(pull.error || 'descarga del modelo fallida');
  } catch (e) {
    container.querySelector('#pln-ai-progress-txt').textContent = '';
    status.innerHTML = `<span class="neg">Error: ${escapeHtml(String(e.message))}</span> — puedes instalarlo a mano desde <b>ollama.com</b> y pulsar Reintentar.`;
    actions.innerHTML = `<button class="btn secondary" id="pln-fix-retry2">${icon('refresh', 15)} Reintentar diagnóstico</button>`;
    actions.querySelector('#pln-fix-retry2').addEventListener('click', () => refreshAIStatus(container));
    unsub(); showProgress(container, false);
    return;
  }
  unsub(); showProgress(container, false);
  refreshAIStatus(container);
}

async function pullModel(container) {
  const status = container.querySelector('#pln-ai-status');
  const actions = container.querySelector('#pln-ai-actions');
  actions.innerHTML = '';
  showProgress(container, true);
  const unsub = wireProgress(container);
  try {
    status.textContent = `Descargando ${DEFAULT_MODEL}…`;
    const pull = await window.albion.ollamaPull(DEFAULT_MODEL);
    if (!pull.ok) throw new Error(pull.error || 'descarga fallida');
  } catch (e) {
    status.innerHTML = `<span class="neg">Error descargando el modelo: ${escapeHtml(String(e.message))}</span> — comprueba tu conexión y reintenta.`;
    actions.innerHTML = `<button class="btn secondary" id="pln-fix-retry3">${icon('refresh', 15)} Reintentar</button>`;
    actions.querySelector('#pln-fix-retry3').addEventListener('click', () => refreshAIStatus(container));
    unsub(); showProgress(container, false);
    return;
  }
  unsub(); showProgress(container, false);
  refreshAIStatus(container);
}

async function run(container, getTarget) {
  const results = container.querySelector('#pln-results');
  const goBtn = container.querySelector('#pln-go');
  const target = getTarget();
  const capital = Number(container.querySelector('#pln-capital').value);
  goBtn.disabled = true;

  const progress = (msg) => {
    results.innerHTML = `<div class="loading"><span class="spinner"></span>${escapeHtml(msg)}</div>`;
  };

  try {
    const { plans } = await buildPlans(target, capital, progress);

    if (!plans.length) {
      results.innerHTML = `<div class="card"><p>No hay oportunidades rentables con datos de las últimas ${state.maxDataAgeMin < 60 ? state.maxDataAgeMin + ' min' : (state.maxDataAgeMin / 60) + ' h'} ahora mismo.
        Prueba a ampliar la "Frescura de datos" en el panel izquierdo (con ventanas muy cortas dependes de que alguien haya escaneado ese mercado hace minutos),
        vuelve a intentarlo en un rato o cambia de servidor.</p></div>`;
      goBtn.disabled = false;
      return;
    }

    const targetLabel = (target / 1e6).toLocaleString('es', { maximumFractionDigits: 1 }) + 'M';
    results.innerHTML = `
      <div class="cards-row">
        <div class="stat-card"><div class="stat-label">Objetivo</div><div class="stat-value gold">${targetLabel}</div></div>
        <div class="stat-card"><div class="stat-label">Ruta más rápida</div><div class="stat-value pos">${plans[0].days < 1 ? Math.ceil(plans[0].days * 24) + ' h' : plans[0].days.toFixed(1) + ' días'}</div><div class="stat-sub">${Math.ceil(plans[0].activeHours)} h activas de juego</div></div>
        <div class="stat-card"><div class="stat-label">Mejor plata/h activa</div><div class="stat-value">${fmt(Math.max(...plans.map(p => p.silverPerActiveHour)))}</div></div>
      </div>

      ${plans.map((p, i) => `
        <div class="strategy">
          <div class="strategy-head">
            <h3><span class="rank">${i + 1}º</span> ${escapeHtml(p.title)}</h3>
            <span class="badge ${p.detail?.risky || p.kind === 'blackmarket' ? 'risk' : 'safe'}">${p.detail?.risky || p.kind === 'blackmarket' ? 'Riesgo: zona roja' : 'Riesgo bajo'}</span>
            <span class="badge diff-2">${fmt(p.silverPerActiveHour)}/h activa</span>
          </div>
          <p><b>${icon('clock', 14)} ${p.days < 1 ? Math.ceil(p.days * 24) + ' horas' : p.days.toFixed(1) + ' días'}</b>
             (${Math.ceil(p.activeHours)} h activas en ${p.cycles} ciclos) ·
             <b>${icon('coin', 14)} Inversión: ${fmt(p.effCapital)}</b> ·
             ~${fmt(p.effProfit)}/ciclo${p.capitalShort ? ' · <span class="neg">capital corto: con más irías más rápido</span>' : ''}</p>
          <div style="background:var(--bg);border:1px solid var(--border);border-radius:8px;padding:12px;font-size:13px;line-height:1.7">${mdToHtml(templateNarration(p, target))}</div>
        </div>`).join('')}

      <div class="card" id="pln-ai-card">
        <h3>${icon('spark', 18)} Análisis del coach IA</h3>
        <div id="pln-ai-out" class="loading"><span class="spinner"></span>Preparando narración…</div>
      </div>
      <p class="hint">Los tiempos son estimaciones conservadoras con datos de este momento: los precios se mueven — regenera el plan cada sesión.
        Verifica la primera compra en el juego antes de meter todo el capital.</p>
    `;

    // AI narration of the top plan (async, never blocks the plan itself)
    const aiOut = results.querySelector('#pln-ai-out');
    const planSummary = plans.slice(0, 3).map((p, i) => `PLAN ${i + 1}: ${p.title}\n${templateNarration(p, target)}`).join('\n\n');
    const answer = await askAI(
      AI_SYSTEM_PROMPT,
      `Objetivo del jugador: ${targetLabel} de plata. Capital: ${fmt(capital)}. Premium: ${state.premium ? 'sí' : 'no'}. Servidor: ${state.server}.\n\nPLANES CALCULADOS (datos reales):\n${planSummary}\n\nNarra el PLAN 1 paso a paso como coach, menciona brevemente cuándo convendría el 2 como alternativa.`,
      (msg) => { aiOut.innerHTML = `<span class="spinner"></span>${escapeHtml(msg)}`; }
    );

    if (answer) {
      aiOut.className = '';
      aiOut.innerHTML = `<div style="font-size:13px;line-height:1.7">${mdToHtml(answer.text)}</div>
        <p class="hint" style="margin-top:8px">Narrado por ${escapeHtml(answer.provider)} — los números provienen del motor de datos, no de la IA.</p>`;
    } else {
      results.querySelector('#pln-ai-card').remove();
    }
  } catch (e) {
    results.innerHTML = `<div class="error-box">Error generando el plan: ${escapeHtml(e.message)}</div>`;
  }
  goBtn.disabled = false;
}
