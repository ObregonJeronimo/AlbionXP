// In-app community forum. Reading is public; posting/commenting/voting needs a
// Firebase login (email + password). Login is inline — it never blocks the app.
import {
  listPostsCached as listPosts, getPost, createPost, deletePost,
  listComments, addComment, getVotes, setVote, clearVote,
} from '../forumdb.js';
import {
  session, signIn, signUp, signOut, sendPasswordReset, setDisplayName,
  sendEmailVerification, refreshVerification,
} from '../auth.js';
import { escapeHtml } from '../state.js';

// Only verified accounts can post/comment/vote (anti-spam).
function canParticipate() { return Boolean(session.uid && session.emailVerified); }

function when(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('es', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

export function renderForum(container) {
  container.innerHTML = `
    <h1 class="view-title">💬 Foro de la comunidad</h1>
    <p class="view-desc">Comparte rutas, pregunta dudas y vota los mejores aportes. Leer es libre;
      para publicar, comentar o votar necesitas una cuenta gratuita (solo email y contraseña).</p>
    <div id="forum-auth"></div>
    <div id="forum-body"></div>
  `;
  renderAuthBar(container);
  showList(container);
}

// ---------- Auth bar (inline, non-blocking) ----------
function renderAuthBar(container) {
  const el = container.querySelector('#forum-auth');
  if (session.uid) {
    const unverified = !session.emailVerified;
    el.innerHTML = `
      <div class="card" style="display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap">
        <span>👤 Conectado como <b>${escapeHtml(session.displayName || session.email)}</b>
          ${unverified ? '<span class="badge risk" style="margin-left:6px">email sin verificar</span>' : '<span class="badge safe" style="margin-left:6px">✓ verificado</span>'}</span>
        <button class="btn secondary" id="forum-logout">Cerrar sesión</button>
      </div>
      ${unverified ? `
      <div class="error-box" style="margin-bottom:16px">
        <b>Verifica tu email para participar.</b> Te enviamos un enlace a <b>${escapeHtml(session.email)}</b>
        (revisa spam). Podés leer el foro, pero para publicar, comentar o votar necesitás confirmar tu email.
        <div style="margin-top:8px">
          <button class="btn" id="fv-check">Ya verifiqué</button>
          <button class="btn secondary" id="fv-resend">Reenviar email</button>
          <span id="fv-msg" class="hint"></span>
        </div>
      </div>` : ''}`;
    el.querySelector('#forum-logout').addEventListener('click', async () => {
      await signOut();
      renderAuthBar(container);
      showList(container);
    });
    if (unverified) {
      const msg = el.querySelector('#fv-msg');
      el.querySelector('#fv-check').addEventListener('click', async (e) => {
        e.target.disabled = true;
        msg.textContent = 'Comprobando…';
        const ok = await refreshVerification().catch(() => false);
        if (ok) { renderAuthBar(container); showList(container); }
        else { msg.innerHTML = '<span class="neg">Todavía no aparece verificado. Abrí el enlace del email y reintentá.</span>'; e.target.disabled = false; }
      });
      el.querySelector('#fv-resend').addEventListener('click', async (e) => {
        e.target.disabled = true;
        try { await sendEmailVerification(); msg.innerHTML = '<span class="pos">Email reenviado.</span>'; }
        catch (err) { msg.innerHTML = `<span class="neg">${escapeHtml(String(err.message))}</span>`; }
        setTimeout(() => { e.target.disabled = false; }, 3000);
      });
    }
  } else {
    el.innerHTML = `
      <div class="card">
        <details>
          <summary style="cursor:pointer;font-weight:600">🔑 Inicia sesión o crea tu cuenta para participar</summary>
          <div id="forum-auth-forms" style="margin-top:12px"></div>
        </details>
      </div>`;
    renderAuthForms(container, 'login');
  }
}

function renderAuthForms(container, mode) {
  const host = container.querySelector('#forum-auth-forms');
  if (!host) return;
  host.innerHTML = `
    <div class="controls" style="margin:0">
      <div class="ctrl"><label>Email</label><input type="email" id="fa-email" placeholder="tu@email.com" /></div>
      ${mode !== 'reset' ? `<div class="ctrl"><label>Contraseña</label><input type="password" id="fa-pass" /></div>` : ''}
      ${mode === 'register' ? `<div class="ctrl"><label>Nombre en el foro</label><input type="text" id="fa-nick" placeholder="tu apodo" /></div>` : ''}
      <button class="btn" id="fa-go">${mode === 'login' ? 'Entrar' : mode === 'register' ? 'Crear cuenta' : 'Enviar recuperación'}</button>
    </div>
    <div class="gate-links" style="justify-content:flex-start">
      ${mode !== 'login' ? '<a data-m="login">Ya tengo cuenta</a>' : ''}
      ${mode !== 'register' ? '<a data-m="register">Crear cuenta nueva</a>' : ''}
      ${mode !== 'reset' ? '<a data-m="reset">Olvidé mi contraseña</a>' : ''}
    </div>
    <div id="fa-msg" class="hint" style="margin-top:8px"></div>
  `;
  host.querySelectorAll('.gate-links a').forEach(a =>
    a.addEventListener('click', () => renderAuthForms(container, a.dataset.m)));

  const msg = host.querySelector('#fa-msg');
  host.querySelector('#fa-go').addEventListener('click', async () => {
    const email = host.querySelector('#fa-email').value.trim();
    const pass = host.querySelector('#fa-pass')?.value || '';
    const btn = host.querySelector('#fa-go');
    btn.disabled = true;
    try {
      if (mode === 'login') {
        await signIn(email, pass);
      } else if (mode === 'register') {
        const nick = host.querySelector('#fa-nick').value.trim() || email.split('@')[0];
        await signUp(email, pass);
        try { await setDisplayName(nick); } catch (_) { /* nick opcional */ }
      } else {
        await sendPasswordReset(email);
        msg.innerHTML = '<span class="pos">Email de recuperación enviado. Revisa tu bandeja (y spam).</span>';
        btn.disabled = false;
        return;
      }
      renderAuthBar(container);
      showList(container);
    } catch (e) {
      msg.innerHTML = `<span class="neg">${escapeHtml(String(e.message))}</span>`;
      btn.disabled = false;
    }
  });
}

// ---------- Post list ----------
async function showList(container) {
  const body = container.querySelector('#forum-body');
  body.innerHTML = `
    ${canParticipate() ? `
      <div class="card">
        <h3>Nuevo tema</h3>
        <div class="ctrl" style="margin-bottom:8px"><input type="text" id="np-title" placeholder="Título (ej: Mejor ruta de refinado hoy)" maxlength="140" style="width:100%" /></div>
        <textarea id="np-body" placeholder="Cuenta tu ruta, duda o hallazgo…" rows="4" style="width:100%;background:var(--bg-elevated);color:var(--text);border:1px solid var(--border);border-radius:6px;padding:8px;font-family:inherit;resize:vertical"></textarea>
        <div style="margin-top:8px"><button class="btn" id="np-go">Publicar</button> <span id="np-msg" class="hint"></span></div>
      </div>` : ''}
    <div id="forum-list"><div class="loading"><span class="spinner"></span>Cargando temas…</div></div>
  `;

  if (canParticipate()) {
    body.querySelector('#np-go').addEventListener('click', async () => {
      const title = body.querySelector('#np-title').value.trim();
      const text = body.querySelector('#np-body').value.trim();
      const msg = body.querySelector('#np-msg');
      if (!title) { msg.innerHTML = '<span class="neg">Ponle un título.</span>'; return; }
      const btn = body.querySelector('#np-go');
      btn.disabled = true;
      try {
        await createPost(title, text);
        showList(container);
      } catch (e) {
        msg.innerHTML = `<span class="neg">${escapeHtml(String(e.message))}</span>`;
        btn.disabled = false;
      }
    });
  }

  const list = body.querySelector('#forum-list');
  try {
    const posts = await listPosts(50);
    if (!posts.length) {
      list.innerHTML = `<div class="card"><p>Todavía no hay temas. ${session.uid ? '¡Sé el primero en publicar!' : 'Inicia sesión y abre el primero.'}</p></div>`;
      return;
    }
    list.innerHTML = `<div class="card" style="padding:0">
      ${posts.map(p => `
        <div class="forum-row" data-id="${p._id}">
          <div class="forum-row-main">
            <div class="forum-row-title">${escapeHtml(p.title || '(sin título)')}</div>
            <div class="forum-row-meta">por ${escapeHtml(p.authorName || 'anónimo')} · ${when(p.createdAt)}</div>
          </div>
          <div class="forum-row-open">Abrir ›</div>
        </div>`).join('')}
    </div>`;
    list.querySelectorAll('.forum-row').forEach(row =>
      row.addEventListener('click', () => showDetail(container, row.dataset.id)));
  } catch (e) {
    list.innerHTML = `<div class="error-box">${escapeHtml(String(e.message))}</div>`;
  }
}

// ---------- Post detail ----------
async function showDetail(container, id) {
  const body = container.querySelector('#forum-body');
  body.innerHTML = `<div class="loading"><span class="spinner"></span>Cargando tema…</div>`;
  try {
    const [post, comments, votes] = await Promise.all([getPost(id), listComments(id), getVotes(id)]);
    const canDelete = session.uid && session.uid === post.authorUid;

    body.innerHTML = `
      <button class="btn secondary" id="fd-back" style="margin-bottom:12px">‹ Volver a los temas</button>
      <div class="card">
        <div style="display:flex;gap:14px;align-items:flex-start">
          <div class="vote-col">
            <button class="vote-btn ${votes.mine > 0 ? 'on' : ''}" id="fd-up" title="Me gusta">▲</button>
            <div class="vote-score" id="fd-score">${votes.score}</div>
            <button class="vote-btn ${votes.mine < 0 ? 'on down' : ''}" id="fd-down" title="No me gusta">▼</button>
          </div>
          <div style="flex:1">
            <h3 style="font-size:18px">${escapeHtml(post.title || '')}</h3>
            <div class="forum-row-meta" style="margin-bottom:10px">por ${escapeHtml(post.authorName || 'anónimo')} · ${when(post.createdAt)}
              ${canDelete ? ' · <a id="fd-del" style="color:var(--red);cursor:pointer">borrar</a>' : ''}</div>
            <div style="white-space:pre-wrap;line-height:1.6;font-size:14px">${escapeHtml(post.body || '')}</div>
          </div>
        </div>
      </div>

      <div class="card">
        <h3>${comments.length} comentario(s)</h3>
        <div id="fd-comments">
          ${comments.map(c => `
            <div class="comment">
              <div class="comment-meta">${escapeHtml(c.authorName || 'anónimo')} · ${when(c.createdAt)}</div>
              <div style="white-space:pre-wrap;font-size:13.5px;line-height:1.5">${escapeHtml(c.body || '')}</div>
            </div>`).join('') || '<p class="hint">Sé el primero en comentar.</p>'}
        </div>
        ${canParticipate() ? `
          <div style="margin-top:12px">
            <textarea id="fd-cbody" placeholder="Escribe un comentario…" rows="3" style="width:100%;background:var(--bg-elevated);color:var(--text);border:1px solid var(--border);border-radius:6px;padding:8px;font-family:inherit;resize:vertical"></textarea>
            <div style="margin-top:6px"><button class="btn" id="fd-csend">Comentar</button> <span id="fd-cmsg" class="hint"></span></div>
          </div>` : `<p class="hint">${session.uid ? 'Verifica tu email (arriba) para comentar o votar.' : 'Inicia sesión (arriba) para comentar o votar.'}</p>`}
      </div>
    `;

    body.querySelector('#fd-back').addEventListener('click', () => showList(container));
    if (canDelete) body.querySelector('#fd-del').addEventListener('click', async () => {
      if (!confirm('¿Borrar este tema?')) return;
      await deletePost(id).catch(() => {});
      showList(container);
    });

    // Voting
    const scoreEl = body.querySelector('#fd-score');
    const upBtn = body.querySelector('#fd-up');
    const downBtn = body.querySelector('#fd-down');
    let mine = votes.mine;
    async function vote(dir) {
      if (!session.uid) { alert('Inicia sesión (arriba) para votar.'); return; }
      try {
        if (mine === dir) { await clearVote(id); } else { await setVote(id, dir); }
        const v = await getVotes(id);
        mine = v.mine;
        scoreEl.textContent = v.score;
        upBtn.classList.toggle('on', v.mine > 0);
        downBtn.classList.toggle('on', v.mine < 0);
        downBtn.classList.toggle('down', v.mine < 0);
      } catch (e) { alert(String(e.message)); }
    }
    upBtn.addEventListener('click', () => vote(1));
    downBtn.addEventListener('click', () => vote(-1));

    // Commenting
    if (session.uid) {
      body.querySelector('#fd-csend').addEventListener('click', async () => {
        const text = body.querySelector('#fd-cbody').value.trim();
        const msg = body.querySelector('#fd-cmsg');
        if (!text) return;
        const btn = body.querySelector('#fd-csend');
        btn.disabled = true;
        try {
          await addComment(id, text);
          showDetail(container, id);
        } catch (e) {
          msg.innerHTML = `<span class="neg">${escapeHtml(String(e.message))}</span>`;
          btn.disabled = false;
        }
      });
    }
  } catch (e) {
    body.innerHTML = `<div class="error-box">${escapeHtml(String(e.message))}</div>
      <button class="btn secondary" id="fd-back2">‹ Volver</button>`;
    body.querySelector('#fd-back2').addEventListener('click', () => showList(container));
  }
}
