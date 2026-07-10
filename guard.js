/* Muro anti-adblock. Los anuncios son la única forma de sostener el proyecto
   gratis; si el visitante tiene un bloqueador, no cargan. Detectamos el bloqueo
   y mostramos un muro pidiendo desactivarlo (o donar). Va SOLO en la app
   (herramientas), no en la landing. Nombre de archivo neutro a propósito para
   que el propio adblock no lo bloquee. */
(function () {
  // Muro DESACTIVADO a propósito: en Reddit/comunidades un anti-adblock wall
  // genera rechazo inmediato. Para reactivarlo, poné ENABLED = true.
  var ENABLED = false;
  if (!ENABLED) return;
  var KEY = '1d84b06ebcdbf4d27880331ce7a9f3ea';
  var DON = (window.SITE && window.SITE.donateUrl) || 'https://cafecito.app/albionxp';
  var shown = false;

  function injectCss() {
    var s = document.createElement('style');
    s.textContent =
      '#adblock-wall{position:fixed;inset:0;z-index:100000;background:rgba(8,7,5,.94);' +
      '-webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px);display:flex;align-items:center;' +
      'justify-content:center;padding:20px;font-family:"Alegreya Sans",system-ui,sans-serif}' +
      '#adblock-wall .abw-box{max-width:520px;background:#1a1610;border:1px solid #4a3a22;border-radius:18px;' +
      'padding:32px 30px;text-align:center;color:#e7ddc7;box-shadow:0 24px 70px rgba(0,0,0,.6)}' +
      '#adblock-wall .abw-ico{font-size:44px;margin-bottom:6px}' +
      '#adblock-wall h2{font-family:"Cinzel",serif;color:#f2c877;font-size:22px;margin:0 0 14px;line-height:1.25}' +
      '#adblock-wall p{font-size:15px;line-height:1.6;color:#cabfa6;margin:0 0 14px}' +
      '#adblock-wall b{color:#f2c877}' +
      '#adblock-wall .abw-btns{display:flex;flex-direction:column;gap:10px;margin-top:20px}' +
      '#adblock-wall .abw-btn{font-family:"Cinzel",serif;font-weight:700;font-size:14px;padding:12px 20px;' +
      'border-radius:10px;border:0;cursor:pointer;background:linear-gradient(180deg,#f2c877,#d9a441);' +
      'color:#1a1305;text-decoration:none;display:block}' +
      '#adblock-wall .abw-btn.ghost{background:transparent;border:1px solid #4a3a22;color:#cabfa6}' +
      '#adblock-wall .abw-how{font-size:12.5px;color:#9c9179;margin:18px 0 0}';
    document.head.appendChild(s);
  }

  function wall() {
    if (shown) return; shown = true;
    injectCss();
    var o = document.createElement('div');
    o.id = 'adblock-wall';
    o.innerHTML =
      '<div class="abw-box"><div class="abw-ico">🛡️</div>' +
      '<h2>Che, tenés un bloqueador de anuncios</h2>' +
      '<p>Albion Silver Hub es <b>100% gratis</b> y sin límites. Lo bancamos con unos pocos anuncios ' +
      'discretos — es la única forma de cubrir los costos y de que los que hacemos esto podamos, bueno… ' +
      '<b>comer</b> 😅.</p>' +
      '<p>Desactivá el bloqueador <b>para este sitio</b> y recargá. Con eso ya nos das una mano enorme. ' +
      '¡Gracias por bancar el proyecto! 🙌</p>' +
      '<div class="abw-btns">' +
      '<button class="abw-btn" id="abw-reload">Ya lo desactivé — Recargar</button>' +
      '<a class="abw-btn ghost" href="' + DON + '" target="_blank" rel="noopener">…o apoyanos con una donación ☕</a>' +
      '</div>' +
      '<p class="abw-how">Tocá el ícono de tu bloqueador (arriba a la derecha del navegador) → ' +
      '“Desactivar en este sitio” / “Pause on this site” → recargá.</p></div>';
    document.body.appendChild(o);
    var r = document.getElementById('abw-reload');
    if (r) r.onclick = function () { location.reload(); };
    try { document.documentElement.style.overflow = 'hidden'; } catch (e) {}
  }

  function check() {
    // Elemento cebo con clases que los bloqueadores ocultan por reglas cosméticas.
    var bait = document.createElement('div');
    bait.className = 'adsbox ad-banner ads ad-placement pub_300x250 text-ad sponsorship banner_ad';
    bait.style.cssText = 'position:absolute;left:-9999px;top:-9999px;height:12px;width:12px';
    (document.body || document.documentElement).appendChild(bait);

    var settled = false;
    function verdict(networkBlocked) {
      if (settled) return; settled = true;
      var hidden = !document.body.contains(bait) || bait.offsetHeight === 0 ||
        bait.clientHeight === 0 || bait.offsetParent === null ||
        getComputedStyle(bait).display === 'none';
      try { bait.parentNode.removeChild(bait); } catch (e) {}
      if (networkBlocked || hidden) wall();
    }

    // Script cebo al dominio real de anuncios: si el adblock lo bloquea, onerror.
    var s = document.createElement('script');
    s.onerror = function () { verdict(true); };                       // bloqueo de red = adblock
    s.onload = function () { setTimeout(function () { verdict(false); }, 150); }; // cargó: solo cebo cosmético
    s.src = 'https://www.highperformanceformat.com/' + KEY + '/invoke.js?g=' + (new Date().getTime());
    (document.head || document.documentElement).appendChild(s);
    // Si el servidor está lento/caído (no adblock), NO forzamos bloqueo: revisamos solo el cebo.
    setTimeout(function () { verdict(false); }, 3500);
  }

  function boot() { setTimeout(check, 700); } // dale tiempo a que carguen los anuncios legítimos
  if (document.readyState !== 'loading') boot();
  else document.addEventListener('DOMContentLoaded', boot);
})();
