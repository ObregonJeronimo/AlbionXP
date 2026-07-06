// Forum data layer on Firestore REST (through the main process, so the app's
// strict CSP doesn't block it). Public reads use the API key; writes carry the
// user's Firebase ID token and are enforced by Firestore security rules.
import { APP_CONFIG } from './config.js';
import { session, freshIdToken } from './auth.js';

const PID = () => APP_CONFIG.firebase.projectId;
const KEY = () => APP_CONFIG.firebase.apiKey;
const BASE = () => `https://firestore.googleapis.com/v1/projects/${PID()}/databases/(default)/documents`;

// ---- Firestore typed-value encode/decode ----
function enc(v) {
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (v instanceof Date) return { timestampValue: v.toISOString() };
  return { stringValue: String(v) };
}
function dec(field) {
  if (!field) return null;
  if ('stringValue' in field) return field.stringValue;
  if ('integerValue' in field) return Number(field.integerValue);
  if ('doubleValue' in field) return field.doubleValue;
  if ('booleanValue' in field) return field.booleanValue;
  if ('timestampValue' in field) return field.timestampValue;
  return null;
}
function fields(obj) {
  const f = {};
  for (const k in obj) f[k] = enc(obj[k]);
  return { fields: f };
}
function unwrap(doc) {
  const o = { _id: doc.name.split('/').pop() };
  for (const k in (doc.fields || {})) o[k] = dec(doc.fields[k]);
  return o;
}

async function authHeaders() {
  const token = await freshIdToken();
  if (!token) throw new Error('Inicia sesión para participar en el foro.');
  return { Authorization: `Bearer ${token}` };
}

// ---- Read cache: cuts Firestore reads hard when many users browse ----
// (each cached hit = 0 reads; without this, opening the forum re-reads every post).
const _cache = new Map();
async function cachedRead(key, ttlMs, fn) {
  const hit = _cache.get(key);
  if (hit && Date.now() - hit.t < ttlMs) return hit.v;
  const v = await fn();
  _cache.set(key, { t: Date.now(), v });
  return v;
}
function invalidate(prefix) {
  for (const k of _cache.keys()) if (k.startsWith(prefix)) _cache.delete(k);
}

function authorName() {
  return session.displayName || (session.email ? session.email.split('@')[0] : 'anónimo');
}

// ---------- Posts ----------
export async function listPosts(limit = 50) {
  const q = {
    structuredQuery: {
      from: [{ collectionId: 'posts' }],
      orderBy: [{ field: { fieldPath: 'createdAt' }, direction: 'DESCENDING' }],
      limit,
    },
  };
  const res = await window.albion.request('POST', `${BASE()}:runQuery?key=${KEY()}`, q);
  if (!res.ok) throw new Error(res.data?.error?.message || 'No se pudieron cargar los temas.');
  return (res.data || []).filter(r => r.document).map(r => unwrap(r.document));
}
const _rawListPosts = listPosts;
export function listPostsCached(limit = 50) {
  return cachedRead('posts:' + limit, 45000, () => _rawListPosts(limit));
}

export async function getPost(id) {
  return cachedRead('post:' + id, 30000, async () => {
    const res = await window.albion.request('GET', `${BASE()}/posts/${id}?key=${KEY()}`);
    if (!res.ok) throw new Error('Tema no encontrado.');
    return unwrap(res.data);
  });
}

export async function createPost(title, body) {
  const headers = await authHeaders();
  const doc = fields({ authorUid: session.uid, authorName: authorName(), title, body, createdAt: new Date() });
  const res = await window.albion.request('POST', `${BASE()}/posts?key=${KEY()}`, doc, headers);
  if (!res.ok) throw new Error(res.data?.error?.message || 'No se pudo publicar.');
  invalidate('posts:');
  return unwrap(res.data);
}

export async function deletePost(id) {
  const headers = await authHeaders();
  const res = await window.albion.request('DELETE', `${BASE()}/posts/${id}?key=${KEY()}`, null, headers);
  if (!res.ok) throw new Error('No se pudo borrar.');
}

// ---------- Comments ----------
export async function listComments(postId) {
  return cachedRead('comments:' + postId, 20000, async () => {
    const url = `${BASE()}/posts/${postId}/comments?orderBy=createdAt&pageSize=300&key=${KEY()}`;
    const res = await window.albion.request('GET', url);
    if (!res.ok) return [];
    return (res.data.documents || []).map(unwrap);
  });
}

export async function addComment(postId, body) {
  const headers = await authHeaders();
  const doc = fields({ authorUid: session.uid, authorName: authorName(), body, createdAt: new Date() });
  const res = await window.albion.request('POST', `${BASE()}/posts/${postId}/comments?key=${KEY()}`, doc, headers);
  if (!res.ok) throw new Error(res.data?.error?.message || 'No se pudo comentar.');
  invalidate('comments:' + postId);
  return unwrap(res.data);
}

// ---------- Votes (doc id = voter uid → no double voting, no counters to hack) ----------
export async function getVotes(postId) {
  return cachedRead('votes:' + postId, 15000, async () => {
    const url = `${BASE()}/posts/${postId}/votes?pageSize=1000&key=${KEY()}`;
    const res = await window.albion.request('GET', url);
    const out = { up: 0, down: 0, score: 0, mine: 0 };
    if (!res.ok) return out;
    for (const d of (res.data.documents || [])) {
      const o = unwrap(d);
      const val = Number(o.value) || 0;
      if (val > 0) out.up++; else if (val < 0) out.down++;
      if (session.uid && o._id === session.uid) out.mine = val;
    }
    out.score = out.up - out.down;
    return out;
  });
}

export async function setVote(postId, value) { // value: 1 | -1
  const headers = await authHeaders();
  const url = `${BASE()}/posts/${postId}/votes/${session.uid}?key=${KEY()}`;
  const res = await window.albion.request('PATCH', url, fields({ value, uid: session.uid }), headers);
  if (!res.ok) throw new Error(res.data?.error?.message || 'No se pudo votar.');
  invalidate('votes:' + postId);
}

export async function clearVote(postId) {
  const headers = await authHeaders();
  const url = `${BASE()}/posts/${postId}/votes/${session.uid}?key=${KEY()}`;
  const res = await window.albion.request('DELETE', url, null, headers);
  if (!res.ok) throw new Error('No se pudo quitar el voto.');
  invalidate('votes:' + postId);
}
