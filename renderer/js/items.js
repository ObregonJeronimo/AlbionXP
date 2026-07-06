// Item metadata: unique names + Spanish localized names, search index, icons.
// Source: ao-data/ao-bin-dumps (cached locally by the main process for 7 days).

const ITEMS_URL = 'https://raw.githubusercontent.com/ao-data/ao-bin-dumps/master/formatted/items.json';

// index entries: { id: UniqueName, es: Spanish name, en: English name, tier, ench, searchKey }
export const itemIndex = [];
export const itemById = new Map();

function parseTier(uniqueName) {
  const m = /^T(\d)_/.exec(uniqueName);
  return m ? Number(m[1]) : 0;
}

function parseEnch(uniqueName) {
  const m = /@(\d)$/.exec(uniqueName);
  return m ? Number(m[1]) : 0;
}

function normalize(s) {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

export async function loadItemIndex() {
  const res = await window.albion.fetchCachedText('items.json', ITEMS_URL, 7);
  if (!res.ok) throw new Error(res.error || 'descarga fallida');
  const raw = JSON.parse(res.data);

  for (const it of raw) {
    const id = it.UniqueName;
    if (!id) continue;
    const names = it.LocalizedNames;
    if (!names) continue; // skip items without display names (debug/internal)
    const es = names['ES-ES'] || names['EN-US'];
    const en = names['EN-US'] || es;
    if (!es) continue;
    const entry = {
      id,
      es,
      en,
      tier: parseTier(id),
      ench: parseEnch(id),
      searchKey: normalize(es) + ' ' + normalize(en) + ' ' + id.toLowerCase(),
    };
    itemIndex.push(entry);
    itemById.set(id, entry);
  }
  return itemIndex.length;
}

export function itemName(id) {
  const e = itemById.get(id);
  if (e) return e.es;
  // Fall back: strip @ench for base-name lookup
  const base = itemById.get(id.replace(/@\d$/, ''));
  return base ? base.es : id;
}

export function searchItems(query, limit = 30) {
  const q = normalize(query.trim());
  if (q.length < 2) return [];
  const terms = q.split(/\s+/);
  const out = [];
  for (const e of itemIndex) {
    if (terms.every(t => e.searchKey.includes(t))) {
      out.push(e);
      if (out.length >= limit * 4) break; // gather extra, then rank
    }
  }
  // Rank: exact prefix on Spanish name first, then shorter names (base items) first
  out.sort((a, b) => {
    const ap = normalize(a.es).startsWith(q) ? 0 : 1;
    const bp = normalize(b.es).startsWith(q) ? 0 : 1;
    if (ap !== bp) return ap - bp;
    return a.es.length - b.es.length || a.tier - b.tier || a.ench - b.ench;
  });
  return out.slice(0, limit);
}

export function iconUrl(id, quality = 1, size = 64) {
  return `https://render.albiononline.com/v1/item/${encodeURIComponent(id)}.png?quality=${quality}&size=${size}`;
}

// ---------- Reusable item-search autocomplete widget ----------
export function attachItemSearch(inputEl, onPick) {
  const wrap = inputEl.parentElement; // .item-search
  const sug = document.createElement('div');
  sug.className = 'item-suggestions';
  wrap.appendChild(sug);
  let items = [];
  let sel = -1;

  function close() { sug.classList.remove('open'); sel = -1; }

  function render() {
    sug.innerHTML = items.map((e, i) => `
      <div class="item-sug ${i === sel ? 'sel' : ''}" data-i="${i}">
        <img src="${iconUrl(e.id, 1, 32)}" loading="lazy" alt="" />
        <span>${e.es}${e.ench ? ` .${e.ench}` : ''}</span>
        <span class="sug-id">${e.id}</span>
      </div>`).join('');
    sug.classList.toggle('open', items.length > 0);
  }

  inputEl.addEventListener('input', () => {
    items = searchItems(inputEl.value);
    sel = -1;
    render();
  });

  inputEl.addEventListener('keydown', (e) => {
    if (!sug.classList.contains('open')) return;
    if (e.key === 'ArrowDown') { sel = Math.min(sel + 1, items.length - 1); render(); e.preventDefault(); }
    else if (e.key === 'ArrowUp') { sel = Math.max(sel - 1, 0); render(); e.preventDefault(); }
    else if (e.key === 'Enter' && sel >= 0) { pick(items[sel]); e.preventDefault(); }
    else if (e.key === 'Escape') close();
  });

  function pick(entry) {
    inputEl.value = entry.es;
    close();
    onPick(entry);
  }

  sug.addEventListener('mousedown', (e) => {
    const row = e.target.closest('.item-sug');
    if (row) { pick(items[Number(row.dataset.i)]); e.preventDefault(); }
  });

  inputEl.addEventListener('blur', () => setTimeout(close, 150));
}
