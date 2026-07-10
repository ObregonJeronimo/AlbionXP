/* Franjas de anuncios laterales. Crea dos columnas (izq/der) con un slot cada
   una. Cada slot muestra el banner de Adsterra (window.SITE.adsterra) dentro de
   un iframe AISLADO, así el atOptions de Adsterra nunca choca con la página ni
   entre los dos costados. Sin config, muestra un placeholder (no rompe nada).

   PARA CAMBIAR/AGREGAR BANNERS: editá config.js -> adsterra { key, width, height }
   con la unidad "Banner" que te da Adsterra en GET CODE. */
(function () {
  function adsterraFrame(a) {
    var w = a.width || 160, h = a.height || 600;
    var ifr = document.createElement('iframe');
    ifr.width = w; ifr.height = h; ifr.title = 'ad';
    ifr.setAttribute('scrolling', 'no'); ifr.setAttribute('frameborder', '0');
    ifr.style.cssText = 'border:0;display:block;max-width:100%';
    var opt = JSON.stringify({ key: a.key, format: 'iframe', height: h, width: w, params: {} });
    var C = '<' + '/script>';
    ifr.srcdoc = '<!doctype html><html><head><meta charset="utf-8">'
      + '<style>html,body{margin:0;padding:0;overflow:hidden;background:transparent}</style></head><body>'
      + '<script>atOptions=' + opt + ';' + C
      + '<script src="https://www.highperformanceformat.com/' + a.key + '/invoke.js">' + C
      + '</body></html>';
    return ifr;
  }
  function slot() {
    var d = document.createElement('div');
    d.className = 'ad-slot';
    var l = document.createElement('span');
    l.className = 'ad-lbl'; l.textContent = 'Publicidad';
    d.appendChild(l);
    var S = window.SITE || {};
    if (S.adsterra && S.adsterra.key) {
      d.appendChild(adsterraFrame(S.adsterra));
    } else {
      var p = document.createElement('div');
      p.className = 'ad-ph'; p.textContent = 'Espacio publicitario';
      d.appendChild(p);
    }
    return d;
  }
  function rail(side) {
    var r = document.createElement('aside');
    r.className = 'ad-rail ' + side;
    r.setAttribute('aria-hidden', 'true');
    r.appendChild(slot());
    return r;
  }
  // Interstitial móvil: cuadrado 300x250 centrado con overlay + X en la esquina,
  // una vez cada ~10 min (guardado en localStorage). Nunca supera la pantalla.
  function adInterstitial() {
    var S = window.SITE || {}, a = S.adsterraInterstitial;
    if (!a || !a.key) return;
    if (window.matchMedia && !window.matchMedia('(max-width:900px)').matches) return; // solo móvil
    var GAP = 10 * 60 * 1000; // 10 minutos
    function show() {
      if (document.getElementById('interst')) return;
      var last = 0; try { last = +localStorage.getItem('interst_last') || 0; } catch (e) {}
      if (Date.now() - last < GAP) return;
      try { localStorage.setItem('interst_last', '' + Date.now()); } catch (e) {}
      var o = document.createElement('div'); o.id = 'interst';
      var card = document.createElement('div'); card.className = 'interst-card';
      var x = document.createElement('button'); x.className = 'interst-x'; x.type = 'button';
      x.setAttribute('aria-label', 'Cerrar'); x.textContent = '×';
      x.onclick = function () { o.remove(); };
      o.addEventListener('click', function (e) { if (e.target === o) o.remove(); }); // tocar afuera cierra
      card.appendChild(adsterraFrame(a));
      o.appendChild(x); o.appendChild(card);
      document.body.appendChild(o);
    }
    setTimeout(show, 45000);      // primera aparición a los 45 s
    setInterval(show, 60000);     // luego revisa cada minuto si ya pasaron los 10
  }
  function init() {
    if (!document.querySelector('.ad-rail')) {
      document.body.appendChild(rail('left'));
      document.body.appendChild(rail('right'));
    }
    adInterstitial();
  }
  if (document.readyState !== 'loading') init();
  else document.addEventListener('DOMContentLoaded', init);
})();
