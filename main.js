const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn, execFile } = require('child_process');

// Auto-update via electron-updater (GitHub Releases provider). Optional at
// runtime: absent in dev, degrades gracefully if the release feed 404s.
let autoUpdater = null;
try { ({ autoUpdater } = require('electron-updater')); } catch (_) { /* dev without dep */ }

const USER_DATA = () => app.getPath('userData');
const CACHE_DIR = () => path.join(USER_DATA(), 'cache');

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

// IPC hardening: the renderer can only reach these hosts through the network
// bridge. Even if a bug injected script into the renderer, it couldn't call
// arbitrary servers (SSRF / exfiltration guard).
const ALLOWED_HOSTS = [
  /(^|\.)albion-online-data\.com$/,   // market data (AODP)
  /(^|\.)googleapis\.com$/,           // Firebase (Firestore, auth, token)
  /^raw\.githubusercontent\.com$/,    // item metadata + recipes
  /^cdn\.jsdelivr\.net$/,             // item metadata mirror
  /^render\.albiononline\.com$/,      // item icons
  /(^|\.)github\.io$/,                // appconfig.json / ads
  /^api\.groq\.com$/,                 // optional AI
  /^openrouter\.ai$/,                 // optional AI
  /^ollama\.com$/,                    // Ollama installer
  /^(127\.0\.0\.1|localhost)$/,       // local Ollama server
];
function hostAllowed(urlStr) {
  try { return ALLOWED_HOSTS.some((re) => re.test(new URL(urlStr).hostname)); }
  catch (_) { return false; }
}

// ---------- Generic JSON fetch in the main process (no CORS) ----------
async function fetchJson(url, timeoutMs = 25000, headers = {}) {
  if (!hostAllowed(url)) return { ok: false, status: 0, error: 'host no permitido' };
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { 'User-Agent': 'AlbionSilverHub/0.1 (desktop app)', ...headers },
    });
    if (!res.ok) return { ok: false, status: res.status, error: `HTTP ${res.status}` };
    const data = await res.json();
    return { ok: true, status: res.status, data };
  } catch (e) {
    return { ok: false, status: 0, error: String(e && e.message ? e.message : e) };
  } finally {
    clearTimeout(t);
  }
}

// ---------- Cached download of big metadata files (items, localizations) ----------
async function fetchCachedText(key, url, maxAgeDays = 7) {
  ensureDir(CACHE_DIR());
  const file = path.join(CACHE_DIR(), key);
  try {
    const st = fs.statSync(file);
    const ageMs = Date.now() - st.mtimeMs;
    if (ageMs < maxAgeDays * 24 * 3600 * 1000) {
      return { ok: true, fromCache: true, data: fs.readFileSync(file, 'utf8') };
    }
  } catch (_) { /* no cache yet */ }

  try {
    const res = await fetch(url, { headers: { 'User-Agent': 'AlbionSilverHub/0.1' } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    fs.writeFileSync(file, text, 'utf8');
    return { ok: true, fromCache: false, data: text };
  } catch (e) {
    // Network failed: fall back to stale cache if it exists
    if (fs.existsSync(file)) {
      return { ok: true, fromCache: true, stale: true, data: fs.readFileSync(file, 'utf8') };
    }
    return { ok: false, error: String(e && e.message ? e.message : e) };
  }
}

// ---------- Settings persistence ----------
function settingsFile() { return path.join(USER_DATA(), 'settings.json'); }

function getSettings() {
  try { return JSON.parse(fs.readFileSync(settingsFile(), 'utf8')); }
  catch (_) { return {}; }
}

function setSettings(patch) {
  const cur = getSettings();
  const next = { ...cur, ...patch };
  ensureDir(USER_DATA());
  fs.writeFileSync(settingsFile(), JSON.stringify(next, null, 2), 'utf8');
  return next;
}

// ---------- POST JSON (for AI providers: Ollama local, Groq, OpenRouter) ----------
async function postJson(url, body, headers = {}, timeoutMs = 120000) {
  if (!hostAllowed(url)) return { ok: false, status: 0, error: 'host no permitido' };
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: 'POST',
      signal: ctrl.signal,
      headers: { 'Content-Type': 'application/json', ...headers },
      // String bodies pass through untouched (e.g. form-urlencoded token refresh)
      body: typeof body === 'string' ? body : JSON.stringify(body),
    });
    const text = await res.text();
    let data = null;
    try { data = JSON.parse(text); } catch (_) { /* keep raw */ }
    return { ok: res.ok, status: res.status, data, raw: data ? undefined : text.slice(0, 500) };
  } catch (e) {
    return { ok: false, status: 0, error: String(e && e.message ? e.message : e) };
  } finally {
    clearTimeout(t);
  }
}

