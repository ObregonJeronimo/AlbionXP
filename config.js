// Config de la landing. Edita estos valores y vuelve a publicar la web.
window.SITE = {
  // Botón donar (Cafecito).
  donateUrl: 'https://cafecito.app/albionxp',
  // Banners laterales (Adsterra "Banner"). key + tamaño de la unidad. Se muestran
  // en los dos costados (solo en pantallas anchas). Vacío = espacio reservado.
  adsterra: { key: '1d84b06ebcdbf4d27880331ce7a9f3ea', width: 160, height: 600 },
  // Interstitial: cuadrado centrado con X, cada ~10 min, SOLO en móvil (Adsterra Banner 300x250).
  // Pegá la key de la unidad 300x250 para encenderlo (vacío = no aparece nada).
  adsterraInterstitial: { key: '81e00be4e5da81db8ef08cce2a34d944', width: 300, height: 250 },
  contactEmail: 'jeroobregon03@gmail.com',
  // URL del worker de analítica (se rellena tras desplegar el worker). Vacío = sin conteo de visitas.
  analyticsUrl: 'https://albion-pagos.albionxp.workers.dev',
};

// Beacon de visita (cuenta visitas para el panel de admin). No bloquea nada.
(function () {
  var u = window.SITE && window.SITE.analyticsUrl;
  if (u && navigator.sendBeacon) { try { navigator.sendBeacon(u.replace(/\/$/, '') + '/hit'); } catch (e) {} }
})();
