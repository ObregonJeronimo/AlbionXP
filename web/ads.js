/* Franjas de anuncios laterales. Crea dos columnas (izq/der) con un slot cada
   una. El slot se rellena con el "Native Banner" de Monetag si hay una zona
   configurada en config.js (window.SITE.adZone); si no, muestra un placeholder.

   PARA ENCENDER LOS BANNERS LATERALES:
   1) En Monetag > Sitios > (tu sitio) > crear una zona tipo "Native Banner".
   2) Copiá el ID de zona y pegalo en config.js:  adZone: '1234567'
      (y adDomain si Monetag te da otro dominio de script; por defecto nap5k.com)
   Con eso, los dos costados muestran banners reales. Sin zona, quedan como
   espacio reservado (no rompe nada). El In-Page Push ya funciona aparte. */
(function () {
  function slot() {
    var d = document.createElement('div');
    d.className = 'ad-slot';
    var l = document.createElement('span');
    l.className = 'ad-lbl'; l.textContent = 'Publicidad';
    d.appendChild(l);
    var S = window.SITE || {};
    var zone = S.adZone || '';
    var dom = S.adDomain || 'nap5k.com';
    if (zone) {
      var s = document.createElement('script');
      s.async = true; s.setAttribute('data-cfasync', 'false');
      s.src = '//' + dom + '/tag.min.js';
      s.setAttribute('data-zone', zone);
      d.appendChild(s);
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
