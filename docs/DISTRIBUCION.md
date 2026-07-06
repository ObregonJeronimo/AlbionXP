# Guía de distribución — Albion Silver Hub

Cómo pasar de "app en mi PC" a "producto con usuarios", con **costo fijo $0**:
Firebase Spark (gratis) + Cloudflare Workers (gratis) + Mercado Pago (solo comisión por venta).

## Modelo de monetización: gratis con anuncios + premium sin anuncios

`config.js → monetization.mode`:
- **`'free-ads'` (actual)**: la app es gratis; banners rotativos (esquina del sidebar + franja superior) en toda la app, nunca bloqueantes. La suscripción de Mercado Pago se convierte en "premium sin anuncios".
- **`'subscription'`**: paywall duro (sin pagar no se usa).

### La verdad sobre los anuncios en apps de escritorio
- **Google AdSense/AdMob están PROHIBIDOS en apps de escritorio** — meterlos en Electron es baneo de la cuenta. Las redes que sí aceptan apps (Adsterra, PropellerAds) son de baja calidad (popunders, malware) y pagan ~$0,05-0,30 por MIL vistas en LATAM: con 500 usuarios diarios serían $3-10/día.
- **Lo que de verdad paga** con una audiencia gamer pequeña/mediana:
  1. **Afiliados gaming** — [Eneba Affiliates](https://www.eneba.com/affiliates) y Kinguin (comisión por venta de keys/gift cards, audiencia perfecta), VPNs (NordVPN/Surfshark pagan $30-100 por conversión), Amazon Afiliados (periféricos). Te registras gratis, pones tu link con tag de afiliado en un anuncio.
  2. **Patrocinios directos** — vende el slot por mes a gremios reclutando, coaches, creadores de contenido de Albion. Con 300-500 usuarios activos, un slot puede valer $20-100/mes. Esto es lo que más paga por impresión.
  3. **Premium sin anuncios** — ya integrado vía Mercado Pago.
- ⚠️ NO aceptes anuncios de venta de plata/oro por dinero real (RMT): viola los términos de Albion y te puede matar el proyecto.

### Cómo gestionar los anuncios (sin recompilar)
Las campañas viven en la variable **`ADS_JSON`** del worker (Cloudflare → tu worker → Settings → Variables). Formato:
```json
[{"id":"eneba-1","title":"🎮 Keys hasta -90%","body":"Juegos baratos en Eneba","url":"https://www.eneba.com/?af_id=TU_ID","color":"#3fb950"}]
```
Guardas y todos los usuarios reciben la campaña nueva en minutos. Las métricas (vistas, segundos en pantalla, clics) se acumulan por anuncio y por día en Firestore → colección **`adStats`** — con eso le cobras al patrocinador con números reales.

## Resumen de costos (verificado julio 2026)

| Pieza | Plan | Costo |
|---|---|---|
| Firebase Auth | Spark | Gratis hasta 50.000 usuarios activos/mes |
| Firestore (registros de usuarios/pagos) | Spark | Gratis: 50k lecturas y 20k escrituras/día |
| Emails de recuperación de contraseña | Firebase | Gratis (los manda Firebase, sin dominio; 150/día) |
| Backend de pagos | Cloudflare Workers Free | Gratis: 100.000 requests/día, sin tarjeta |
| Mercado Pago suscripciones | por venta | **~1,9% todo incluido** con liberación a 35 días (1,56% + IVA); al instante ~8% |
| Instalador | electron-builder NSIS | Gratis |

> ⚠️ Mercado Pago acepta individuos con DNI (sin empresa). Si facturas de forma recurrente,
> lo sano fiscalmente es monotributo. Tarjetas extranjeras pagan +3 puntos.
> Stripe NO está disponible para vendedores en Argentina (2026). Paddle (5% + $0,50) funciona
> para individuos argentinos pero exige dominio propio con HTTPS — opción futura para vender global.

## Paso 1 — Firebase (10 minutos)

1. https://console.firebase.google.com → "Agregar proyecto" (ej: `albion-silver-hub`). Sin Analytics.
2. **Authentication** → Comenzar → Método "Correo electrónico/contraseña" → Habilitar.
3. **Firestore Database** → Crear base de datos (modo producción, edición Standard).
4. Reglas de Firestore (pestaña "Reglas") — los usuarios leen su propio doc, NADIE escribe desde el cliente
   (solo el worker con service account, que las bypasea):
   ```
   rules_version = '2';
   service cloud.firestore {
     match /databases/{database}/documents {
       match /users/{userId} {
         allow read: if request.auth != null && request.auth.uid == userId;
         allow write: if false;
       }
     }
   }
   ```
5. ⚙️ Configuración del proyecto → General → copia la **Clave de API web** y el **ID del proyecto**.
6. Pégalos en `renderer/js/config.js` → `firebase.apiKey` y `firebase.projectId`.
   (La API key web es pública por diseño — la seguridad está en las reglas, no en ocultarla.)
7. Service account para el worker: ⚙️ → Cuentas de servicio → "Generar nueva clave privada" → guarda el JSON (NO lo metas en la app ni en git — va solo al worker como secret).

Con esto ya funciona: registro, login, y recuperación de contraseña (Firebase envía el email él mismo desde `noreply@tu-proyecto.firebaseapp.com` — cero dominios, cero Resend).

## Paso 2 — Mercado Pago (15 minutos)

1. Cuenta de Mercado Pago normal (la tuya) → https://www.mercadopago.com.ar/developers → "Tus integraciones" → Crear aplicación (tipo: pagos online, solución: suscripciones).
2. Copia el **Access Token de producción** (empieza con `APP_USR-`).
3. **Muy importante (comisión)**: en Mercado Pago → Costos → elige liberación del dinero a **35 días** → la comisión baja a 1,56% + IVA (~1,9%). Con liberación al instante pagas ~8%.
4. Webhooks: en tu aplicación → Webhooks → URL de producción: `https://TU-WORKER.workers.dev/webhook`
   → Eventos: **Planes y suscripciones** (`subscription_preapproval` y `subscription_authorized_payment`) → copia la **clave secreta** que genera.

## Paso 3 — Cloudflare Worker (15 minutos)

1. Cuenta gratis en https://dash.cloudflare.com (no pide tarjeta) → Workers & Pages → Create Worker → nómbralo (ej. `albion-pagos`).
2. Pega el contenido de [backend/worker/worker.js](../backend/worker/worker.js) en el editor → Deploy.
3. Settings → Variables and Secrets:
   - `MP_ACCESS_TOKEN` (secret) = token de producción de MP
   - `MP_WEBHOOK_SECRET` (secret) = clave secreta del webhook de MP
   - `FIREBASE_API_KEY` = la Web API key
   - `FIREBASE_PROJECT_ID` = id del proyecto
   - `SA_CLIENT_EMAIL` = `client_email` del JSON del service account
   - `SA_PRIVATE_KEY` (secret) = `private_key` del JSON (el PEM completo, con los `\n`)
   - `PLAN_AMOUNT` = precio mensual en ARS (ej. `5000`)
   - `PLAN_TITLE` = `Albion Silver Hub — mensual`
4. Copia la URL del worker (`https://albion-pagos.XXX.workers.dev`) en `renderer/js/config.js` → `payments.workerUrl`.

### Cómo fluye un pago
App (usuario logueado) → botón "Suscribirme" → worker `/checkout` crea la suscripción en MP con `external_reference = uid` → se abre el checkout de MP en el navegador → el usuario paga → MP notifica al worker `/webhook` (firma validada) → el worker consulta la verdad en la API de MP → escribe `users/{uid} { subActive: true, subUntil: +31 días }` en Firestore → el usuario pulsa "Ya pagué — verificar" y la app se desbloquea. Cada cobro mensual re-extiende `subUntil`; si el cobro falla, `subUntil` vence y la app vuelve al paywall sola. **Autogestión total.**

## Paso 4 — Compilar el instalador

```bash
npm run installer
```

Genera `dist/AlbionSilverHub-Setup-0.1.0.exe`: instalador de un clic que crea acceso directo
en escritorio y menú inicio, con desinstalador. Ese exe es lo que distribuyes.

- La IA local (Ollama) NO va dentro del instalador (los modelos pesan GB): la app la instala
  y configura sola desde "Plan de plata → Coach IA" con un clic, y se auto-repara si el usuario
  la desinstala o el proceso se cierra.
- Sin firma de código, Windows SmartScreen mostrará aviso "editor desconocido" las primeras
  descargas (se puede firmar más adelante; los certificados EV cuestan dinero — no es necesario para empezar).

## Paso 5 — Operación

- **Ver usuarios**: Firebase console → Authentication.
- **Ver/editar suscripciones a mano**: Firestore → `users/{uid}` (puedes regalar meses editando `subUntil`).
- **Pagos**: panel de Mercado Pago (y logs del worker en Cloudflare → Logs → Live).
- **Deshabilitar un usuario**: Authentication → tres puntos → Inhabilitar.

## Modo local vs distribución

`renderer/js/config.js` controla todo: con `firebase.apiKey` vacío la app corre en **modo local**
(sin login, todo desbloqueado — tu modo actual). Al rellenar las claves se activa el gate de
login + suscripción. Mismo código, dos modos.
