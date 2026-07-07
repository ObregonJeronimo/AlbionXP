// App shell: navigation, settings, auth gate, and boot sequence.
import { state, loadSettings, saveSettings } from './state.js';
import { loadItemIndex } from './items.js';
import { APP_CONFIG, isDistributionMode } from './config.js';
import { restoreSession, checkSubscription, session } from './auth.js';
import { showAuthGate, showPaywall, hideGate } from './views/gate.js';
import { initAds, refreshVisibility } from './ads.js';
import { initUpdater } from './updater.js';
import { loadRemoteConfig } from './remoteconfig.js';
import { icon, help, VIEW_ICON } from './icons.js';
import { applyTooltips } from './tooltips.js';

// Inject monochrome icons into the sidebar (brand + nav items) — no emojis.
function renderNavIcons() {
  const brand = document.querySelector('.brand-icon');
  if (brand) brand.innerHTML = icon('sigil', 24);
  document.querySelectorAll('.nav-item').forEach(btn => {
    const v = btn.dataset.view;
    const ico = btn.querySelector('.nav-ico');
    if (ico && VIEW_ICON[v]) ico.innerHTML = icon(VIEW_ICON[v], 18);
  });
}

// Anonymous "online now" heartbeat for the private admin panel (opt-in via
// analyticsUrl in appconfig). No personal data — just a random per-install id.
async function startHeartbeat(analyticsUrl) {
  if (!analyticsUrl) return;
  const url = analyticsUrl.replace(/\/$/, '') + '/beat';
  let s = {};
  try { s = await window.albion.getSettings(); } catch (_) { /* ignore */ }
  let sid = s && s.anonId;
  if (!sid) {
    sid = (self.crypto && crypto.randomUUID) ? crypto.randomUUID() : 'a' + Math.random().toString(36).slice(2) + Date.now().toString(36);
    try { await window.albion.setSettings({ anonId: sid }); } catch (_) { /* ignore */ }
  }
  const beat = () => { window.albion.postJson(url, { sid }).catch(() => {}); };
  beat();
  // Cada 5 min (no 60s): 5x menos escrituras en el backend. Para "online ahora"
  // una resolución de 5 min sobra, y evita agotar la cuota gratuita a escala.
  setInterval(beat, 300000);
}

// Community links (web / forum / donate) — open in the browser.
function renderCommunityLinks() {
  const c = APP_CONFIG.community || {};
  const el = document.getElementById('community-links');
  if (!el) return;
  const links = [];
  if (c.siteUrl) links.push(['web', 'Web', c.siteUrl]);
  if (c.forumUrl) links.push(['foro', 'Foro', c.forumUrl]);
  if (c.donateUrl) links.push(['donar', 'Donar', c.donateUrl]);
  el.innerHTML = links.map(([ic, t, u]) =>
    `<a href="#" data-url="${u}">${icon(ic, 14)} ${t}</a>`).join('');
  el.querySelectorAll('a').forEach(a => a.addEventListener('click', (e) => {
    e.preventDefault();
    window.albion.openExternal(a.dataset.url);
  }));
}

import { renderDashboard } from './views/dashboard.js';
import { renderCompare } from './views/compare.js';
import { renderFlip } from './views/flip.js';
import { renderSniper } from './views/sniper.js';
import { renderVolume } from './views/volume.js';
import { renderPlanner } from './views/planner.js';
import { renderRefine } from './views/refine.js';
import { renderCraft } from './views/craft.js';
import { renderBlackMarket } from './views/blackmarket.js';
import { renderGold } from './views/gold.js';
import { renderGuide } from './views/guide.js';
import { renderForum } from './views/forum.js';

const VIEWS = {
  dashboard: renderDashboard,
  compare: renderCompare,
  flip: renderFlip,
  sniper: renderSniper,
  volume: renderVolume,
  planner: renderPlanner,
  refine: renderRefine,
  craft: renderCraft,
  blackmarket: renderBlackMarket,
  gold: renderGold,
  guide: renderGuide,
  forum: renderForum,
};

const container = document.getElementById('view-container');
let currentView = 'dashboard';

export function navigate(view, params = {}) {
  if (!VIEWS[view]) return;
  currentView = view;
  document.querySelectorAll('.nav-item').forEach(b =>
    b.classList.toggle('active', b.dataset.view === view));
  container.innerHTML = '';
  VIEWS[view](container, params);
  decorateTitle(view);
  applyTooltips(view);
  stripEmojis(container); // sincrónico: sin parpadeo de emojis antes del repintado
}

// No emojis anywhere: strip pictographic emoji from text nodes at runtime,
// keeping geometric symbols we use intentionally (▲ ▼ ◆ ‹ › → arrows).
const EMOJI_RE = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}\u{200D}]/gu;
function stripEmojis(root) {
  if (!root) return;
  const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const hits = [];
  let n;
  while ((n = w.nextNode())) { EMOJI_RE.lastIndex = 0; if (EMOJI_RE.test(n.nodeValue)) hits.push(n); }
  for (const t of hits) { EMOJI_RE.lastIndex = 0; t.nodeValue = t.nodeValue.replace(EMOJI_RE, '').replace(/[ \t]{2,}/g, ' '); }
}

