/**
 * Albion Silver Hub — backend de suscripciones (Cloudflare Worker, plan GRATIS).
 *
 * Rutas:
 *   POST /checkout  — la app lo llama con el idToken de Firebase; crea la
 *                     suscripción en Mercado Pago (external_reference = uid)
 *                     y devuelve { init_point } para abrir el pago.
 *   POST /webhook   — Mercado Pago notifica; se valida la firma, se consulta
 *                     la verdad con GET /preapproval/{id} y se escribe
 *                     users/{uid} { subActive, subUntil } en Firestore.
 *   GET  /ads       — lista de anuncios activos (variable ADS_JSON: editable
 *                     en el panel de Cloudflare sin recompilar la app).
 *   POST /ads/track — métricas de anuncios { batch: [{id, views, seconds,
 *                     clicks}] } acumuladas en Firestore adStats/{id}.
 *
 * Variables (Workers > Settings > Variables and Secrets):
 *   MP_ACCESS_TOKEN     (secret)  — token de producción de Mercado Pago
 *   MP_WEBHOOK_SECRET   (secret)  — clave secreta del webhook (panel MP)
 *   FIREBASE_API_KEY    (texto)   — Web API key del proyecto
 *   FIREBASE_PROJECT_ID (texto)   — id del proyecto (ej. albion-silver-hub)
 *   SA_CLIENT_EMAIL     (texto)   — service account: client_email
 *   SA_PRIVATE_KEY      (secret)  — service account: private_key (PEM completo)
 *   PLAN_AMOUNT         (texto)   — precio mensual en ARS, ej. "5000"
 *   PLAN_TITLE          (texto)   — ej. "Albion Silver Hub — mensual"
 */

const SUB_DAYS = 31; // cada cobro autorizado extiende la suscripción 31 días

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    try {
      if (request.method === 'POST' && url.pathname === '/checkout') return await checkout(request, env);
      if (request.method === 'POST' && url.pathname === '/webhook') return await webhook(request, env);
      if (request.method === 'GET' && url.pathname === '/ads') return ads(env);
      if (request.method === 'POST' && url.pathname === '/ads/track') return await adsTrack(request, env);
      // --- analítica del panel de admin ---
      if (request.method === 'POST' && url.pathname === '/beat') return await beat(request, env);
      if (request.method === 'POST' && url.pathname === '/hit') return await hit(request, env);
      if (request.method === 'GET' && url.pathname === '/admin') return await adminStats(url, env);
      return json({ ok: true, service: 'albion-silver-hub-backend' });
    } catch (e) {
      console.log('ERROR', e.message);
      return json({ error: String(e.message || e) }, 500);
    }
  },
};

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
  });
}

// ---------- /checkout ----------
async function checkout(request, env) {
  const { idToken } = await request.json();
  if (!idToken) return json({ error: 'falta idToken' }, 400);

  // Verify the Firebase user (the API key route is enough: lookup validates the token)
  const look = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${env.FIREBASE_API_KEY}`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ idToken }) });
  if (!look.ok) return json({ error: 'sesión inválida' }, 401);
  const user = (await look.json()).users?.[0];
  if (!user) return json({ error: 'usuario no encontrado' }, 401);

  // Create the Mercado Pago subscription with the uid embedded
  const res = await fetch('https://api.mercadopago.com/preapproval', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${env.MP_ACCESS_TOKEN}` },
    body: JSON.stringify({
      reason: env.PLAN_TITLE || 'Albion Silver Hub — suscripción mensual',
      external_reference: user.localId,
      payer_email: user.email,
      auto_recurring: {
        frequency: 1,
        frequency_type: 'months',
        transaction_amount: Number(env.PLAN_AMOUNT || 5000),
        currency_id: 'ARS',
      },
      back_url: 'https://www.mercadopago.com.ar',
      status: 'pending',
    }),
  });
  const data = await res.json();
  if (!res.ok || !data.init_point) {
    console.log('MP checkout error', JSON.stringify(data).slice(0, 500));
    return json({ error: data.message || 'no se pudo crear el checkout' }, 502);
  }
  return json({ init_point: data.init_point, preapproval_id: data.id });
}

