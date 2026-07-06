# Panel de control privado (analítica)

Panel solo para vos con: **online en vivo**, **descargas**, **visitas** e ingresos.
Está en `https://albion-xp.vercel.app/admin.html` (con `noindex`, no sale en Google).

## Qué muestra y de dónde sale cada número

| Métrica | Fuente | Requiere |
|---|---|---|
| **Descargas** | API de GitHub Releases (real, exacto) | worker desplegado |
| **Visitas** (hoy/total) | contador propio en Firestore (beacon en la web) | worker + `analyticsUrl` en la web |
| **Online ahora** | latido anónimo de la app cada 60s (Firestore) | worker + próxima versión de la app |
| **CPM (Monetag)** | link a tu panel de Monetag* | — |
| **Donaciones (Cafecito / MP / cripto)** | links a Cafecito y Mercado Pago* | — |

\* Monetag, Cafecito y Mercado Pago no dan una API pública simple de ganancias, así que el
**monto exacto** se ve en su panel. El panel te deja el acceso directo a cada uno.

## Cómo activarlo (necesitás desplegar el worker una vez)

El backend es el mismo Cloudflare Worker (`backend/worker/worker.js`). Si ya lo tenías, solo
agregás la clave; si no, lo desplegás (gratis, sin tarjeta).

1. **Cloudflare** → Workers & Pages → tu worker (o creá uno nuevo pegando `worker.js`).
2. Settings → Variables:
   - `FIREBASE_PROJECT_ID` = `albionxp-eef13`
   - `SA_CLIENT_EMAIL` = `client_email` del service account (del JSON de Firebase)
   - `SA_PRIVATE_KEY` (**secret**) = `private_key` del JSON (PEM completo)
   - `GH_REPO` = `ObregonJeronimo/AlbionXP`
   - `ADMIN_KEY` (**secret**) = inventá una clave larga (ej. 30 caracteres al azar) — es tu llave del panel.
3. Deploy. Copiá la URL del worker (`https://albion-xxx.workers.dev`).
4. Entrá a `https://albion-xp.vercel.app/admin.html`, pegá la **URL del worker** y tu **ADMIN_KEY** → "Ver métricas".
   Ya vas a ver **descargas** al toque.

### Para activar visitas y online
- **Visitas**: poné esa URL en `web/config.js` → `analyticsUrl` y avisame (redeployo la web). Desde ahí cuenta cada visita.
- **Online en vivo**: poné la misma URL en `web/appconfig.json` → `analyticsUrl`. Requiere una versión de la
  app con el "latido" (ya está en el código; sale en la próxima release). Una vez publicada, las apps
  abiertas empiezan a reportar "online" sin más cambios.

## Seguridad y escala
- El panel exige `ADMIN_KEY`; sin ella, `/admin` devuelve 401.
- Los latidos y visitas se guardan en Firestore. Para **mucho** tráfico, el latido cada 60s puede
  acercarse al límite gratis de escrituras de Firestore (20k/día); si crecés fuerte, se migra el
  "online" a un contador dedicado (Durable Objects / Analytics Engine). Para empezar, alcanza.
- Nada de datos personales: el "online" usa un id aleatorio por instalación, anónimo.
