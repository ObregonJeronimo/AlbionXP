/* Donaciones — interfaz propia (reemplaza a Cafecito). Al tocar "Donar" abre un
   modal con dos métodos:
     • Mercado Pago (ARS, pago único): crea el pago en el worker y abre el checkout.
     • Cripto USDT (TRC-20): muestra la dirección + un monto EXACTO único; cuando la
       red confirma, el worker lo carga solo al muro de donaciones.
   El muro (nombre + monto + comentario + fecha) se llena SOLO, sin verificar a mano.
   Autocontenida: inyecta su propio CSS y se engancha a #donate-btn / .hdon / [data-donate]. */
(function () {
  var S = window.SITE || {};
  var WORKER = (S.analyticsUrl || 'https://albion-pagos.albionxp.workers.dev').replace(/\/$/, '');
  var cfg = null; // se cachea la config del worker (métodos + mínimos)
  // Bilingüe: sigue el mismo idioma que la app (localStorage 'lang'). En la landing (siempre ES) queda en español.
  var LANG = (function () { try { return localStorage.getItem('lang') === 'en' ? 'en' : 'es'; } catch (e) { return 'es'; } })();
  function L(es, en) { return LANG === 'en' ? en : es; }

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  function injectCss() {
    if (document.getElementById('don-css')) return;
    var s = document.createElement('style'); s.id = 'don-css';
    s.textContent =
      '#don-ov{position:fixed;inset:0;z-index:100001;background:rgba(8,7,5,.72);-webkit-backdrop-filter:blur(5px);backdrop-filter:blur(5px);display:flex;align-items:center;justify-content:center;padding:16px;font-family:"Alegreya Sans",system-ui,sans-serif}' +
      '#don-card{width:100%;max-width:440px;max-height:92vh;overflow:auto;background:#1a1610;border:1px solid #4a3a22;border-radius:18px;padding:24px 22px;color:#e7ddc7;box-shadow:0 24px 70px rgba(0,0,0,.6);position:relative}' +
      '#don-card h3{font-family:"Cinzel",serif;color:#f2c877;font-size:20px;margin:0 0 6px;text-align:center}' +
      '#don-card .don-sub{font-size:13.5px;color:#cabfa6;text-align:center;line-height:1.5;margin:0 0 14px}' +
      '#don-x{position:absolute;top:12px;right:14px;background:none;border:0;color:#9c9179;font-size:24px;cursor:pointer;line-height:1}' +
      '.don-tabs{display:flex;gap:8px;margin-bottom:14px}' +
      '.don-tab{flex:1;padding:10px;border-radius:10px;border:1px solid #4a3a22;background:transparent;color:#cabfa6;cursor:pointer;font-weight:700;font-size:13.5px}' +
      '.don-tab.on{background:linear-gradient(180deg,#f2c877,#d9a441);color:#1a1305;border-color:#d9a441}' +
      '.don-f{display:block;margin:0 0 10px}' +
      '.don-f label{display:block;font-size:12.5px;color:#9c9179;margin:0 0 4px}' +
      '.don-in{width:100%;box-sizing:border-box;background:#12100b;border:1px solid #4a3a22;border-radius:9px;color:#e7ddc7;padding:10px 12px;font-size:14px;font-family:inherit}' +
      '.don-in:focus{outline:none;border-color:#d9a441}' +
      '.don-amt{display:flex;align-items:center;gap:8px}' +
      '.don-amt .don-cur{font-family:"Cinzel",serif;color:#d9a441;font-weight:700}' +
      '.don-note{font-size:12px;color:#9c9179;margin:2px 0 12px;line-height:1.45}' +
      '.don-btn{width:100%;font-family:"Cinzel",serif;font-weight:700;font-size:15px;padding:13px;border-radius:11px;border:0;cursor:pointer;background:linear-gradient(180deg,#f2c877,#d9a441);color:#1a1305}' +
      '.don-btn[disabled]{opacity:.55;cursor:default}' +
      '.don-err{color:#f0a3a3;font-size:13px;margin-top:10px;min-height:1px;text-align:center}' +
      '.don-copy{background:#12100b;border:1px solid #4a3a22;border-radius:9px;padding:10px 12px;display:flex;align-items:center;justify-content:space-between;gap:10px;margin:0 0 10px}' +
      '.don-copy code{color:#e7ddc7;font-size:13px;word-break:break-all}' +
      '.don-copy button{background:#d9a441;border:0;border-radius:7px;color:#1a1305;font-weight:700;padding:6px 10px;cursor:pointer;font-size:12px;white-space:nowrap}' +
      '.don-ok{text-align:center;font-size:14px;color:#cabfa6;line-height:1.55}' +
      '.don-ok .big{font-family:"Cinzel",serif;color:#f2c877;font-size:26px;display:block;margin:6px 0}';
    document.head.appendChild(s);
  }

  function close() { var o = document.getElementById('don-ov'); if (o) o.remove(); }

  function copyRow(label, value) {
    return '<div class="don-f"><label>' + esc(label) + '</label><div class="don-copy"><code>' + esc(value) +
      '</code><button type="button" data-copy="' + esc(value) + '">' + L('Copiar', 'Copy') + '</button></div></div>';
  }

  function render() {
    injectCss();
    close();
    var methods = [];
    if (!cfg || cfg.mp) methods.push('mp');
    if (cfg && cfg.crypto) methods.push('crypto');
    if (!methods.length) methods.push('mp');
    var cur = methods[0];
    var mpMin = (cfg && cfg.mpMin) || 5000;
    var usdtMin = (cfg && cfg.usdtMin) || 2;

    var ov = document.createElement('div'); ov.id = 'don-ov';
    var card = document.createElement('div'); card.id = 'don-card';
    ov.appendChild(card);
    document.body.appendChild(ov);
    ov.addEventListener('click', function (e) { if (e.target === ov) close(); });

    function tabsHtml() {
      if (methods.length < 2) return '';
      return '<div class="don-tabs">' + methods.map(function (m) {
        return '<button type="button" class="don-tab' + (m === cur ? ' on' : '') + '" data-m="' + m + '">' +
          (m === 'mp' ? '💳 Mercado Pago' : '🪙 Cripto (USDT)') + '</button>';
      }).join('') + '</div>';
    }

    function form() {
      var isMp = cur === 'mp';
      var min = isMp ? mpMin : usdtMin;
      var curLabel = isMp ? 'ARS' : 'USDT';
      return tabsHtml() +
        '<div class="don-f"><label>' + L('Tu nombre (aparece en el muro)', 'Your name (shown on the wall)') + '</label><input class="don-in" id="don-name" maxlength="40" placeholder="' + L('Nombre', 'Name') + '" /></div>' +
        '<div class="don-f"><label>' + L('Mensaje (opcional)', 'Message (optional)') + '</label><textarea class="don-in" id="don-msg" rows="2" maxlength="160" placeholder="' + L('Dejá un saludo…', 'Leave a message…') + '"></textarea></div>' +
        '<div class="don-f"><label>' + L('Monto', 'Amount') + '</label><div class="don-amt"><input class="don-in" id="don-amt" type="number" min="' + min + '" step="' + (isMp ? '100' : '1') + '" value="' + min + '" /><span class="don-cur">' + curLabel + '</span></div></div>' +
        '<p class="don-note">' + L('Ponemos un mínimo de ', 'We set a minimum of ') + '<b>' + (isMp ? ('$' + mpMin + ' ARS') : (usdtMin + ' USDT')) + '</b>' + L(' solo para evitar spam en el muro de donaciones. ¡Se agradece la comprensión! 🙏', ' just to avoid spam on the donation wall. Thanks for understanding! 🙏') + '</p>' +
        '<button class="don-btn" id="don-go">' + (isMp ? L('Donar con Mercado Pago', 'Donate with Mercado Pago') : L('Generar dirección de pago', 'Generate payment address')) + '</button>' +
        '<div class="don-err" id="don-err"></div>';
    }

    function paint() {
      card.innerHTML = '<button id="don-x" type="button" aria-label="Cerrar">×</button>' +
        '<h3>' + L('Apoyá el proyecto ☕', 'Support the project ☕') + '</h3>' +
        '<p class="don-sub">' + L('Albion Silver Hub es 100% gratis. Si te hizo plata y querés dar una mano, entrás al muro con tu nombre, monto y mensaje.', 'Albion Silver Hub is 100% free. If it made you silver and you want to help, you join the wall with your name, amount and message.') + '</p>' +
        form();
      card.querySelector('#don-x').onclick = close;
      [].forEach.call(card.querySelectorAll('.don-tab'), function (t) {
        t.onclick = function () { cur = t.getAttribute('data-m'); paint(); };
      });
      card.querySelector('#don-go').onclick = submit;
    }

    function submit() {
      var err = card.querySelector('#don-err'); err.textContent = '';
      var name = (card.querySelector('#don-name').value || '').trim();
      var msg = (card.querySelector('#don-msg').value || '').trim();
      var amt = Number(card.querySelector('#don-amt').value || 0);
      var btn = card.querySelector('#don-go');
      var isMp = cur === 'mp';
      var min = isMp ? mpMin : usdtMin;
      if (!(amt >= min)) { err.textContent = L('El mínimo es ', 'The minimum is ') + (isMp ? ('$' + mpMin + ' ARS') : (usdtMin + ' USDT')) + '.'; return; }
      btn.disabled = true; btn.textContent = L('Procesando…', 'Processing…');
      if (isMp) {
        fetch(WORKER + '/donate/mp', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: name, msg: msg, amount: Math.floor(amt) }) })
          .then(function (r) { return r.json(); })
          .then(function (j) {
            if (j.init_point) { window.location.href = j.init_point; }
            else { err.textContent = j.error || L('No se pudo crear el pago.', 'Could not create the payment.'); btn.disabled = false; btn.textContent = L('Donar con Mercado Pago', 'Donate with Mercado Pago'); }
          })
          .catch(function () { err.textContent = L('Error de red. Probá de nuevo.', 'Network error. Try again.'); btn.disabled = false; btn.textContent = L('Donar con Mercado Pago', 'Donate with Mercado Pago'); });
      } else {
        fetch(WORKER + '/donate/crypto', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: name, msg: msg, usd: Math.floor(amt) }) })
          .then(function (r) { return r.json(); })
          .then(function (j) {
            if (j.address) { cryptoView(j); }
            else { err.textContent = j.error || L('No se pudo generar la dirección.', 'Could not generate the address.'); btn.disabled = false; btn.textContent = L('Generar dirección de pago', 'Generate payment address'); }
          })
          .catch(function () { err.textContent = L('Error de red. Probá de nuevo.', 'Network error. Try again.'); btn.disabled = false; btn.textContent = L('Generar dirección de pago', 'Generate payment address'); });
      }
    }

    function cryptoView(j) {
      card.innerHTML = '<button id="don-x" type="button" aria-label="Cerrar">×</button>' +
        '<h3>' + L('Enviá exactamente este monto 🪙', 'Send exactly this amount 🪙') + '</h3>' +
        '<p class="don-sub">' + L('Red: ', 'Network: ') + '<b>' + esc(j.network) + '</b>. ' + L('Mandá el <b>monto exacto</b> (así lo reconocemos automáticamente) a esta dirección. En cuanto la red confirme, aparecés en el muro.', 'Send the <b>exact amount</b> (that\'s how we recognize it automatically) to this address. As soon as the network confirms, you appear on the wall.') + '</p>' +
        copyRow(L('Monto EXACTO a enviar', 'EXACT amount to send'), j.exactAmount + ' USDT') +
        copyRow(L('Dirección (TRC-20)', 'Address (TRC-20)'), j.address) +
        '<p class="don-note">' + L('⚠️ Enviá <b>USDT por la red TRON (TRC-20)</b>, no otra red. El monto tiene decimales únicos a propósito: es lo que nos deja identificar tu donación sin que tengas que avisar. Tenés ~', '⚠️ Send <b>USDT over the TRON network (TRC-20)</b>, not another one. The amount has unique decimals on purpose: that\'s what lets us identify your donation without you telling us. You have ~') + (j.expiresMin || 60) + ' min.</p>' +
        '<div class="don-ok">' + L('Cuando pagues, cerrá esto tranquilo. Tu donación se carga sola al muro en unos minutos. ¡Gracias! 🙌', 'Once you pay, you can close this. Your donation loads onto the wall by itself in a few minutes. Thanks! 🙌') + '</div>';
      card.querySelector('#don-x').onclick = close;
      [].forEach.call(card.querySelectorAll('[data-copy]'), function (b) {
        b.onclick = function () {
          var v = b.getAttribute('data-copy');
          try { navigator.clipboard.writeText(v); b.textContent = L('¡Copiado!', 'Copied!'); setTimeout(function () { b.textContent = L('Copiar', 'Copy'); }, 1500); } catch (e) {}
        };
      });
    }

    paint();
  }

  // Abre el modal. Trae la config del worker una vez (métodos + mínimos) y luego renderiza.
  function openDonate(e) {
    if (e && e.preventDefault) e.preventDefault();
    if (cfg) { render(); return; }
    fetch(WORKER + '/donate/config').then(function (r) { return r.json(); })
      .then(function (j) { cfg = j || {}; render(); })
      .catch(function () { cfg = { mp: true, mpMin: 5000, crypto: false, usdtMin: 2 }; render(); });
  }
  window.openDonate = openDonate;

  function wire() {
    [].forEach.call(document.querySelectorAll('#donate-btn, .hdon, [data-donate]'), function (el) {
      el.setAttribute('href', 'javascript:void(0)');
      el.addEventListener('click', openDonate);
    });
  }
  if (document.readyState !== 'loading') wire();
  else document.addEventListener('DOMContentLoaded', wire);
})();