// ---------- Ollama management (auto-install / auto-start / model pull) ----------
const OLLAMA_HOST = 'http://127.0.0.1:11434';
const OLLAMA_INSTALLER_URL = 'https://ollama.com/download/OllamaSetup.exe';

function ollamaExePaths() {
  const local = process.env.LOCALAPPDATA || '';
  return [
    path.join(local, 'Programs', 'Ollama', 'ollama.exe'),
    path.join(local, 'Ollama', 'ollama.exe'),
    'C:\\Program Files\\Ollama\\ollama.exe',
  ];
}

function findOllamaExe() {
  for (const p of ollamaExePaths()) {
    try { if (fs.existsSync(p)) return p; } catch (_) { /* next */ }
  }
  return null;
}

async function ollamaServerUp(timeoutMs = 2500) {
  const r = await fetchJson(`${OLLAMA_HOST}/api/version`, timeoutMs);
  return r.ok;
}

async function ollamaDiagnose() {
  const exe = findOllamaExe();
  const running = await ollamaServerUp();
  let models = [];
  if (running) {
    const r = await fetchJson(`${OLLAMA_HOST}/api/tags`, 4000);
    if (r.ok && Array.isArray(r.data?.models)) models = r.data.models.map(m => m.name);
  }
  return { installedPath: exe, running, models };
}

async function ollamaStart() {
  const exe = findOllamaExe();
  if (!exe) return { ok: false, error: 'not_installed' };
  if (await ollamaServerUp()) return { ok: true, already: true };

  // Prefer the tray app (registers autostart); fall back to headless serve
  const trayApp = path.join(path.dirname(exe), 'ollama app.exe');
  try {
    if (fs.existsSync(trayApp)) {
      spawn(trayApp, [], { detached: true, stdio: 'ignore' }).unref();
    } else {
      spawn(exe, ['serve'], { detached: true, stdio: 'ignore' }).unref();
    }
  } catch (e) {
    return { ok: false, error: String(e.message || e) };
  }

  // Poll until the server answers (up to 25 s)
  for (let i = 0; i < 25; i++) {
    await new Promise(r => setTimeout(r, 1000));
    if (await ollamaServerUp()) return { ok: true };
  }
  return { ok: false, error: 'timeout' };
}

async function ollamaInstall(event) {
  const send = (phase, extra = {}) => {
    try { event.sender.send('ollama:progress', { phase, ...extra }); } catch (_) { /* window gone */ }
  };
  try {
    send('download', { pct: 0 });
    const res = await fetch(OLLAMA_INSTALLER_URL, { redirect: 'follow' });
    if (!res.ok) throw new Error(`descarga HTTP ${res.status}`);
    const total = Number(res.headers.get('content-length')) || 0;
    const file = path.join(app.getPath('temp'), 'OllamaSetup.exe');
    const chunks = [];
    let got = 0;
    const reader = res.body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(Buffer.from(value));
      got += value.length;
      if (total) send('download', { pct: Math.round((got / total) * 100) });
    }
    fs.writeFileSync(file, Buffer.concat(chunks));

    send('install');
    // Inno Setup silent flags; Ollama installs per-user (no admin prompt)
    await new Promise((resolve, reject) => {
      execFile(file, ['/VERYSILENT', '/SUPPRESSMSGBOXES', '/NORESTART'], { timeout: 10 * 60 * 1000 },
        (err) => err ? reject(err) : resolve());
    });

    send('start');
    const started = await ollamaStart();
    if (!started.ok && started.error !== 'already') {
      // Installer usually launches the tray app itself; wait a bit more
      for (let i = 0; i < 15 && !(await ollamaServerUp()); i++) {
        await new Promise(r => setTimeout(r, 1000));
      }
    }
    const running = await ollamaServerUp();
    send('done', { ok: running });
    return { ok: running, error: running ? undefined : 'instalado pero el servidor no responde' };
  } catch (e) {
    const msg = String(e.message || e);
    send('error', { error: msg });
    return { ok: false, error: msg };
  }
}

async function ollamaPull(event, model) {
  const send = (payload) => {
    try { event.sender.send('ollama:progress', payload); } catch (_) { /* window gone */ }
  };
  try {
    const res = await fetch(`${OLLAMA_HOST}/api/pull`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: model, stream: true }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = '';
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      let nl;
      while ((nl = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (!line) continue;
        try {
          const j = JSON.parse(line);
          if (j.error) throw new Error(j.error);
          const pct = j.total ? Math.round((j.completed || 0) / j.total * 100) : null;
          send({ phase: 'pull', status: j.status, pct });
        } catch (e) {
          if (String(e.message).includes('JSON')) continue;
          throw e;
        }
      }
    }
    send({ phase: 'done', ok: true });
    return { ok: true };
  } catch (e) {
    const msg = String(e.message || e);
    send({ phase: 'error', error: msg });
    return { ok: false, error: msg };
  }
}

