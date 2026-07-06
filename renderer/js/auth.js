// Firebase Auth (REST) + subscription check via Firestore REST.
// No SDK: plain identitytoolkit/securetoken/firestore endpoints through the
// main process. Password-reset emails are SENT BY FIREBASE itself — no custom
// domain, SMTP or Resend needed.
import { APP_CONFIG, isDistributionMode } from './config.js';

const IDTK = 'https://identitytoolkit.googleapis.com/v1';

export const session = {
  uid: null,
  email: null,
  displayName: null,   // nick shown in the forum
  idToken: null,
  refreshToken: null,
  expiresAt: 0,        // ms epoch for idToken
  sub: null,           // { active, until, trial } — filled by checkSubscription
};

const ERRORS_ES = {
  EMAIL_EXISTS: 'Ese email ya tiene una cuenta. Inicia sesión.',
  EMAIL_NOT_FOUND: 'No existe una cuenta con ese email.',
  INVALID_LOGIN_CREDENTIALS: 'Email o contraseña incorrectos.',
  INVALID_PASSWORD: 'Contraseña incorrecta.',
  WEAK_PASSWORD: 'La contraseña debe tener al menos 6 caracteres.',
  'WEAK_PASSWORD : Password should be at least 6 characters': 'La contraseña debe tener al menos 6 caracteres.',
  INVALID_EMAIL: 'Ese email no es válido.',
  USER_DISABLED: 'Esta cuenta está deshabilitada.',
  TOO_MANY_ATTEMPTS_TRY_LATER: 'Demasiados intentos: espera unos minutos y reintenta.',
};

function translate(code) {
  if (!code) return 'Error desconocido';
  const clean = String(code).split(':')[0].trim();
  return ERRORS_ES[code] || ERRORS_ES[clean] || `Error: ${code}`;
}

async function idtk(endpoint, body) {
  const res = await window.albion.postJson(
    `${IDTK}/accounts:${endpoint}?key=${APP_CONFIG.firebase.apiKey}`, body);
  if (!res.ok) {
    const code = res.data?.error?.message;
    throw new Error(translate(code || res.error || `HTTP ${res.status}`));
  }
  return res.data;
}

function applyAuth(data) {
  session.uid = data.localId;
  session.email = data.email;
  if (data.displayName) session.displayName = data.displayName;
  session.idToken = data.idToken;
  session.refreshToken = data.refreshToken;
  session.expiresAt = Date.now() + (Number(data.expiresIn || 3600) - 120) * 1000;
}

async function persist() {
  await window.albion.setSettings({
    authRefreshToken: session.refreshToken || '',
    authEmail: session.email || '',
    authName: session.displayName || '',
  });
}

export async function setDisplayName(name) {
  const token = await freshIdToken();
  if (!token) throw new Error('inicia sesión primero');
  await idtk('update', { idToken: token, displayName: name, returnSecureToken: false });
  session.displayName = name;
  await persist();
}

export async function signUp(email, password) {
  const d = await idtk('signUp', { email, password, returnSecureToken: true });
  applyAuth(d);
  await persist();
}

export async function signIn(email, password) {
  const d = await idtk('signInWithPassword', { email, password, returnSecureToken: true });
  applyAuth(d);
  await persist();
}

export async function sendPasswordReset(email) {
  await idtk('sendOobCode', { requestType: 'PASSWORD_RESET', email });
}

export async function signOut() {
  session.uid = session.email = session.idToken = session.refreshToken = null;
  session.expiresAt = 0;
  session.sub = null;
  await persist();
}

/** Restore a session from the stored refresh token. Returns true if logged in. */
export async function restoreSession() {
  if (!isDistributionMode()) return false;
  const s = await window.albion.getSettings();
  const rt = s?.authRefreshToken;
  if (!rt) return false;
  try {
    const res = await window.albion.postJson(
      `https://securetoken.googleapis.com/v1/token?key=${APP_CONFIG.firebase.apiKey}`,
      `grant_type=refresh_token&refresh_token=${encodeURIComponent(rt)}`,
      { 'Content-Type': 'application/x-www-form-urlencoded' });
    if (!res.ok) return false;
    const d = res.data;
    session.uid = d.user_id;
    session.email = s.authEmail || null;
    session.displayName = s.authName || null;
    session.idToken = d.id_token;
    session.refreshToken = d.refresh_token;
    session.expiresAt = Date.now() + (Number(d.expires_in || 3600) - 120) * 1000;
    await persist();
    return true;
  } catch (_) { return false; }
}

export async function freshIdToken() {
  if (session.idToken && Date.now() < session.expiresAt) return session.idToken;
  const ok = await restoreSession();
  return ok ? session.idToken : null;
}

// ---------- Subscription (Firestore REST: users/{uid}) ----------
// The user doc is written ONLY by the payments webhook (service account).
// Clients can read their own doc; Firestore rules must deny client writes.

export async function checkSubscription() {
  if (!isDistributionMode()) { session.sub = { active: true, local: true }; return session.sub; }
  const token = await freshIdToken();
  if (!token) { session.sub = { active: false, reason: 'no-session' }; return session.sub; }

  const url = `https://firestore.googleapis.com/v1/projects/${APP_CONFIG.firebase.projectId}` +
    `/databases/(default)/documents/users/${session.uid}`;
  const res = await window.albion.fetchJson(url, { Authorization: `Bearer ${token}` });

  if (res.status === 404) {
    // No doc yet: trial window from account creation (best-effort via accounts:lookup)
    try {
      const info = await idtk('lookup', { idToken: token });
      const createdAt = Number(info.users?.[0]?.createdAt || Date.now());
      const trialMs = (APP_CONFIG.payments.trialDays || 0) * 24 * 3600 * 1000;
      const until = createdAt + trialMs;
      session.sub = { active: Date.now() < until, trial: true, until };
    } catch (_) {
      session.sub = { active: false, reason: 'no-doc' };
    }
    return session.sub;
  }

  if (!res.ok) { session.sub = { active: false, reason: `firestore ${res.status}` }; return session.sub; }

  const f = res.data?.fields || {};
  const until = f.subUntil?.timestampValue ? Date.parse(f.subUntil.timestampValue) : 0;
  const active = Boolean(f.subActive?.booleanValue) && until > Date.now();
  session.sub = { active, until, plan: f.plan?.stringValue || null };
  return session.sub;
}
