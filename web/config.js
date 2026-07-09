// Config de la landing. Edita estos valores y vuelve a publicar la web.
window.SITE = {
  // Botón donar (Cafecito).
  donateUrl: 'https://cafecito.app/albionxp',
  // Banners laterales (Adsterra "Banner"). key + tamaño de la unidad. Se muestran
  // en los dos costados (solo en pantallas anchas). Vacío = espacio reservado.
  adsterra: { key: '1d84b06ebcdbf4d27880331ce7a9f3ea', width: 160, height: 600 },
  contactEmail: 'jeroobregon03@gmail.com',
  // URL del worker de analítica (se rellena tras desplegar el worker). Vacío = sin conteo de visitas.
  analyticsUrl: 'https://albion-pagos.albionxp.workers.dev',
};

// Beacon de visita (cuenta visitas para el panel de admin). No bloquea nada.
(function () {
  var u = window.SITE && window.SITE.analyticsUrl;
  if (u && navigator.sendBeacon) { try { navigator.sendBeacon(u.replace(/\/$/, '') + '/hit'); } catch (e) {} }
})();
