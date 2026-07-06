// Ad engine: rotating corner banner + slim top banner, present in every view,
// never blocking. Ads load from the worker (`/ads`) so campaigns change without
// recompiling; falls back to local house ads. Tracks view-seconds and clicks
// (batched, anonymous: adId + counters only).
import { APP_CONFIG } from './config.js';
import { session } from './auth.js';
import { escapeHtml } from './state.js';

// House ads (fallback + placeholders you can edit). type: 'affiliate' | 'sponsor' | 'house'
const HOUSE_ADS = [
  {
    id: 'house-sponsor-slot',
    title: 'Tu anuncio aquí',
    body: 'Patrociná Albion Silver Hub: tu gremio, coaching o tienda ante cientos de traders.',
    url: 'mailto:jeroobregon03@gmail.com?subject=Patrocinio%20Albion%20Silver%20Hub',
    color: '#d9a441',
  },
  {
    id: 'house-community',
    title: 'Sumate a la comunidad',
    body: 'Guías, novedades y foro en la web del sistema.',
    url: 'https://albion-xp.vercel.app/',
    color: '#86b0d6',
  },
];

let ads = [];
let current = 0;
let rotateTimer = null;
let shownAt = 0;
let cpmFrame = null;   // { enabled, url, height } — CPM ad served in a sandboxed iframe
// pending stats: adId -> { seconds, clicks, views }
const pending = new Map();
let flushTimer = null;

function adsUrl() {
  if (APP_CONFIG.monetization.adsUrl) return APP_CONFIG.monetization.adsUrl;
  if (APP_CONFIG.payments.workerUrl) return `${APP_CONFIG.payments.workerUrl}/ads`;
  return null;
}

export function adsDisabled() {
  // Premium subscribers browse clean
  return Boolean(session.sub?.active && !session.sub?.local && !session.sub?.trial);
}

async function loadAds() {
  const url = adsUrl();
  if (url) {
    try {
      const res = await window.albion.fetchJson(url);
      if (res.ok && Array.isArray(res.data?.ads) && res.data.ads.length) {
        return res.data.ads.filter(a => a.id && a.title && a.url);
      }
    } catch (_) { /* fall back */ }
  }
  return HOUSE_ADS;
}

function track(adId, field, amount = 1) {
  if (!pending.has(adId)) pending.set(adId, { seconds: 0, clicks: 0, views: 0 });
  pending.get(adId)[field] += amount;
  if (!flushTimer) flushTimer = setTimeout(flush, 60 * 1000);
}

async function flush() {
  flushTimer = null;
  const url = APP_CONFIG.payments.workerUrl;
  if (!url || !pending.size) { pending.clear(); return; }
  const batch = [...pending.entries()].map(([id, s]) => ({ id, ...s }));
  pending.clear();
  try { await window.albion.postJson(`${url}/ads/track`, { batch }); } catch (_) { /* best-effort */ }
}

function settleCurrent() {
  if (!ads.length || !shownAt) return;
  const secs = Math.round((Date.now() - shownAt) / 1000);
  if (secs > 0) track(ads[current].id, 'seconds', Math.min(secs, 300));
}

function renderAd() {
  if (!ads.length) return;
  const ad = ads[current];
  shownAt = Date.now();
  track(ad.id, 'views');

  for (const el of document.querySelectorAll('.ad-slot')) {
    el.innerHTML = `
      <div class="ad-unit" data-ad="${escapeHtml(ad.id)}" style="--ad-color:${escapeHtml(ad.color || '#58a6ff')}">
        <span class="ad-tag">AD</span>
        <div class="ad-copy">
          <div class="ad-title">${escapeHtml(ad.title)}</div>
          ${ad.body ? `<div class="ad-body">${escapeHtml(ad.body)}</div>` : ''}
        </div>
      </div>`;
    el.querySelector('.ad-unit').addEventListener('click', () => {
      track(ad.id, 'clicks');
      if (ad.url === '#premium') {
        // In free-ads mode, the paywall doubles as the premium upsell
        import('./views/gate.js').then(m => m.showPaywall().then(() => {
          document.getElementById('auth-gate').style.display = 'none';
          refreshVisibility();
        }));
      } else if (/^(https?:|mailto:)/i.test(ad.url)) {
        window.albion.openExternal(ad.url);
      }
    });
  }
}

function rotate() {
  settleCurrent();
  current = (current + 1) % ads.length;
  renderAd();
}

// CPM ad in a SANDBOXED iframe. The ad network's script runs on a real web page
// (ad-frame.html on the site), never inside the app — the sandbox + cross-origin
// boundary keep it from touching anything. Enabled/configured from appconfig.json.
function renderCpmFrame() {
  const slot = document.getElementById('ad-cpm');
  if (!slot) return;
  const f = cpmFrame;
  if (!f || !f.enabled || !f.url || adsDisabled()) { slot.style.display = 'none'; slot.innerHTML = ''; return; }
  if (!/^https:\/\//i.test(f.url)) { slot.style.display = 'none'; return; }
  const h = Math.max(50, Math.min(300, Number(f.height) || 90));
  slot.style.display = 'flex';
  slot.innerHTML = `<iframe src="${escapeHtml(f.url)}" title="ad"
    sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
    scrolling="no" referrerpolicy="no-referrer"
    style="width:100%;max-width:970px;height:${h}px;border:0;display:block"></iframe>`;
}

export function refreshVisibility() {
  const off = adsDisabled();
  for (const el of document.querySelectorAll('.ad-slot')) {
    el.style.display = off ? 'none' : '';
  }
  renderCpmFrame();
}

export async function initAds(remoteAds, adFrame) {
  cpmFrame = adFrame || null;
  if (APP_CONFIG.monetization.mode !== 'free-ads') {
    for (const el of document.querySelectorAll('.ad-slot')) el.style.display = 'none';
    renderCpmFrame();
    return;
  }
  // Ads from the remote config take priority; otherwise adsUrl/house ads.
  ads = (Array.isArray(remoteAds) && remoteAds.length)
    ? remoteAds.filter(a => a.id && a.title && a.url)
    : await loadAds();
  if (!ads.length) ads = HOUSE_ADS;
  renderCpmFrame();
  if (!ads.length) return;
  // Shuffle the starting ad so all campaigns get first-view time
  current = Math.floor(Math.random() * ads.length);
  renderAd();
  refreshVisibility();
  const secs = Math.max(15, Number(APP_CONFIG.monetization.rotateSeconds) || 45);
  rotateTimer = setInterval(rotate, secs * 1000);
  window.addEventListener('beforeunload', () => { settleCurrent(); flush(); });
}
