# Changelog

Todas las novedades de Albion Silver Hub. Formato basado en
[Keep a Changelog](https://keepachangelog.com/es/1.0.0/); versiones con
[SemVer](https://semver.org/lang/es/) (MAYOR.MENOR.PARCHE).

El proceso para publicar una versión está en [docs/RELEASE.md](docs/RELEASE.md).

## [0.1.8] — 2026-07-07
### Pulido de métodos (más claro para actuar)
- **Refinado**: fila "Recomendado hoy" que elige por vos el mejor producto y te dice
  si conviene gastar foco (deja de abrumar con 20 filas).
- El **Plan** ahora modela el refinado **con foco** (retorno ~54%): te muestra cuánto
  más ganás si lo usás, sin cambiar el ranking (el foco es limitado).
- **Sniper**: etiqueta de **liquidez** (líquido / medio / ilíquido) en cada ganga —
  un descuento enorme en un item que nadie compra es una trampa, no una oportunidad.

## [0.1.7] — 2026-07-07
### Onboarding y claridad para principiantes
- **"Empezá acá" en el Dashboard**: la primera pantalla ahora invita a generar tu
  primer plan (incluso sin capital), en vez de dejarte solo ante las herramientas.
- **Tarjeta "Empieza aquí" en el Plan**: según tu capital y si tenés premium, te dice
  en una frase tu primer paso concreto.
- **Pasos a prueba de tontos**: cada plan ahora muestra qué **necesitás** (montura,
  foco…), el **riesgo** ("cuánto podés perder"), el **neto por unidad tras impuesto**,
  un consejo de **orden de compra** (ahorra 2-4%), la **liquidez** del mercado y qué
  hacer **si no se vende**.
- **Primera meta 500 mil** (además de 1M/5M/20M): una victoria temprana alcanzable.
- **Sin resultados ya no es un callejón sin salida**: si no hay datos frescos, el Plan
  reintenta con una ventana de 24 h y te avisa, en vez de dejarte sin plan.

## [0.1.6] — 2026-07-07
### El Plan de plata — más métodos y a prueba de principiantes
- **Modo Principiante vs Óptimo**: en Principiante, el Plan ordena por lo más **fácil
  y seguro** para tu capital (no por lo más rápido) y te muestra UN plan recomendado
  paso a paso, con el resto plegado. Un novato ya no ve primero una corrida a zona roja.
- **Recolección** (el método sin capital, ideal para arrancar de cero): el Plan te dice
  qué materia prima **rinde más plata por unidad ahora mismo y en qué ciudad venderla**
  (honesto: no inventamos plata/hora, que depende de tu nivel y del nodo).
- **Flipeo en la misma ciudad** (casi AFK, sin viajar ni cruzar zona roja): poné orden de
  compra y de venta y ganá el spread. Con guardas de liquidez y anti-listings-fantasma.
- **Crafteo** ahora también es una estrategia del Plan (cesta rentable → Mercado Negro),
  con el mismo cálculo probado de la vista de Crafteo.
- Ranking por perfil, badges de riesgo coherentes y pasos aún más concretos.

## [0.1.5] — 2026-07-07
### Seguridad y anti-abuso (auditoría previa a distribución)
- **Moderación del foro**: los dueños pueden borrar cualquier post o comentario
  abusivo/ilegal (validado en las reglas de Firestore, no solo en la app).
- **Reglas de Firestore endurecidas**: lista blanca de campos, límite de tamaño del
  apodo y `createdAt` no falsificable (ya no se puede fijar un tema arriba para siempre).
- **Backend anti-abuso**: rate-limit por IP nativo de Cloudflare en `/beat`, `/hit` y
  `/ads/track` (un flujo abusivo ya no puede agotar la cuota compartida con el foro);
  presencia identificada por hash de IP (no inflable); `/ads/track` atómico (sin
  condiciones de carrera). El panel admin falla cerrado si el email no está verificado.
- **App**: lista blanca de red más estricta para el worker (no cualquier `*.workers.dev`).
### Escala
- Latido de presencia cada 5 min (antes 60 s): 5× menos escrituras; ventana "online"
  del panel alineada a 6 min.
### Robustez
- Caché de items **atómica** (una descarga interrumpida ya no corrompe el arranque).
- Reintento automático ante saturación (429) de la API de datos; mensaje claro.
- Estado vacío en Oro; guard al salir de una vista durante la instalación de la IA;
  volumen del Sniper calculado sobre los días reales con datos.
### Correctitud y distribución
- **Premium = desactivado por defecto** (default conservador: no sobreestima ganancias).
- **Política de privacidad y términos** (`/privacidad.html`) enlazada desde la web, y
  aviso de instalación (Windows "editor desconocido") en la sección de descarga.

## [0.1.4] — 2026-07-06
### Arreglos (QA)
- Planner sin emojis (iconos propios en estado de IA, tarjetas de plan y botones).
- Limpiador de emojis corre antes del repintado (requestAnimationFrame): sin parpadeo
  en contenido que se carga de forma asíncrona.
- Arreglado un error del gráfico de Oro al salir de la vista antes de que cargue.
### Añadido
- "Latido" anónimo para el panel de admin (métrica de usuarios online), activable
  desde `appconfig.json` (`analyticsUrl`) sin recompilar.
- El panel de admin (web) usa **login de Google** restringido a los dueños.

## [No publicado]
- **Rediseño de la web** con identidad visual propia "tesorería forjada" de Albion:
  tipografía Cinzel (grabada) + Alegreya Sans, paleta hierro/oro/plata, layout de
  armería (medallones hexagonales) en vez de tarjetas, cinta de stats tipo HUD,
  índice de guías tipo códice y animaciones de aparición al hacer scroll.

## [0.1.3] — 2026-07-06
### Diseño
- **Identidad forjada también en la app**: fuentes Cinzel + Alegreya Sans (locales,
  offline), paleta hierro/oro/plata, botones biselados, títulos y secciones con Cinzel.
- **Iconos minimalistas monocromáticos** (un solo color) en toda la app y la web,
  reemplazando todos los emojis.
- **Favicon** propio (arregla el 404 de la pestaña).
### UX
- **Tooltips de ayuda "?"** en todas las herramientas para que un principiante
  entienda cada término (ROI, spread, flip, retorno, foco, encantamiento, etc.).
### Rendimiento y seguridad
- Caché de lecturas en el foro (menos consultas a Firestore → aguanta más tráfico).
- Cabeceras de seguridad en la web (nosniff, X-Frame-Options, Referrer-Policy, HSTS).

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
