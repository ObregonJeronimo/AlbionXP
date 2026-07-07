// Config de la landing. Edita estos valores y vuelve a publicar la web.
window.SITE = {
  version: '0.1.5',
  // Link directo al instalador en GitHub Releases de tu repo AlbionXP.
  downloadUrl: 'https://github.com/ObregonJeronimo/AlbionXP/releases/download/v0.1.5/AlbionSilverHub-Setup-0.1.5.exe',
  // Botón donar (Cafecito).
  donateUrl: 'https://cafecito.app/albionxp',
  contactEmail: 'jeroobregon03@gmail.com',
  // URL del worker de analítica (se rellena tras desplegar el worker). Vacío = sin conteo de visitas.
  analyticsUrl: '',
};

// Beacon de visita (cuenta visitas para el panel de admin). No bloquea nada.
(function () {
  var u = window.SITE && window.SITE.analyticsUrl;
  if (u && navigator.sendBeacon) { try { navigator.sendBeacon(u.replace(/\/$/, '') + '/hit'); } catch (e) {} }
})();
