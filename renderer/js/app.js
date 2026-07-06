// App shell: navigation, settings, auth gate, and boot sequence.
import { state, loadSettings, saveSettings } from './state.js';
import { loadItemIndex } from './items.js';
import { APP_CONFIG, isDistributionMode } from './config.js';
import { restoreSession, checkSubscription, session } from './auth.js';
import { showAuthGate, showPaywall, hideGate } from './views/gate.js';
import { initAds, refreshVisibility } from './ads.js';
import { initUpdater } from './updater.js';
import { loadRemoteConfig } from './remoteconfig.js';

// Community links (web / forum / donate) — open in the browser.
function renderCommunityLinks() {
  const c = APP_CONFIG.community || {};
  const el = document.getElementById('community-links');
  if (!el) return;
  const links = [];
  if (c.siteUrl) links.push(['🌐 Web', c.siteUrl]);
  if (c.forumUrl) links.push(['💬 Foro', c.forumUrl]);
  if (c.donateUrl) links.push(['❤️ Donar', c.donateUrl]);
  el.innerHTML = links.map(([t, u]) =>
    `<a href="#" data-url="${u}">${t}</a>`).join('');
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

  navigate('dashboard');
  renderCommunityLinks();
  initUpdater();
  initAds(remote && remote.ads, remote && remote.adFrame);
  refreshVisibility();

  const status = document.getElementById('data-status');
  try {
    const n = await loadItemIndex();
    status.textContent = `✓ ${n.toLocaleString('es')} items cargados`;
    status.className = 'data-status ok';
    // Re-render so item search boxes become live
    refresh();
  } catch (e) {
    status.textContent = 'Error cargando items: ' + e.message;
    status.className = 'data-status err';
  }
})();

// Expose navigate for views that cross-link (guide -> tools)
window.__navigate = navigate;
