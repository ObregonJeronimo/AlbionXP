// Config de la landing. Edita estos valores y vuelve a publicar la web.
window.SITE = {
  // Botón donar (Cafecito).
  donateUrl: 'https://cafecito.app/albionxp',
  // Banners laterales (Monetag "Native Banner"). Pegá acá el ID de zona para
  // encenderlos en los dos costados. Vacío = espacio reservado (sin banner).
  adZone: '',
  adDomain: 'nap5k.com',
  contactEmail: 'jeroobregon03@gmail.com',
  // URL del worker de analítica (se rellena tras desplegar el worker). Vacío = sin conteo de visitas.
  analyticsUrl: 'https://albion-pagos.albionxp.workers.dev',
};

// Beacon de visita (cuenta visitas para el panel de admin). No bloquea nada.
(function () {
  var u = window.SITE && window.SITE.analyticsUrl;
  if (u && navigator.sendBeacon) { try { navigator.sendBeacon(u.replace(/\/$/, '') + '/hit'); } catch (e) {} }
})();