// One observer: strip emojis BEFORE the next paint (rAF → no visible flash even
// on async content) and re-apply tooltips as result tables render.
const APP_ROOT = document.getElementById('app');
let _rafPending = false, _tipTimer = null;
new MutationObserver(() => {
  if (!_rafPending) {
    _rafPending = true;
    requestAnimationFrame(() => { _rafPending = false; stripEmojis(APP_ROOT); });
  }
  clearTimeout(_tipTimer);
  _tipTimer = setTimeout(() => applyTooltips(currentView), 110);
}).observe(APP_ROOT, { childList: true, subtree: true });

// Replace any leading emoji in the view title with our monochrome icon.
function decorateTitle(view) {
  const el = container.querySelector('.view-title');
  if (!el || !VIEW_ICON[view]) return;
  if (el.querySelector('.ic')) return; // already decorated
  const txt = el.textContent.replace(/^[\u{1F000}-\u{1FAFF}←-⯿️‍\s]+/u, '').trim();
  el.innerHTML = `${icon(VIEW_ICON[view], 26)}<span>${txt.replace(/[&<>]/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[m]))}</span>`;
}

// Re-render current view (e.g. after server change)
function refresh() { navigate(currentView); }

document.getElementById('nav').addEventListener('click', (e) => {
  const btn = e.target.closest('.nav-item');
  if (btn) navigate(btn.dataset.view);
});

// ---------- Settings wiring ----------
const serverSel = document.getElementById('set-server');
const premiumChk = document.getElementById('set-premium');

serverSel.addEventListener('change', async () => {
  state.server = serverSel.value;
  await saveSettings();
  refresh();
});

premiumChk.addEventListener('change', async () => {
  state.premium = premiumChk.checked;
  await saveSettings();
  refresh();
});

const freshSel = document.getElementById('set-freshness');
freshSel.addEventListener('change', async () => {
  state.maxDataAgeMin = Number(freshSel.value);
  await saveSettings();
  refresh();
});

// ---------- Boot ----------
(async function boot() {
  renderNavIcons();
  wireSettingsHelp();
  await loadSettings();
  serverSel.value = state.server;
  premiumChk.checked = state.premium;
  freshSel.value = String(state.maxDataAgeMin);

  // Firebase configured = forum login available. We NEVER gate the app for the
  // forum: we just restore any prior session silently so the forum knows who you
  // are. The full-screen gate/paywall only runs in the (unused) subscription mode.
  if (isDistributionMode()) {
    await restoreSession();
    if (APP_CONFIG.monetization.mode === 'subscription') {
      if (!session.idToken) await showAuthGate();
      let sub = await checkSubscription();
      while (!sub.active) {
        await showPaywall();
        sub = await checkSubscription();
      }
      hideGate();
    }
  }

  // Remote config (community links + ads) — editable from the site, no rebuild.
  const remote = await loadRemoteConfig();
  if (remote && remote.community) Object.assign(APP_CONFIG.community, remote.community);
  startHeartbeat(remote && remote.analyticsUrl);

  navigate('dashboard');
  renderCommunityLinks();
  initUpdater();
  initAds(remote && remote.ads, remote && remote.adFrame);
  refreshVisibility();

  const status = document.getElementById('data-status');
  try {
    const n = await loadItemIndex();
    status.innerHTML = `${icon('check', 12)} ${n.toLocaleString('es')} items cargados`;
    status.className = 'data-status ok';
    // Re-render so item search boxes become live
    refresh();
  } catch (e) {
    status.textContent = 'Error cargando items: ' + e.message;
    status.className = 'data-status err';
  }
})();

// Help "?" tooltips on the global settings (they affect every calculation).
function wireSettingsHelp() {
  const add = (labelSel, text, side = 'right') => {
    const el = document.querySelector(labelSel);
    if (el && !el.querySelector('.help-dot')) el.insertAdjacentHTML('beforeend', ' ' + help(text, side));
  };
  add('#settings-panel .set-row:nth-of-type(1) span',
    'Servidor de Albion en el que jugás. Cada servidor tiene su propio mercado y precios: elegí el tuyo (América, Europa o Asia).');
  add('label[for]', ''); // no-op guard
  const prem = document.querySelector('#set-premium')?.closest('.set-check');
  if (prem && !prem.querySelector('.help-dot')) prem.insertAdjacentHTML('beforeend', ' ' + help('Marcá esto si en Albion tenés Premium activo. Con Premium el juego cobra 4% de impuesto al vender; sin Premium, 8%. Cambia TODOS los cálculos de la app, así que ponelo igual que tu cuenta real.', 'right'));
  const fresh = [...document.querySelectorAll('#settings-panel .set-row span')].find(s => /Frescura/.test(s.textContent));
  if (fresh && !fresh.querySelector('.help-dot')) fresh.insertAdjacentHTML('beforeend', ' ' + help('Qué tan viejos pueden ser los precios que usa la app. Los aporta la comunidad, no son en vivo. Menos tiempo = datos más confiables pero menos resultados; más tiempo = más resultados pero algunos pueden haber cambiado.', 'right'));
}

// Expose navigate for views that cross-link (guide -> tools)
window.__navigate = navigate;
