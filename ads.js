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
  function init() {
    if (document.querySelector('.ad-rail')) return;
    document.body.appendChild(rail('left'));
    document.body.appendChild(rail('right'));
  }
  if (document.readyState !== 'loading') init();
  else document.addEventListener('DOMContentLoaded', init);
})();
