# Qué falta para dejarlo listo (modelo gratis + anuncios)

La app es **gratis, sin login para usarla, con anuncios** y **se actualiza sola**. El foro va
dentro de la app (login solo para comentar/votar). La web es informativa y trae la descarga.

**Cómo trabajamos:** tú creas/activas lo de las cuentas; cada vez que veas **📋** me pegas ese
valor y yo hago la parte técnica (config, publicar, recompilar).

---

## FASE A — Firebase: activar el foro · ~5 min

Tu proyecto `albionxp-eef13` ya existe y ya cargué tus claves en la app. Faltan **2 toggles**
(los detecté en vivo: el registro da `ADMIN_ONLY_OPERATION` y Firestore da `PERMISSION_DENIED`):

1. **Activar el login por email:**
   Firebase Console → tu proyecto → **Authentication** → pestaña **Sign-in method** →
   **Email/Password** → **Habilitar** (solo el primer interruptor) → Guardar.

2. **Publicar las reglas del foro** (para que se pueda leer/escribir con seguridad):
   Firebase Console → **Firestore Database** → pestaña **Reglas** → borra lo que haya y pega
   el contenido de [backend/firestore.rules](../backend/firestore.rules) → **Publicar**.

Con esas dos cosas el foro queda 100% funcional. Avísame y lo pruebo en vivo (creo una cuenta
de prueba y publico un tema para confirmar).

> Nota: el archivo `.json` del service account que descargaste NO hace falta para nada del
> modelo actual (era para pagos, que ya no usamos). Guárdalo o bórralo; no va en la app.

---

## FASE B — GitHub: descarga + auto-actualización · ~10 min

El instalador se aloja en **GitHub Releases** (gratis, descargas ilimitadas) y desde ahí la app
se auto-actualiza. Cada vez que yo saque una versión nueva, tus usuarios la reciben solos.

1. Crea una cuenta en **https://github.com** (si no tienes) y un repositorio **público**
   llamado `albion-silver-hub`.

   **📋 Cópiame:** tu **usuario de GitHub** (para poner `owner`/`repo` en la config de publicación).

2. Crea un **token** para publicar releases: GitHub → foto de perfil → **Settings** →
   **Developer settings** → **Personal access tokens** → **Tokens (classic)** →
   **Generate new token** → marca el permiso **`repo`** → generar.

   **📋 Cópiame:** ese token (empieza con `ghp_...`). Con él yo publico la primera release
   (`npm run release`) y las siguientes actualizaciones.

> Sin firma de código, Windows SmartScreen dirá "editor desconocido" las primeras descargas.
> Es normal en apps indie; se puede firmar más adelante (los certificados cuestan dinero, no es
> urgente).

---

## FASE C — Publicar la web · ~10 min

La web (`web/`) es estática: se puede alojar gratis en varios sitios. Recomendado por facilidad:
**Cloudflare Pages** o **Netlify** (arrastras la carpeta `web/` y listo) o **GitHub Pages**.

1. Elige uno y publícala (te guío con el que prefieras).
2. En `web/config.js` pon:
   - `downloadUrl` → el link directo del instalador en GitHub Releases
     (ej. `https://github.com/TU-USUARIO/albion-silver-hub/releases/latest/download/AlbionSilverHub-Setup-0.1.0.exe`).
   - `donateUrl` → tu link de donaciones (ver Fase E).
   (Yo lo relleno cuando tengamos los links).

---

## FASE D — Enlaces de comunidad en la app · lo hago yo

Cuando la web esté publicada, pego su URL (y la de donar) en `renderer/js/config.js` →
`community`, y aparecen los enlaces "🌐 Web / 💬 Foro / ❤️ Donar" en la barra de la app.

---

## FASE E — Que los anuncios y donaciones te paguen · continuo

### Donaciones (recomendado para Argentina)
- **Cafecito** → https://cafecito.app — registras y te dan un link tipo `cafecito.app/tu-usuario`.
  Cobra por Mercado Pago, sin fricción. Es el "invítame un café" argentino.
- Alternativas internacionales: **Ko-fi** (0% comisión), **PayPal.me**.

  **📋 Cópiame:** tu link de Cafecito/Ko-fi y lo pongo en la web y en la app.

### Anuncios que de verdad pagan
Regístrate gratis (te doy los links) y me pasas tu enlace de afiliado; yo lo cargo en los
anuncios de la app (se cambian sin recompilar):
- **Eneba Affiliates** (keys de juegos, audiencia perfecta) → https://www.eneba.com/affiliates
- **Amazon Afiliados** (periféricos) → https://afiliados.amazon.es
- **VPNs** (NordVPN/Surfshark; pagan mucho por conversión).
- **Patrocinio directo:** vende el slot por mes a gremios/creadores de Albion (lo que más paga).

En la **web** además puedes poner **Google AdSense** (sí está permitido en sitios web, a
diferencia de las apps de escritorio) cuando tengas dominio propio y tráfico.

---

## Resumen: lo mínimo para lanzar YA

1. **Fase A** (2 toggles en Firebase) → foro funcionando.
2. **Fase B** (usuario + token de GitHub) → yo publico la release y queda la descarga + auto-update.
3. **Fase C** (publicar `web/`) → tienes la página con el botón de descarga.

Con eso ya puedes repartir el link. Donaciones y afiliados (Fase E) los sumas cuando quieras,
sin recompilar nada.
