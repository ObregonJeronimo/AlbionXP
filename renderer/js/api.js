// AODP (Albion Online Data Project) client.
// Crowdsourced data: prices can be 0 / stale — 0 is normalized to null and
// every record carries its timestamp so views can show data age.
import { state } from './state.js';

const HOSTS = {
  west: 'https://west.albion-online-data.com',
  east: 'https://east.albion-online-data.com',
  europe: 'https://europe.albion-online-data.com',
};

function host() { return HOSTS[state.server] || HOSTS.europe; }

// AODP rate limit: 100 req/min in production (live-verified 429 threshold,
// stricter than the documented 180). Stay comfortably under it.
// Serialized via a promise chain so concurrent callers can't burst past the gap.
const MIN_GAP_MS = 650;
let queue = Promise.resolve();
let lastRequest = 0;

function throttledFetch(url) {
  const turn = queue.then(async () => {
    const wait = lastRequest + MIN_GAP_MS - Date.now();
    if (wait > 0) await new Promise(r => setTimeout(r, wait));
    lastRequest = Date.now();
    return window.albion.fetchJson(url);
  });
  queue = turn.catch(() => {}); // keep the chain alive on errors
  return turn;
}

// Short-lived response cache so switching views doesn't refetch identical URLs.
const cache = new Map();
const CACHE_TTL_MS = 90 * 1000;

async function cachedGet(url) {
  const hit = cache.get(url);
  if (hit && Date.now() - hit.t < CACHE_TTL_MS) return hit.v;
  let res = await throttledFetch(url);
  if (!res.ok && res.status === 429) {
    // AODP saturado (100 req/min): esperamos y reintentamos una vez antes de rendirnos.
    await new Promise(r => setTimeout(r, 4000));
    res = await throttledFetch(url);
    if (!res.ok && res.status === 429) {
      throw new Error('El servidor de datos de la comunidad está saturado ahora mismo. Esperá un minuto y volvé a intentar.');
    }
  }
  if (!res.ok) throw new Error(res.error || `HTTP ${res.status}`);
  setCache(url, res.data);
  return res.data;
}

// Bound the cache so a long session can't grow it without limit (fuga de memoria lenta).
function setCache(url, data) {
  if (cache.size >= 300) {
    const now = Date.now();
    for (const [k, v] of cache) if (now - v.t >= CACHE_TTL_MS) cache.delete(k);
    if (cache.size >= 300) cache.delete(cache.keys().next().value); // evict oldest insertion
  }
  cache.set(url, { t: Date.now(), v: data });
}

const NO_DATE = '0001-01-01';

function nz(price, date) {
  // AODP uses 0 + year-0001 date for "no data"
  if (!price || !date || date.startsWith(NO_DATE)) return null;
  return price;
}

/**
 * Fetch current prices.
 * @param {string[]} itemIds
 * @param {string[]} locations city display names, e.g. ['Martlock','Fort Sterling','Black Market']
 * @param {number[]|null} qualities e.g. [1] for resources, null for all
 * @returns array of { item_id, city, quality, sellMin, sellMinDate, buyMax, buyMaxDate }
 */
export async function getPrices(itemIds, locations, qualities = [1]) {
  const ids = [...new Set(itemIds)];
  // AODP accepts space-less city names (FortSterling, BlackMarket) — canonical form
  const locParam = encodeURIComponent(locations.map(l => l.replace(/ /g, '')).join(','));
  const qParam = qualities ? `&qualities=${qualities.join(',')}` : '';

  // Chunk by URL length (server rejects overly long URLs)
  const base = `${host()}/api/v2/stats/prices/`;
  const suffix = `?locations=${locParam}${qParam}`;
  const budget = 3500 - base.length - suffix.length;

  const chunks = [];
  let cur = [];
  let len = 0;
  for (const id of ids) {
    if (len + id.length + 1 > budget && cur.length) { chunks.push(cur); cur = []; len = 0; }
    cur.push(id);
    len += id.length + 1;
  }
  if (cur.length) chunks.push(cur);

  const results = await Promise.all(
    chunks.map(c => cachedGet(base + c.map(encodeURIComponent).join(',') + suffix))
  );

  return results.flat().map(r => ({
    itemId: r.item_id,
    city: r.city,
    quality: r.quality,
    sellMin: nz(r.sell_price_min, r.sell_price_min_date),
    sellMinDate: r.sell_price_min_date,
    buyMax: nz(r.buy_price_max, r.buy_price_max_date),
    buyMaxDate: r.buy_price_max_date,
  }));
}

/**
 * Price history (daily or hourly averages).
 * @returns array of { location, itemId, quality, data: [{ itemCount, avgPrice, timestamp }] }
 */
export async function getHistory(itemId, { locations = null, quality = 1, timeScale = 24, days = 28 } = {}) {
  const end = new Date();
  const start = new Date(end.getTime() - days * 24 * 3600 * 1000);
  const d = (x) => `${x.getUTCFullYear()}-${x.getUTCMonth() + 1}-${x.getUTCDate()}`;
  let url = `${host()}/api/v2/stats/history/${encodeURIComponent(itemId)}.json?time-scale=${timeScale}`;
  // Known API quirk: time-scale=1 + date params returns [] — omit dates for hourly
  if (timeScale !== 1) url += `&date=${d(start)}&end_date=${d(end)}`;
  if (quality) url += `&qualities=${quality}`; // 0/undefined = all qualities
  if (locations && locations.length) url += `&locations=${encodeURIComponent(locations.map(l => l.replace(/ /g, '')).join(','))}`;
  const data = await cachedGet(url);
  return data.map(s => ({
    location: s.location,
    itemId: s.item_id,
    quality: s.quality,
    data: (s.data || []).map(p => ({
      itemCount: p.item_count,
      avgPrice: p.avg_price,
      timestamp: p.timestamp,
    })),
  }));
}

/** Gold price history: [{ price, timestamp }] (most recent first when using count) */
export async function getGold(count = 168) {
  return cachedGet(`${host()}/api/v2/stats/gold.json?count=${count}`);
}

/**
 * History for MANY items in one location (chunked). Used by the volume view.
 * Returns flat array of { location, itemId, quality, data: [{itemCount, avgPrice, timestamp}] }.
 */
export async function getHistoryMulti(itemIds, { location, timeScale = 1, quality = 1 } = {}) {
  const ids = [...new Set(itemIds)];
  const base = `${host()}/api/v2/stats/history/`;
  // Hourly quirk: date params can break time-scale=1 — rely on default window
  const suffix = `.json?time-scale=${timeScale}&qualities=${quality}` +
    `&locations=${encodeURIComponent(location.replace(/ /g, ''))}`;
  const budget = 3500 - base.length - suffix.length;

  const chunks = [];
  let cur = [];
  let len = 0;
  for (const id of ids) {
    if (len + id.length + 1 > budget && cur.length) { chunks.push(cur); cur = []; len = 0; }
    cur.push(id);
    len += id.length + 1;
  }
  if (cur.length) chunks.push(cur);

  const results = await Promise.all(
    chunks.map(c => cachedGet(base + c.map(encodeURIComponent).join(',') + suffix))
  );

  return results.flat().map(s => ({
    location: s.location,
    itemId: s.item_id,
    quality: s.quality,
    data: (s.data || []).map(p => ({
      itemCount: p.item_count,
      avgPrice: p.avg_price,
      timestamp: p.timestamp,
    })),
  }));
}
