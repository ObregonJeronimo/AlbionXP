// Built-in strategy guide: every silver-making strategy the app supports,
// ordered by difficulty, with links to the right tool.
import { escapeHtml } from '../state.js';

const STRATEGIES = [
  {
    name: 'Comercio de oro',
    diff: 1, risk: 'safe', riskLabel: 'Sin riesgo',
    capital: 'Cualquiera', rate: 'Pasivo, % sobre capital',
    tool: 'gold', toolLabel: 'Oro',
    how: 'El oro se compra y vende sin impuesto porcentual (solo 10 de plata por orden). Su precio sigue ciclos ligados a la inflación del servidor y a los eventos.',
    steps: [
      'Mira el gráfico y la media móvil en la herramienta de Oro.',
      'Compra cuando el precio esté claramente por debajo de la media (típicamente tras parches que inyectan plata).',
      'Vende en picos (lanzamientos de contenido, eventos que disparan la demanda de premium).',
    ],
    note: 'Es la única inversión "de banco" del juego: lenta pero sin perder nada. Ideal para plata que no estés usando.',
  },
  {
    name: 'Sniper de gangas (mismo mercado)',
    diff: 2, risk: 'safe', riskLabel: 'Riesgo bajo',
    capital: '100k – 5M', rate: '100k – 1M/h de vigilancia',
    tool: 'sniper', toolLabel: 'Sniper de gangas',
    how: 'La gente lista items muy por debajo del precio de mercado para vender rápido (loot de PvP, prisas, errores de tecleo). Los compras y los relistas a precio normal en la misma ciudad.',
    steps: [
      'Ejecuta el Sniper en tu ciudad (Caerleon y Bridgewatch suelen tener más volumen).',
      'Filtra por descuento ≥25% y comprueba que el volumen diario aguante la reventa.',
      'Compra, relista a la media de 7 días, cobra la diferencia menos ~6,5% de impuestos.',
    ],
    note: 'Sin transporte y sin riesgo de PvP. El límite es tu capital y la paciencia para re-escanear.',
  },
  {
    name: 'Transporte entre ciudades reales',
    diff: 2, risk: 'risk', riskLabel: 'Riesgo medio (zonas amarillas/rojas)',
    capital: '500k – 20M', rate: '500k – 3M/h',
    tool: 'flip', toolLabel: 'Transporte / Flip',
    how: 'Cada ciudad real tiene bonos de refinado distintos, así que los precios de recursos divergen constantemente. Compras donde sobra y vendes donde falta.',
    steps: [
      'Escanea rutas en la herramienta de Transporte (recursos refinados son lo más líquido).',
      'Busca ROI ≥10% con datos frescos (≤6h) — por debajo, los impuestos y el riesgo se lo comen.',
      'Usa monturas de carga (buey/caballo T8) y rutas por zonas azules/amarillas si puedes.',
      'Vende con orden de venta para el mejor precio, o instantáneo si quieres rotar rápido.',
    ],
    note: 'Regla del transportista: nunca lleves más del 10% de tu banco en una sola ruta con zonas rojas.',
  },
  {
    name: 'Refinado con bono de ciudad',
    diff: 3, risk: 'safe', riskLabel: 'Riesgo bajo',
    capital: '1M – 50M', rate: '5–20% de margen sobre volumen',
    tool: 'refine', toolLabel: 'Refinado',
    how: 'Refinar en la ciudad con especialización devuelve el 36,7% de los recursos (53,9% con foco): tu coste real de materiales baja un tercio. Compras materia prima, refinas y vendes el producto.',
    steps: [
      'Abre la calculadora de Refinado; cada recurso tiene su ciudad: mineral→Thetford, madera→Fort Sterling, fibra→Lymhurst, piel→Martlock, piedra→Bridgewatch.',
      'Mira qué tier/encantamiento da mejor ROI hoy (suele variar a diario).',
      'Compra la materia prima con órdenes de compra para ahorrarte otro 2-4%.',
      'Usa el foco (10k/día con premium) en lo que más margen tenga.',
    ],
    note: 'Escalable a decenas de millones al día si dominas los ciclos de compra. Sube tu especialización de refinado para más retorno pasivo.',
  },
  {
    name: 'Crafteo → Mercado Negro',
    diff: 4, risk: 'risk', riskLabel: 'Riesgo medio-alto (Caerleon)',
    capital: '2M – 100M', rate: '1M – 5M/h en buenas ventanas',
    tool: 'craft', toolLabel: 'Crafteo',
    how: 'El Mercado Negro de Caerleon compra equipo con órdenes NPC infladas por la demanda del loot PvE. Crafteas con bono de ciudad y foco, transportas a Caerleon y vendes al instante.',
    steps: [
      'Lanza el escáner "Crafteo → Mercado Negro" en la herramienta de Crafteo.',
      'Craftea las líneas donde tengas especialización (más retorno y calidad).',
      'Las calidades altas que salgan del roll (~31%) rellenan órdenes aún mejores.',
      'Lleva tandas a Caerleon (zona roja: ve ligero, evita horas punta de ganks).',
    ],
    note: 'El MN se recarga según muere gente en el mundo: después de eventos grandes de PvE/PvP los precios se disparan.',
  },
  {
    name: 'Flipping de órdenes (mismo item, mismo mercado)',
    diff: 4, risk: 'safe', riskLabel: 'Riesgo bajo (pero compite gente)',
    capital: '5M+', rate: '% constante sobre capital',
    tool: 'compare', toolLabel: 'Comparador',
    how: 'Pones órdenes de compra baratas y órdenes de venta caras del mismo item. Ganas el spread menos ~9% de fricción (2,5% + 2,5% + 4%). Solo vale en items con spread >12% y volumen.',
    steps: [
      'Usa el Comparador para ver el spread compra/venta por ciudad.',
      'Busca items con spread grande y volumen decente (comida, pociones, materiales de artefacto).',
      'Mantén tus órdenes arriba: edítalas cuando te pisen (cada edición cuesta otro 2,5%).',
    ],
    note: 'Es la estrategia más "AFK" después del oro, pero exige vigilar las órdenes un par de veces al día.',
  },
  {
    name: 'Arbitraje de refinado multi-ciudad (la ruta completa)',
    diff: 5, risk: 'risk', riskLabel: 'Riesgo medio',
    capital: '10M+', rate: 'El mejor %/h del juego de mercado',
    tool: 'refine', toolLabel: 'Refinado',
    how: 'La estrategia compuesta: comprar materia prima barata en la ciudad A (donde nadie la quiere), transportarla a la ciudad con bono, refinar con foco, y vender el refinado en la ciudad B donde esté más caro (o al Mercado Negro vía crafteo).',
    steps: [
      'En Refinado, activa "comprar materias en la ciudad más barata" para ver la ruta completa.',
      'Cruza con el Comparador para decidir dónde vender el refinado (no siempre es donde refinas).',
      'Encadena: materia barata → refinar con bono+foco → craftear con bono → Mercado Negro.',
      'Cada eslabón añade margen: los mejores traders del juego viven de esta cadena.',
    ],
    note: 'Requiere entender toda la economía, pero es exactamente lo que esta app calcula por ti.',
  },
  {
    name: 'Laborers y journals (ingreso pasivo)',
    diff: 3, risk: 'safe', riskLabel: 'Sin riesgo',
    capital: '~50M para montar la isla', rate: '500k – 2M/día pasivo',
    tool: null, toolLabel: null,
    how: 'Los laborers de tu isla rellenan journals cada 22h y devuelven recursos/plata. Los journals vacíos y llenos se comercian en el mercado: puedes comprar vacíos, llenarlos jugando y vender llenos (o al revés según el spread).',
    steps: [
      'Monta una isla nivel 6 con casas y laborers del tipo que uses jugando.',
      'Compra journals vacíos en el mercado (usa el Comparador para el mejor precio).',
      'Mantén la felicidad >100% con muebles y comida.',
    ],
    note: 'No necesita app en tiempo real, pero el Comparador te dice dónde comprar/vender journals. ROI de la inversión: ~1-2 meses.',
  },
];

