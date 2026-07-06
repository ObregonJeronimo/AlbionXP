// Auth gate + paywall overlays. Shown only in distribution mode
// (config.js with Firebase keys). Local mode never sees these.
import { APP_CONFIG } from '../config.js';
import { signIn, signUp, sendPasswordReset, signOut, session, checkSubscription } from '../auth.js';
import { escapeHtml } from '../state.js';

function overlay() {
  let el = document.getElementById('auth-gate');
  if (!el) {
    el = document.createElement('div');
    el.id = 'auth-gate';
    document.body.appendChild(el);
  }
  el.style.display = 'flex';
  return el;
}

export function hideGate() {
  const el = document.getElementById('auth-gate');
  if (el) el.style.display = 'none';
}

/** Shows the login gate; resolves when the user is authenticated. */
export function showAuthGate() {
  return new Promise((resolve) => {
    const el = overlay();
    let mode = 'login'; // login | register | reset

    function render(msg = '', msgClass = '') {
      el.innerHTML = `
        <div class="gate-card">
          <div class="brand" style="border:none;padding:0 0 14px">
            <div class="brand-icon">⚔️</div>
            <div class="brand-text">
              <div class="brand-title">${escapeHtml(APP_CONFIG.appName)}</div>
              <div class="brand-sub">${mode === 'login' ? 'Inicia sesión' : mode === 'register' ? 'Crea tu cuenta' : 'Recuperar contraseña'}</div>
            </div>
          </div>
          ${msg ? `<div class="${msgClass === 'ok' ? 'gate-ok' : 'error-box'}" style="margin-bottom:10px">${escapeHtml(msg)}</div>` : ''}
          <input type="email" id="gate-email" placeholder="Email" autocomplete="username" />
          ${mode !== 'reset' ? `<input type="password" id="gate-pass" placeholder="Contraseña" autocomplete="${mode === 'register' ? 'new-password' : 'current-password'}" />` : ''}
          <button class="btn" id="gate-go">${mode === 'login' ? 'Entrar' : mode === 'register' ? 'Crear cuenta' : 'Enviar email de recuperación'}</button>
          <div class="gate-links">
            ${mode !== 'login' ? '<a data-mode="login">Ya tengo cuenta</a>' : ''}
            ${mode !== 'register' ? '<a data-mode="register">Crear cuenta nueva</a>' : ''}
            ${mode !== 'reset' ? '<a data-mode="reset">Olvidé mi contraseña</a>' : ''}
          </div>
        </div>`;

      el.querySelectorAll('.gate-links a').forEach(a =>
        a.addEventListener('click', () => { mode = a.dataset.mode; render(); }));

      const go = el.querySelector('#gate-go');
      const email = el.querySelector('#gate-email');
      const pass = el.querySelector('#gate-pass');
      const submit = async () => {
        go.disabled = true;
        try {
          if (mode === 'login') {
            await signIn(email.value.trim(), pass.value);
            resolve();
          } else if (mode === 'register') {
            await signUp(email.value.trim(), pass.value);
            resolve();
          } else {
            await sendPasswordReset(email.value.trim());
            mode = 'login';
            render('Email enviado: revisa tu bandeja (y spam) y sigue el enlace para crear una contraseña nueva.', 'ok');
            return;
          }
        } catch (e) {
          render(String(e.message));
          return;
        } finally { go.disabled = false; }
      };
      go.addEventListener('click', submit);
      el.querySelectorAll('input').forEach(i =>
        i.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') submit(); }));
      email.focus();
    }

    render();
  });
}

/**
 * Shows the paywall / premium upsell; resolves when a re-check finds an active
 * subscription. In 'free-ads' mode it is dismissible ("seguir gratis").
 */
export function showPaywall() {
  return new Promise((resolve) => {
    const el = overlay();
    const freeMode = APP_CONFIG.monetization?.mode === 'free-ads';

    function render(extra = '') {
      const until = session.sub?.until ? new Date(session.sub.until).toLocaleDateString('es') : null;
      el.innerHTML = `
        <div class="gate-card">
          <div class="brand" style="border:none;padding:0 0 14px">
            <div class="brand-icon">${freeMode ? '✨' : '🔒'}</div>
            <div class="brand-text">
              <div class="brand-title">${freeMode ? 'Premium — sin anuncios' : 'Suscripción necesaria'}</div>
              <div class="brand-sub">${escapeHtml(session.email || '')}</div>
            </div>
          </div>
          ${extra ? `<div class="error-box" style="margin-bottom:10px">${escapeHtml(extra)}</div>` : ''}
          <p style="font-size:13px;color:var(--text-dim);margin-bottom:12px">
            ${freeMode
              ? 'Apoya el desarrollo y usa la app sin anuncios. El resto de funciones son gratis igual.'
              : (session.sub?.trial ? 'Tu periodo de prueba terminó.' : until ? `Tu suscripción venció el ${until}.` : 'No encontramos una suscripción activa en tu cuenta.') +
                ' Actívala y vuelve a verificar — el sistema se desbloquea solo al detectar el pago.'}
          </p>
          ${APP_CONFIG.payments.workerUrl
            ? `<button class="btn" id="gate-pay">💳 Suscribirme con Mercado Pago</button>`
            : '<div class="error-box">El vendedor aún no configuró el backend de pagos (config.js → payments.workerUrl).</div>'}
          <button class="btn secondary" id="gate-recheck" style="margin-top:8px">🔄 Ya pagué — verificar</button>
          <div class="gate-links">
            ${freeMode ? '<a id="gate-free">Seguir gratis (con anuncios)</a>' : ''}
            <a id="gate-logout">Cerrar sesión</a>
          </div>
        </div>`;

      el.querySelector('#gate-free')?.addEventListener('click', () => {
        el.style.display = 'none';
        resolve();
      });

      el.querySelector('#gate-pay')?.addEventListener('click', async () => {
        const btn = el.querySelector('#gate-pay');
        btn.disabled = true;
        btn.textContent = 'Creando checkout…';
        try {
          const { freshIdToken } = await import('../auth.js');
          const idToken = await freshIdToken();
          const res = await window.albion.postJson(`${APP_CONFIG.payments.workerUrl}/checkout`, { idToken });
          if (!res.ok || !res.data?.init_point) throw new Error(res.data?.error || res.error || 'error del backend');
          window.albion.openExternal(res.data.init_point);
          render('Se abrió el pago en tu navegador. Cuando termines, vuelve aquí y pulsa "Ya pagué — verificar".');
        } catch (e) {
          render('No se pudo crear el checkout: ' + String(e.message));
        }
      });
      el.querySelector('#gate-logout').addEventListener('click', async () => {
        await signOut();
        location.reload();
      });
      el.querySelector('#gate-recheck').addEventListener('click', async () => {
        const btn = el.querySelector('#gate-recheck');
        btn.disabled = true;
        const sub = await checkSubscription();
        if (sub.active) { resolve(); return; }
        btn.disabled = false;
        render('Todavía no vemos el pago acreditado. Puede tardar 1-2 minutos tras pagar; reintenta enseguida.');
      });
    }

    render();
  });
}
