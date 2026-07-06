# Changelog

Todas las novedades de Albion Silver Hub. Formato basado en
[Keep a Changelog](https://keepachangelog.com/es/1.0.0/); versiones con
[SemVer](https://semver.org/lang/es/) (MAYOR.MENOR.PARCHE).

El proceso para publicar una versión está en [docs/RELEASE.md](docs/RELEASE.md).

## [No publicado]
- **Rediseño de la web** con identidad visual propia "tesorería forjada" de Albion:
  tipografía Cinzel (grabada) + Alegreya Sans, paleta hierro/oro/plata, layout de
  armería (medallones hexagonales) en vez de tarjetas, cinta de stats tipo HUD,
  índice de guías tipo códice y animaciones de aparición al hacer scroll.

## [0.1.2] — 2026-07-06
### Seguridad
- **Verificación de email obligatoria** para publicar/comentar/votar en el foro
  (regla `email_verified` en Firestore + envío/reenvío de email + bloqueo hasta
  verificar). Frena la creación masiva de cuentas falsas.
- **Endurecimiento de Electron**: sandbox del renderer, bloqueo de ventanas
  emergentes y navegación externa, y lista blanca de hosts en la capa de red.
### Añadido
- Soporte de **anuncios CPM** en un iframe aislado (sandbox) que carga la
  publicidad desde una página real (`ad-frame.html`); activable desde
  `appconfig.json` sin recompilar.
- **Sección de guías** en la web (SEO/tráfico): cómo empezar, transporte,
  refinado y mercado negro.

## [0.1.1] — 2026-07-06
### Añadido
- **Configuración remota** (`appconfig.json` en la web): los anuncios, el botón
  de donar y los enlaces de comunidad se cambian desde la web **sin recompilar**
  ni sacar una versión nueva.
- Botón **❤️ Donar** con Cafecito (`cafecito.app/albionxp`).
### Cambiado
- El enlace "🌐 Web" de la app apunta a la landing en Vercel
  (`albion-xp.vercel.app`).

## [0.1.0] — 2026-07-06
### Añadido
- **Lanzamiento inicial.** Herramientas: Dashboard, Plan de plata (coach con IA
  local Ollama, auto-instalable), Comparador de mercados, Transporte/Flip,
  Sniper de gangas, Movimiento, Refinado, Crafteo, Mercado Negro, Oro y Guía.
- **Foro** comunitario integrado en la app (login con Firebase; leer es libre,
  publicar/comentar/votar requiere cuenta).
- **Auto-actualización** (electron-updater + GitHub Releases): las nuevas
  versiones se instalan solas.
- App **gratis** con anuncios no invasivos y frescura de datos configurable.
- Landing web informativa + instalador NSIS con acceso directo.