export function renderGuide(container) {
  container.innerHTML = `<div id="guide-root">
    <h1 class="view-title">📖 Guía de estrategias</h1>
    <p class="view-desc">Todas las formas de hacer plata que esta app soporta, ordenadas de fácil a avanzada.
      Dificultad <span class="badge diff-1">1</span> = empiezas hoy; <span class="badge diff-5">5</span> = necesitas capital y experiencia.</p>
    ${STRATEGIES.map(s => `
      <div class="strategy">
        <div class="strategy-head">
          <h3>${escapeHtml(s.name)}</h3>
          <span class="badge diff-${s.diff}">Dificultad ${s.diff}/5</span>
          <span class="badge ${s.risk}">${s.riskLabel}</span>
        </div>
        <p><b>Cómo funciona:</b> ${s.how}</p>
        <ol class="steps">${s.steps.map(st => `<li>${st}</li>`).join('')}</ol>
        <p><b>Capital:</b> ${s.capital} · <b>Ritmo típico:</b> ${s.rate}</p>
        <p>${s.note}</p>
        ${s.tool ? `<p>→ Herramienta: <span class="tool-link" data-tool="${s.tool}">${s.toolLabel}</span></p>` : ''}
      </div>`).join('')}
    <p class="hint">Los ritmos de plata/hora son estimaciones de la comunidad (2025-2026) y dependen del servidor, la hora y la competencia.
      La regla de oro: los datos frescos valen más que cualquier estrategia — verifica en el juego antes de mover capital grande.</p>
  </div>`;

  // Listener on an inner element: it dies with the innerHTML swap on navigation
  container.querySelector('#guide-root').addEventListener('click', (e) => {
    const link = e.target.closest('.tool-link[data-tool]');
    if (link) window.__navigate(link.dataset.tool);
  });
}
