// Distribution config. Everything here is PUBLIC-BY-DESIGN (the Firebase Web
// API key is an identifier, not a secret — security lives in Firestore rules).
// While `firebase.apiKey` is empty the app runs in LOCAL MODE: no login, all
// features unlocked (development / personal use).
export const APP_CONFIG = {
  // Firebase se usa SOLO para el foro dentro de la app (login para comentar/votar).
  // La app en sí es gratis y sin login: leer el foro es libre. Claves públicas por diseño.
  firebase: {
    apiKey: 'AIzaSyDoHnt236PRLeeTem_NwUUb1iu0XHzqxNU',
    projectId: 'albionxp-eef13',
  },
  forumEnabled: true,
  payments: {
    // URL del Cloudflare Worker (backend/worker/worker.js desplegado).
    // ej: 'https://albion-pagos.tu-usuario.workers.dev'
    workerUrl: '',
    // Días de prueba gratis al registrarse (solo aplica en modo 'subscription')
    trialDays: 3,
  },
  monetization: {
    // 'free-ads'     → app gratis con anuncios rotativos (modelo actual).
    // 'subscription' → paywall duro (código latente; no se usa).
    mode: 'free-ads',
    // Rotación del banner en segundos
    rotateSeconds: 45,
    // URL de un JSON con las campañas de anuncios (para cambiar anuncios sin
    // recompilar). Ej: 'https://tu-sitio.com/ads.json'. Vacío = anuncios locales.
    adsUrl: '',
  },
  // Enlaces a la comunidad. Valores por defecto; se sobrescriben en caliente
  // desde appconfig.json en la web (ver renderer/js/remoteconfig.js).
  community: {
    siteUrl: 'https://albion-xp.vercel.app/',
    forumUrl: '',   // el foro está dentro de la app (no es un link externo)
    donateUrl: '',  // se rellena desde appconfig.json cuando tengas Cafecito
  },
  appName: 'Albion Silver Hub',
};

export function isDistributionMode() {
  return Boolean(APP_CONFIG.firebase.apiKey && APP_CONFIG.firebase.projectId);
}
