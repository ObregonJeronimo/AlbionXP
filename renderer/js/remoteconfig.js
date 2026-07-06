// Remote config: lets us change community links + ads WITHOUT shipping a new
// app version. The app fetches a small JSON hosted on the site; if it fails
// (offline / not published), it silently falls back to the built-in defaults.
const REMOTE_URL = 'https://obregonjeronimo.github.io/AlbionXP/appconfig.json';

export async function loadRemoteConfig() {
  try {
    // Cap the wait so boot is never blocked by a slow/absent network
    const res = await Promise.race([
      window.albion.fetchJson(REMOTE_URL),
      new Promise((r) => setTimeout(() => r({ ok: false }), 4000)),
    ]);
    if (res && res.ok && res.data && typeof res.data === 'object') return res.data;
  } catch (_) { /* fall back to defaults */ }
  return null;
}
