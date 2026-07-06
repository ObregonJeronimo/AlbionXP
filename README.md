# ⚔️ Albion Silver Hub

App de escritorio (Electron) de inteligencia de mercado para **Albion Online**: encuentra maneras de hacer plata con datos reales del mercado.

## Herramientas

| Herramienta | Estrategia | Dificultad |
|---|---|---|
| 🏠 **Dashboard** | Pulso del mercado: oro + recursos refinados por ciudad | — |
| 🧭 **Plan de plata** | Eliges objetivo (1M/5M/20M/custom) y capital → planes paso a paso con inversión y tiempo, calculados con precios y volúmenes reales; narración opcional por IA (Ollama local sin cuentas / Groq / OpenRouter con rotación automática) | — |
| ⚖️ **Comparador** | Precio de cualquier item en las 7 ciudades + Mercado Negro, con histórico | ⭐ |
| 🚚 **Transporte / Flip** | Escáner de arbitraje: compra en ciudad A, vende en ciudad B (impuestos incluidos) | ⭐⭐ |
| 🎯 **Sniper de gangas** | Items listados muy por debajo de su media histórica → comprar y relistar | ⭐⭐ |
| 📊 **Movimiento** | Qué se comercia más en cada mercado (unidades/hora, plata movida, tendencia) | ⭐ |
| ⛏️ **Refinado** | Calculadora con bonos de ciudad (36,7% retorno, 53,9% con foco) y tarifa de estación real | ⭐⭐⭐ |
| 🔨 **Crafteo** | Recetas reales del juego + escáner crafteo→Mercado Negro | ⭐⭐⭐⭐ |
| 🌑 **Mercado Negro** | Comprar equipo en ciudades y vendérselo al MN de Caerleon | ⭐⭐⭐⭐ |
| 🪙 **Oro** | Gráfico + señal de compra/venta por media móvil | ⭐ |
| 📖 **Guía** | Todas las estrategias explicadas paso a paso | — |

## Uso

```bash
npm install
npm start
```

En el panel izquierdo elige tu **servidor** (América/Europa/Asia) y si tienes **premium** (impuesto 4% vs 8%).

### Exe de escritorio

```bash
npm run dist       # dist/win-unpacked/Albion Silver Hub.exe (portable, para ti)
npm run installer  # dist/AlbionSilverHub-Setup-X.X.X.exe (instalador para distribuir)
```

El instalador crea acceso directo en escritorio y menú inicio, e incluye desinstalador.

### Coach IA (Plan de plata)

El "Plan de plata" calcula rutas con un **motor determinista** (datos reales de mercado) y las narra con IA **local** (Ollama): gratis, sin cuentas y privada. El panel "Coach IA" diagnostica y repara solo: instala Ollama silenciosamente, lo arranca si está cerrado y descarga el modelo con barra de progreso. Si no hay IA, narra con plantillas — nunca deja de funcionar. Claves opcionales de Groq/OpenRouter con rotación automática.

### Distribución (login + suscripción)

La app tiene modo distribución integrado: login con Firebase (email/contraseña + recuperación sin dominio propio), paywall con Mercado Pago (~1,9% de comisión con liberación a 35 días) y desbloqueo automático al pagar, todo con costo fijo $0. Ver [docs/DISTRIBUCION.md](docs/DISTRIBUCION.md) — mientras `config.js` esté sin rellenar, la app corre en modo local sin login.

## Fuentes de datos

- **[Albion Online Data Project](https://www.albion-online-data.com/)** — precios de mercado crowdsourceados (endpoints `/api/v2/stats/prices|history|gold`). Sin API key; límite 180 req/min (la app hace throttling).
- **[ao-bin-dumps](https://github.com/ao-data/ao-bin-dumps)** — metadata de items (nombres en español) y recetas de crafteo del volcado oficial del juego. Se descargan una vez y se cachean 7-14 días.
- **[render.albiononline.com](https://render.albiononline.com)** — iconos de items.

⚠️ **Los datos de precios son crowdsourceados**: solo se actualizan cuando alguien con el [cliente de Albion Data](https://www.albion-online-data.com/) abre ese mercado en el juego. La app muestra la antigüedad de cada dato — desconfía de oportunidades con datos viejos. Si quieres contribuir (y tener datos más frescos de tus mercados), instala el cliente.

## Constantes económicas (verificadas contra el wiki oficial, julio 2026)

- Impuesto de venta: 4% (premium) / 8%; tarifa de publicación de órdenes: 2,5%.
- Retorno de refinado: 15,25% base · 36,7% ciudad con bono · 43,5% foco · 53,9% bono+foco.
- Retorno de crafteo: 15,25% base · 24,8% ciudad con bono · 47,9% bono+foco.
- Bonos de refinado: Thetford=mineral, Fort Sterling=madera, Lymhurst=fibra, Martlock=piel, Bridgewatch=piedra.
- Tarifa de estación: `valor_item × 0,1125 × tarifa/100` (tope 1.000 por 100 de nutrición).
- Oro: sin impuesto porcentual, 10 de plata por orden.

Ver [docs/RESEARCH.md](docs/RESEARCH.md) para la investigación completa.
