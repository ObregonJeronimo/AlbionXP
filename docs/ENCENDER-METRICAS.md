# Encender las métricas (online + visitas) — gratis y seguro

Esto activa el contador de **usuarios online** y **visitas web** de tu panel de admin.
Es **gratis** (Cloudflare Workers: 100.000 pedidos/día gratis, muy por encima de lo que
vas a usar) y **seguro** (el worker ya trae límite de velocidad por IP, presencia por
hash de IP y validación de dueño). Es un trámite de **~10 minutos, una sola vez**.

> Las **descargas** del panel YA funcionan sin nada de esto. Esto agrega online + visitas.

---

## Qué necesitás
1. Una cuenta de **Cloudflare** (gratis) → https://dash.cloudflare.com/sign-up
2. Tu **JSON de service account** de Firebase (el archivo `*firebase-adminsdk*.json`).
   Si no lo tenés: Firebase Console → ⚙️ Configuración del proyecto → *Cuentas de
   servicio* → **Generar nueva clave privada** (descarga un .json).
3. **Node** instalado (ya lo tenés).

---

## Paso 1 — Completar 1 dato en la config
Abrí `backend/worker/wrangler.toml` y en `SA_CLIENT_EMAIL` pegá el valor del campo
`client_email` de tu JSON (algo como `...@albionxp-eef13.iam.gserviceaccount.com`).
Guardá. (El `FIREBASE_API_KEY` ya está pre-cargado.)

## Paso 2 — Abrir una terminal en la carpeta del worker
```
cd backend/worker
```

## Paso 3 — Entrar a Cloudflare (se abre el navegador)
```
npx wrangler login
```
Aceptá los permisos en el navegador. Volvé a la terminal.

## Paso 4 — Cargar la clave privada como SECRETO (no queda en el código)
```
npx wrangler secret put SA_PRIVATE_KEY
```
Cuando lo pida, **pegá el valor del campo `private_key` de tu JSON EXACTAMENTE como
aparece** (empieza con `-----BEGIN PRIVATE KEY-----\n...` e incluye los `\n`). Enter.

## Paso 5 — Desplegar
```
npx wrangler deploy
```
Al terminar imprime una URL tipo:
```
https://albion-pagos.TU-SUBDOMINIO.workers.dev
```
**Copiá esa URL.**

> Si el deploy se queja del binding `ratelimit`/`unsafe`: comentá las 5 líneas del
> bloque `[[unsafe.bindings]]` en wrangler.toml y volvé a desplegar. El worker igual
> funciona (con un poco menos de protección). Avisame y lo ajusto.

## Paso 6 — Decirle a la app y a la web que usen esa URL
En **dos** archivos, poné esa URL en `analyticsUrl`:
- `web/appconfig.json` → `"analyticsUrl": "https://albion-pagos.TU-SUBDOMINIO.workers.dev"`
  (esto hace que **la app** mande su "latido" de online)
- `web/config.js` → `analyticsUrl: 'https://albion-pagos.TU-SUBDOMINIO.workers.dev'`
  (esto hace que **la web** cuente visitas)

Luego se publican esos cambios en la web (te ayudo con el push a `main` + `gh-pages`).

## Paso 7 (solo para tu login del panel) — Google en Firebase
Para entrar al panel con tu Google:
- Firebase Console → **Authentication** → *Sign-in method* → habilitá **Google**.
- En *Authorized domains* agregá `albion-xp.vercel.app`.

---

## Listo — cómo se ve funcionando
- Abrís la app → a los ~5 min tu panel muestra **1 online** (vos).
- Alguien visita la web → sube **Visitas**.
- Entrás a `https://albion-xp.vercel.app/admin.html`, login con Google (dueño) y ves todo.

## ¿Cuánto aguanta gratis?
- Worker: 100.000 pedidos/día. Con el latido cada 5 min, **1 usuario = ~288 pedidos/día**
  → ~300 usuarios online todo el día caben sobrados; y el rate-limit evita abusos.
- Firestore (donde se guarda la presencia): plan gratis, y **sin tarjeta cargada no puede
  cobrarte** — si algún día se llenara la cuota, se pausa y resetea al día siguiente.

En resumen: **$0**, y no hay forma de que te llegue una factura sorpresa.