// ---------- /webhook ----------
async function webhook(request, env) {
  const body = await request.json().catch(() => ({}));
  const topic = body.type || body.topic || '';
  const dataId = body.data?.id;

  // Signature validation (Mercado Pago x-signature: "ts=...,v1=...")
  const sig = request.headers.get('x-signature') || '';
  const reqId = request.headers.get('x-request-id') || '';
  if (env.MP_WEBHOOK_SECRET && sig) {
    const parts = Object.fromEntries(sig.split(',').map(p => p.trim().split('=')));
    const manifest = `id:${dataId};request-id:${reqId};ts:${parts.ts};`;
    const expected = await hmacHex(env.MP_WEBHOOK_SECRET, manifest);
    if (expected !== parts.v1) {
      console.log('firma inválida', manifest);
      return json({ error: 'firma inválida' }, 401);
    }
  }

  if (!dataId) return json({ ok: true, ignored: true });

  // Fetch the truth from MP (never trust the webhook payload alone)
  let uid = null;
  let active = false;
  if (topic.includes('preapproval') || topic === 'subscription_preapproval') {
    const r = await fetch(`https://api.mercadopago.com/preapproval/${dataId}`, {
      headers: { Authorization: `Bearer ${env.MP_ACCESS_TOKEN}` } });
    if (!r.ok) return json({ ok: false, error: 'preapproval no encontrada' }, 200);
    const pre = await r.json();
    uid = pre.external_reference;
    active = pre.status === 'authorized';
  } else if (topic.includes('authorized_payment')) {
    const r = await fetch(`https://api.mercadopago.com/authorized_payments/${dataId}`, {
      headers: { Authorization: `Bearer ${env.MP_ACCESS_TOKEN}` } });
    if (!r.ok) return json({ ok: false, error: 'pago no encontrado' }, 200);
    const pay = await r.json();
    uid = pay.external_reference || pay.preapproval?.external_reference;
    active = ['approved', 'accredited', 'processed'].includes(pay.status);
    // Fall back to the parent preapproval for uid
    if (!uid && pay.preapproval_id) {
      const r2 = await fetch(`https://api.mercadopago.com/preapproval/${pay.preapproval_id}`, {
        headers: { Authorization: `Bearer ${env.MP_ACCESS_TOKEN}` } });
      if (r2.ok) {
        const pre = await r2.json();
        uid = pre.external_reference;
        active = active || pre.status === 'authorized';
      }
    }
  } else {
    return json({ ok: true, ignored: topic });
  }

  if (!uid) return json({ ok: true, ignored: 'sin external_reference' });

  if (active) {
    const until = new Date(Date.now() + SUB_DAYS * 24 * 3600 * 1000).toISOString();
    await firestoreSet(env, uid, { subActive: true, subUntil: until, lastPaymentId: String(dataId) });
    console.log('suscripción activada', uid, 'hasta', until);
  } else {
    await firestoreSet(env, uid, { subActive: false });
    console.log('suscripción desactivada', uid);
  }
  return json({ ok: true });
}

// ---------- /ads ----------
// ADS_JSON (variable de texto en el panel): [{"id":"eneba-1","title":"🎮 Keys baratas",
//   "body":"Juegos hasta -90%","url":"https://www.eneba.com/?af_id=TU_ID","color":"#3fb950"}]
function ads(env) {
  let list = [];
  try { list = JSON.parse(env.ADS_JSON || '[]'); } catch (_) { /* mal formado -> vacío */ }
  return json({ ads: list });
}

