// Global app state + settings persistence via main process.
export const state = {
  server: 'west',      // west | europe | east
  premium: true,       // affects sales tax 4% vs 8%
  maxDataAgeMin: 60,   // global data-freshness window (minutes) for scanners/planner
  groqKey: '',         // optional AI provider keys (empty = skipped in the chain)
  openrouterKey: '',
};

export async function loadSettings() {
  try {
    const s = await window.albion.getSettings();
    if (s && typeof s === 'object') {
      if (s.server) state.server = s.server;
      if (typeof s.premium === 'boolean') state.premium = s.premium;
      if (Number(s.maxDataAgeMin) > 0) state.maxDataAgeMin = Number(s.maxDataAgeMin);
      if (typeof s.groqKey === 'string') state.groqKey = s.groqKey;
      if (typeof s.openrouterKey === 'string') state.openrouterKey = s.openrouterKey;
    }
  } catch (_) { /* defaults */ }
}

export async function saveSettings() {
  try {
    await window.albion.setSettings({
      server: state.server,
      premium: state.premium,
      maxDataAgeMin: state.maxDataAgeMin,
      groqKey: state.groqKey,
      openrouterKey: state.openrouterKey,
    });
  } catch (_) { /* non-fatal */ }
}

// ---------- Shared formatting helpers ----------
export function fmt(n) {
  if (n === null || n === undefined || Number.isNaN(n)) return '—';
  return Math.round(n).toLocaleString('es');
}

export function fmtPct(x, digits = 1) {
  if (x === null || x === undefined || Number.isNaN(x)) return '—';
  return (x * 100).toFixed(digits) + '%';
}

// Age of a market data point from its ISO timestamp (AODP returns UTC without Z)
export function dataAge(isoTs) {
  if (!isoTs || isoTs.startsWith('0001')) return null;
  const ts = Date.parse(isoTs.endsWith('Z') ? isoTs : isoTs + 'Z');
  if (Number.isNaN(ts)) return null;
  return (Date.now() - ts) / 60000; // minutes
}

export function ageBadge(minutes) {
  if (minutes === null) return '<span class="age age-old">sin datos</span>';
  let cls = 'age-fresh', txt;
  if (minutes < 60) txt = `${Math.round(minutes)} min`;
  else if (minutes < 60 * 24) { txt = `${(minutes / 60).toFixed(1)} h`; cls = minutes < 60 * 6 ? 'age-fresh' : 'age-ok'; }
  else { txt = `${(minutes / 1440).toFixed(1)} d`; cls = 'age-old'; }
  return `<span class="age ${cls}">${txt}</span>`;
}

export function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}