// ---------- Generic REST (GET/POST/PATCH/DELETE) for Firestore ----------
async function apiRequest(method, url, body, headers = {}, timeoutMs = 25000) {
  if (!hostAllowed(url)) return { ok: false, status: 0, error: 'host no permitido' };
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const opts = { method, signal: ctrl.signal, headers: { ...headers } };
    if (body !== null && body !== undefined) {
      opts.headers['Content-Type'] = 'application/json';
      opts.body = typeof body === 'string' ? body : JSON.stringify(body);
    }
    const res = await fetch(url, opts);
    const text = await res.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch (_) { /* keep raw */ }
    return { ok: res.ok, status: res.status, data, raw: data ? undefined : text.slice(0, 500) };
  } catch (e) {
    return { ok: false, status: 0, error: String(e && e.message ? e.message : e) };
  } finally {
    clearTimeout(t);
  }
}

// ---------- IPC ----------
ipcMain.handle('api:fetchJson', (_e, url, headers) => fetchJson(url, 25000, headers || {}));
ipcMain.handle('api:postJson', (_e, url, body, headers) => postJson(url, body, headers));
ipcMain.handle('api:request', (_e, method, url, body, headers) => apiRequest(method, url, body, headers));
ipcMain.handle('ollama:diagnose', () => ollamaDiagnose());
ipcMain.handle('ollama:start', () => ollamaStart());
ipcMain.handle('ollama:install', (e) => ollamaInstall(e));
ipcMain.handle('ollama:pull', (e, model) => ollamaPull(e, model));
ipcMain.handle('api:fetchCachedText', (_e, key, url, maxAgeDays) => fetchCachedText(key, url, maxAgeDays));
ipcMain.handle('settings:get', () => getSettings());
ipcMain.handle('settings:set', (_e, patch) => setSettings(patch));
ipcMain.handle('shell:openExternal', (_e, url) => {
  if (/^https?:\/\//i.test(url)) shell.openExternal(url);
});

// ---------- Auto-update ----------
function initAutoUpdate(win) {
  if (!autoUpdater || !app.isPackaged) return; // only in installed builds
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  const send = (status, extra = {}) => {
    try { win.webContents.send('update:status', { status, ...extra }); } catch (_) { /* window gone */ }
  };
  autoUpdater.on('checking-for-update', () => send('checking'));
  autoUpdater.on('update-available', (info) => send('available', { version: info.version }));
  autoUpdater.on('update-not-available', () => send('none'));
  autoUpdater.on('download-progress', (p) => send('downloading', { percent: Math.round(p.percent || 0) }));
  autoUpdater.on('update-downloaded', (info) => send('ready', { version: info.version }));
  autoUpdater.on('error', (err) => send('error', { error: String(err && err.message ? err.message : err) }));

  autoUpdater.checkForUpdates().catch(() => {});
  // Re-check every 3 hours while the app stays open
  setInterval(() => autoUpdater.checkForUpdates().catch(() => {}), 3 * 3600 * 1000);
}

ipcMain.handle('update:install', () => { if (autoUpdater) autoUpdater.quitAndInstall(); });
ipcMain.handle('update:check', () => {
  if (autoUpdater && app.isPackaged) autoUpdater.checkForUpdates().catch(() => {});
});

// ---------- Window ----------
function createWindow() {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1100,
    minHeight: 700,
    backgroundColor: '#0d1117',
    autoHideMenuBar: true,
    title: 'Albion Silver Hub',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,   // renderer can't touch Node/Electron internals
      nodeIntegration: false,   // no Node in the renderer
      sandbox: true,            // Chromium OS-level sandbox for the renderer
      webSecurity: true,        // enforce same-origin + CSP
    },
  });
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  initAutoUpdate(win);

  // ---- Navigation hardening ----
  // Any window.open / target=_blank goes to the system browser, never a new
  // in-app window; deny everything else.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  // Block the app frame from ever navigating away from our local file.
  win.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith('file://')) { e.preventDefault(); if (/^https?:\/\//i.test(url)) shell.openExternal(url); }
  });
  // Deny attaching webviews (we don't use any).
  win.webContents.on('will-attach-webview', (e) => e.preventDefault());

  if (process.env.ALBION_DEBUG) {
    win.webContents.on('console-message', (_e, level, message, line, sourceId) => {
      console.log(`[renderer:${level}] ${message} (${sourceId}:${line})`);
    });
  }
}

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