// ---------- /ads/track ----------
async function adsTrack(request, env) {
  const { batch } = await request.json().catch(() => ({}));
  if (!Array.isArray(batch) || !batch.length) return json({ ok: true, ignored: true });

  const token = await googleAccessToken(env, 'https://www.googleapis.com/auth/datastore');
  const day = new Date().toISOString().slice(0, 10);

  for (const item of batch.slice(0, 20)) {
    const id = String(item.id || '').replace(/[^\w-]/g, '').slice(0, 60);
    if (!id) continue;
    const docPath = `adStats/${id}_${day}`;
    const url = `https://firestore.googleapis.com/v1/projects/${env.FIREBASE_PROJECT_ID}` +
      `/databases/(default)/documents/${docPath}`;

    // Read-modify-write: precisión suficiente para métricas de anuncios
    let cur = { views: 0, seconds: 0, clicks: 0 };
    const g = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (g.ok) {
      const f = (await g.json()).fields || {};
      cur = {
        views: Number(f.views?.integerValue || 0),
        seconds: Number(f.seconds?.integerValue || 0),
        clicks: Number(f.clicks?.integerValue || 0),
      };
    }
    const next = {
      fields: {
        adId: { stringValue: id },
        day: { stringValue: day },
        views: { integerValue: String(cur.views + Math.max(0, Number(item.views) || 0)) },
        seconds: { integerValue: String(cur.seconds + Math.max(0, Number(item.seconds) || 0)) },
        clicks: { integerValue: String(cur.clicks + Math.max(0, Number(item.clicks) || 0)) },
      },
    };
    await fetch(url, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(next),
    });
  }
  return json({ ok: true });
}

// ---------- Analítica: presencia (online en vivo) ----------
// La app manda un "latido" cada ~60s con un id anónimo. Un usuario está "online"
// si latió en los últimos 120s. Guardamos presence/{sid} = { t }.
async function beat(request, env) {
  const { sid } = await request.json().catch(() => ({}));
  const id = String(sid || '').replace(/[^\w-]/g, '').slice(0, 40);
  if (!id) return json({ ok: false });
  const token = await googleAccessToken(env, 'https://www.googleapis.com/auth/datastore');
  const url = `https://firestore.googleapis.com/v1/projects/${env.FIREBASE_PROJECT_ID}/databases/(default)/documents/presence/${id}`;
  await fetch(url, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ fields: { t: { integerValue: String(Date.now()) } } }),
  });
  return json({ ok: true });
}

