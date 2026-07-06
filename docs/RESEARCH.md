# Investigación verificada — APIs y economía de Albion Online (julio 2026)

Resultados de una investigación multi-agente con verificación en vivo de endpoints. Todo lo de abajo fue comprobado contra las APIs reales o el wiki oficial el 2026-07-05.

## AODP — Albion Online Data Project (precios de mercado)

- Hosts por servidor (los tres activos, datos independientes):
  `https://west.albion-online-data.com` · `https://east.albion-online-data.com` · `https://europe.albion-online-data.com`
- **Precios**: `GET /api/v2/stats/prices/{ids}?locations=&qualities=` → `item_id, city, quality, sell_price_min/max, buy_price_min/max` + fechas UTC sin `Z` (resolución 5 min).
  - Sin datos = precio `0` + fecha `0001-01-01`. Items inválidos devuelven 200 con ceros (¡no error!).
  - `sell_price_min` = comprar ya; `buy_price_max` = vender ya. `buy_price_min` suele ser una orden troll de 1 de plata.
  - Ciudades sin espacios: `FortSterling`, `BlackMarket`. Sin `locations` → las 8 principales.
  - `qualities=0` u omitido = todas (1-5). Recursos solo calidad 1.
- **Histórico**: `GET /api/v2/stats/history/{ids}?time-scale=1|6|24&date=&end_date=` → series por localización con `{item_count, avg_price, timestamp}` (solo órdenes de venta). Ventana por defecto ~30 días (24/6) o ~7 días (1).
- **Oro**: `GET /api/v2/stats/gold?count=N` → `[{price, timestamp}]` por hora. Ojo: fechas en este endpoint van en formato `MM-DD-YYYY`.
- **Rate limit real: 100 req/min** (HTTP 429 con cuerpo de texto plano) — más estricto que el documentado 180/min. URL máx ~4096 chars.
- Datos crowdsourceados por el [Albion Data Client](https://www.albion-online-data.com/): un mercado solo se actualiza cuando alguien lo abre en el juego.
- Tiempo real (avanzado): NATS en `nats.albion-online-data.com` puerto 4222 (west) / 24222 (east) / 34222 (europe), auth `public/thenewalbiondata`, topics `marketorders.deduped`, `goldprices.deduped`.

## ao-bin-dumps (metadata del juego)

- `formatted/items.json` (24 MB): 12.069 items con `UniqueName`, `Index`, `LocalizedNames` (15 idiomas, incl. ES-ES). 853 entradas con nombres null.
- `items.json` raíz (17 MB): volcado crudo con `craftingrequirements` (3.991 recetas), `@weight`, `@itemvalue`. Atributos con prefijo `@`, todo strings; `craftresource` es dict-o-lista.
- IDs: `T{tier}_{BASE}[@{ench}]`. Recursos encantados: doble marcador `_LEVEL{n}@{n}` (ej. `T5_ORE_LEVEL1@1`); equipo: `@n` a secas (`T4_MAIN_SWORD@2`). El lingote es `T4_METALBAR` (no existe `T4_BAR`).
- STONEBLOCK no tiene encantados; ROCK solo hasta .3.
- Refinado (inputs por unidad): T2:1 raw · T3:2+1prev · T4:2+1 · T5:3+1 · T6:4+1 · T7:5+1 · T8:5+1. Encantado T4 usa T3 plano; T5+ usa el inferior del mismo encantamiento.
- Equipo **no tiene `@itemvalue`**: se deriva como Σ(valor de ingredientes). Recursos refinados: `16 × 2^(T+E−4)`.
- Iconos: `https://render.albiononline.com/v1/item/{ID}.png?quality=1-5&size=16-217` (>217 → HTTP 500).

## Economía (wiki oficial)

- Impuestos: venta 4% (premium) / 8%; publicación de orden 2,5% (compra y venta, también al editar). Venta instantánea a orden de compra: solo el impuesto, sin publicación. Fricción total de un flip orden→orden: ~9% (premium).
- **RRR** = `1 − 1/(1 + PB/100)`. PB: ciudad real 18 base; especialización de refinado +40; de crafteo +15; foco +59.
  - Refinado: 15,25% base · 36,7% ciudad bono · 43,5% foco · 53,9% bono+foco.
  - Crafteo: 15,25% base · 24,8% ciudad bono · 47,9% bono+foco.
- Bonos de refinado: Thetford=mineral · Fort Sterling=madera · Lymhurst=fibra · Martlock=piel · Bridgewatch=piedra. Caerleon/Brecilien: sin bono (18 PB).
- Bonos de crafteo (+15 PB): Martlock hachas/escarcha/off-hands · Bridgewatch ballestas/dagas/malditos/placas · Lymhurst espadas/arcos/arcanos · Fort Sterling martillos/lanzas/sagrados · Thetford mazas/naturaleza/fuego · Caerleon guantes/herramientas/comida · Brecilien capas/bolsas/pociones.
- Tarifa de estación: `nutrición = valor_item × 0,1125`; `tarifa = nutrición × tarifa_por_100/100`; tope legal 1.000/100 nutrición.
- Calidad al craftear: Normal 68,9% · Bueno 25% · Notable 5% · Excelente 1,1% · Obra maestra 0,1%.
- Mercado Negro: solo Caerleon, órdenes de compra NPC alimentadas por el loot PvE mundial; destruye parte de lo que compra (sumidero). Si cobra impuesto de venta está disputado entre fuentes → la app lo deja configurable (por defecto: con impuesto, conservador).
- Oro: sin impuesto porcentual, 10 de plata fijos por orden. Sistema de estabilización automática desde el parche 28.000.1 (feb 2025).

## gameinfo API (oficial)

- `https://gameinfo.albiononline.com/api/gameinfo` (west) · `gameinfo-ams` (EU) · `gameinfo-sgp` (Asia).
- `/events` (kills), `/battles`, `/players/{id}`, `/guilds/{id}`, `/search?q=`. Límite: `limit` máx 51, `offset` máx 1000.
- **Sin datos de zona en los kills** (`Location: null`, `KillArea: OPEN_WORLD` en 1000+ eventos muestreados) → no se puede construir un mapa de riesgo por zona; solo indicadores globales de actividad PvP por hora.
- `/items/{id}/data` devuelve receta+peso para equipo (no para recursos). Inestable a veces: usar timeouts de 15-30 s y reintentos.
