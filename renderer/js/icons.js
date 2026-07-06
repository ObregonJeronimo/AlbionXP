// Minimalist monochrome line-icon set (stroke = currentColor).
// One consistent style: 24-grid, 1.7 stroke, round joins. No emojis anywhere.
const PATHS = {
  // --- navigation / tools ---
  dashboard: '<rect x="3" y="3" width="7.5" height="7.5" rx="1.4"/><rect x="13.5" y="3" width="7.5" height="7.5" rx="1.4"/><rect x="3" y="13.5" width="7.5" height="7.5" rx="1.4"/><rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1.4"/>',
  plan: '<circle cx="12" cy="12" r="9"/><path d="M15.5 8.5 13 13l-4.5 2.5L11 11z"/>',
  compare: '<path d="M12 3v18"/><path d="M4 20h16"/><path d="M6 7 3.5 13a3 3 0 0 0 5 0L6 7z"/><path d="M18 7l-2.5 6a3 3 0 0 0 5 0L18 7z"/><path d="M4.5 7h6M13.5 7h6"/>',
  transporte: '<path d="M3 6.5A1.5 1.5 0 0 1 4.5 5h9A1.5 1.5 0 0 1 15 6.5V17H3z"/><path d="M15 9h3.5l2.5 3.2V17h-6z"/><circle cx="7" cy="17.5" r="2"/><circle cx="17.5" cy="17.5" r="2"/>',
  sniper: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4.5"/><path d="M12 1.5v3.5M12 19v3.5M1.5 12h3.5M19 12h3.5"/>',
  movimiento: '<path d="M3 15l4-5 3.5 3.5L15 7l2.5 3H21"/><path d="M3 20h18"/>',
  refinado: '<path d="M12 2 4.5 8 12 22l7.5-14z"/><path d="M8.5 8h7"/><path d="M12 2v20"/>',
  crafteo: '<path d="M14.5 5.5 19 10l-2 2-4.5-4.5z"/><path d="M12.5 7.5 5 15c-.9.9-.9 2.3 0 3.2s2.3.9 3.2 0L15.7 11"/><path d="M15 4l5 5"/>',
  mercadonegro: '<path d="M20 13.5A8 8 0 1 1 10.5 4a6.3 6.3 0 0 0 9.5 9.5z"/>',
  oro: '<circle cx="12" cy="12" r="9"/><path d="M12 7v10"/><path d="M14.5 9.2c0-1.1-1.1-1.8-2.5-1.8s-2.5.7-2.5 1.7 1 1.5 2.5 1.7 2.5.7 2.5 1.8-1.1 1.8-2.5 1.8-2.5-.7-2.5-1.8"/>',
  guia: '<path d="M3 4.5A1.5 1.5 0 0 1 4.5 3H10a2.5 2.5 0 0 1 2 1 2.5 2.5 0 0 1 2-1h5.5A1.5 1.5 0 0 1 21 4.5V18a1 1 0 0 1-1 1h-6a2 2 0 0 0-2 2 2 2 0 0 0-2-2H4a1 1 0 0 1-1-1z"/><path d="M12 4v17"/>',
  foro: '<path d="M21 14a2 2 0 0 1-2 2H8l-4 4V6a2 2 0 0 1 2-2h13a2 2 0 0 1 2 2z"/><path d="M8 9h9M8 12.5h6"/>',
  // --- ui / actions ---
  web: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18"/><path d="M12 3a14 14 0 0 1 0 18 14 14 0 0 1 0-18z"/>',
  donar: '<path d="M12 20.5 4.5 13a4.6 4.6 0 0 1 6.5-6.5l1 1 1-1a4.6 4.6 0 0 1 6.5 6.5z"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5V21a2 2 0 0 1-4 0v-.1A1.6 1.6 0 0 0 9 19.4a1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H3a2 2 0 0 1 0-4h.1A1.6 1.6 0 0 0 4.6 9a1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H9a1.6 1.6 0 0 0 1-1.5V3a2 2 0 0 1 4 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V9a1.6 1.6 0 0 0 1.5 1H21a2 2 0 0 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1z"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9.2 9a2.8 2.8 0 0 1 5.4 1c0 1.9-2.8 2.5-2.8 2.5"/><path d="M12 17h.01"/>',
  download: '<path d="M12 3v12"/><path d="M7 10.5 12 15.5 17 10.5"/><path d="M4 20h16"/>',
  refresh: '<path d="M20 11A8 8 0 0 0 6.3 6.3L3 9"/><path d="M3 4v5h5"/><path d="M4 13a8 8 0 0 0 13.7 4.7L21 15"/><path d="M21 20v-5h-5"/>',
  install: '<path d="M12 3v9"/><path d="M8 9l4 3 4-3"/><rect x="4" y="15" width="16" height="5" rx="1.5"/>',
  spark: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/>',
  server: '<rect x="3" y="4" width="18" height="7" rx="1.5"/><rect x="3" y="13" width="18" height="7" rx="1.5"/><path d="M7 7.5h.01M7 16.5h.01"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  warn: '<path d="M12 3 2.5 20h19z"/><path d="M12 10v4M12 17h.01"/>',
  external: '<path d="M14 4h6v6"/><path d="M20 4 10 14"/><path d="M18 13v6a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h6"/>',
  coin: '<ellipse cx="12" cy="6.5" rx="8" ry="3.2"/><path d="M4 6.5v6c0 1.8 3.6 3.2 8 3.2s8-1.4 8-3.2v-6"/><path d="M4 12.5c0 1.8 3.6 3.2 8 3.2s8-1.4 8-3.2"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/>',
  users: '<circle cx="9" cy="8" r="3.2"/><path d="M3 20a6 6 0 0 1 12 0"/><path d="M16 5.2a3.2 3.2 0 0 1 0 6"/><path d="M17.5 14.2A6 6 0 0 1 21 20"/>',
  logout: '<path d="M14 4h4a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-4"/><path d="M10 12H3"/><path d="M6 8l-4 4 4 4"/>',
  sigil: '<path d="M4 4l9 9"/><path d="M11 13l-2.5 2.5a2.1 2.1 0 1 1-3-3L8 12"/><path d="M20 4l-9 9"/><path d="M13 13l2.5 2.5a2.1 2.1 0 1 0 3-3L16 12"/><circle cx="12" cy="12" r="1.4"/>',
};

export function icon(name, size = 20, extraClass = '') {
  const p = PATHS[name] || PATHS.spark;
  return `<svg class="ic ${extraClass}" viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p}</svg>`;
}

// A nice inline help affordance: a "?" that reveals a tooltip on hover/focus.
export function help(text, side = 'top') {
  const t = String(text).replace(/"/g, '&quot;').replace(/</g, '&lt;');
  return `<button type="button" class="help-dot" data-tip="${t}" data-side="${side}" aria-label="Ayuda">${icon('help', 14)}</button>`;
}

// Map each app view to its icon name.
export const VIEW_ICON = {
  dashboard: 'dashboard', planner: 'plan', compare: 'compare', flip: 'transporte',
  sniper: 'sniper', volume: 'movimiento', refine: 'refinado', craft: 'crafteo',
  blackmarket: 'mercadonegro', gold: 'oro', guide: 'guia', forum: 'foro',
};