// ---------- Analítica: visitas web ----------
async function hit(request, env) {
  const body = await request.json().catch(() => ({}));
  const day = new Date().toISOString().slice(0, 10);
  const token = await googleAccessToken(env, 'https://www.googleapis.com/auth/datastore');
  const doc = `projects/${env.FIREBASE_PROJECT_ID}/databases/(default)/documents/stats/counters`;
  await fetch(`https://firestore.googleapis.com/v1/projects/${env.FIREBASE_PROJECT_ID}/databases/(default)/documents:commit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      writes: [{
        transform: {
          document: doc,
          fieldTransforms: [
            { fieldPath: 'visitsTotal', increment: { integerValue: '1' } },
            { fieldPath: `visits_${day.replace(/-/g, '_')}`, increment: { integerValue: '1' } },
          ],
        },
      }],
    }),
  });
  return json({ ok: true });
}

// ---------- Panel de admin (protegido por clave) ----------
async function adminStats(url, env) {
  if (url.searchParams.get('key') !== env.ADMIN_KEY) return json({ error: 'no autorizado' }, 401);
  const token = await googleAccessToken(env, 'https://www.googleapis.com/auth/datastore');
  const base = `https://firestore.googleapis.com/v1/projects/${env.FIREBASE_PROJECT_ID}/databases/(default)/documents`;

  // Online: contar presencia reciente y limpiar viejas
  let online = 0;
  try {
    const r = await fetch(`${base}/presence?pageSize=1000`, { headers: { Authorization: `Bearer ${token}` } });
    const docs = (await r.json()).documents || [];
    const cutoff = Date.now() - 120000;
    const stale = [];
    for (const d of docs) {
      const t = Number(d.fields?.t?.integerValue || 0);
      if (t >= cutoff) online++;
      else if (t < Date.now() - 3600000) stale.push(d.name.split('/').pop());
    }
    // housekeeping: borrar hasta 50 presencias muy viejas por consulta
    for (const s of stale.slice(0, 50)) {
      fetch(`${base}/presence/${s}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
    }
  } catch (_) { /* ignora */ }

  // Visitas
  let visitsTotal = 0, visitsToday = 0;
  try {
    const r = await fetch(`${base}/stats/counters`, { headers: { Authorization: `Bearer ${token}` } });
    if (r.ok) {
      const f = (await r.json()).fields || {};
      visitsTotal = Number(f.visitsTotal?.integerValue || 0);
      const dk = `visits_${new Date().toISOString().slice(0, 10).replace(/-/g, '_')}`;
      visitsToday = Number(f[dk]?.integerValue || 0);
    }
  } catch (_) { /* ignora */ }

  // Descargas: sumatoria real desde GitHub Releases
  let downloads = 0, byVersion = [];
  try {
    const r = await fetch(`https://api.github.com/repos/${env.GH_REPO || 'ObregonJeronimo/AlbionXP'}/releases?per_page=100`,
      { headers: { 'User-Agent': 'albion-admin', Accept: 'application/vnd.github+json' } });
    const rels = await r.json();
    for (const rel of (Array.isArray(rels) ? rels : [])) {
      let n = 0;
      for (const a of (rel.assets || [])) if (a.name.endsWith('.exe')) n += a.download_count || 0;
      if (n) byVersion.push({ tag: rel.tag_name, downloads: n });
      downloads += n;
    }
  } catch (_) { /* ignora */ }

  return json({
    online,
    visitsToday,
    visitsTotal,
    downloads,
    byVersion,
    // Enlaces a los paneles reales de ingresos (no tienen API pública simple):
    links: {
      cpm: 'https://publishers.monetag.com/',
      cafecito: 'https://cafecito.app/',
      mercadopago: 'https://www.mercadopago.com.ar/activities',
    },
    updatedAt: new Date().toISOString(),
  });
}

// ---------- Firestore write with service account (bypasses security rules) ----------
async function firestoreSet(env, uid, fields) {
  const token = await googleAccessToken(env, 'https://www.googleapis.com/auth/datastore');
  const doc = { fields: {} };
  for (const [k, v] of Object.entries(fields)) {
    if (typeof v === 'boolean') doc.fields[k] = { booleanValue: v };
    else if (k === 'subUntil') doc.fields[k] = { timestampValue: v };
    else doc.fields[k] = { stringValue: String(v) };
  }
  const mask = Object.keys(fields).map(k => `updateMask.fieldPaths=${k}`).join('&');
  const url = `https://firestore.googleapis.com/v1/projects/${env.FIREBASE_PROJECT_ID}` +
    `/databases/(default)/documents/users/${uid}?${mask}`;
  const res = await fetch(url, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(doc),
  });
  if (!res.ok) throw new Error(`Firestore ${res.status}: ${(await res.text()).slice(0, 300)}`);
}

// ---------- Google OAuth2 with the service account (WebCrypto JWT RS256) ----------
async function googleAccessToken(env, scope) {
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = b64url(JSON.stringify({
    iss: env.SA_CLIENT_EMAIL,
    scope,
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  }));
  const input = `${header}.${claims}`;
  const key = await importPem(env.SA_PRIVATE_KEY);
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(input));
  const jwt = `${input}.${b64urlBytes(new Uint8Array(sig))}`;

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=${encodeURIComponent('urn:ietf:params:oauth:grant-type:jwt-bearer')}&assertion=${jwt}`,
  });
  if (!res.ok) throw new Error(`OAuth ${res.status}`);
  return (await res.json()).access_token;
}

async function importPem(pem) {
  const raw = pem.replace(/-----[^-]+-----/g, '').replace(/\\n/g, '').replace(/\s/g, '');
  const bin = Uint8Array.from(atob(raw), c => c.charCodeAt(0));
  return crypto.subtle.importKey('pkcs8', bin.buffer,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
}

async function hmacHex(secret, msg) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(msg));
  return [...new Uint8Array(sig)].map(b => b.toString(16).padStart(2, '0')).join('');
}

function b64url(s) { return b64urlBytes(new TextEncoder().encode(s)); }
function b64urlBytes(bytes) {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
