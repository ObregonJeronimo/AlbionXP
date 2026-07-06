// Beginner-friendly help tooltips, injected by matching visible text so we don't
// have to touch every view. A MutationObserver re-applies them as result tables
// render. Texts from the UX audit — simple Rioplatense Spanish.
import { help } from './icons.js';

export const TIPS = {
  dashboard: [
    { stat: 'Impuesto de venta', text: 'Lo que te descuenta el juego al vender: 4% con Premium (8% sin) + 2,5% por publicar la orden. La app ya te resta esto en cada ganancia que muestra.' },
    { stat: 'Tendencia oro', text: 'Cuánto subió o bajó el oro en 24 h. Si el oro sube, tu plata vale menos oro (buen momento para vender oro); si baja, es más barato comprarlo.' },
    { h3: 'Pulso de recursos', text: 'Termómetro rápido: el precio más barato de cada material por ciudad. Verde = ciudad más barata, rojo = más cara. Es solo un vistazo, no una acción.' },
  ],
  compare: [
    { th: 'Venta mín', text: 'El precio más barato al que alguien vende ahora. Es lo que pagarías si querés comprar el item YA, sin esperar.' },
    { th: 'Compra máx', text: 'La orden de compra más alta que hay puesta. Es lo que te pagarían si querés vender el item YA, sin esperar.' },
    { th: 'Spread', text: 'La diferencia entre lo que te pagan por vender ya y lo que cuesta comprar ya. Spread grande = margen para revender órdenes en esa ciudad.' },
    { th: 'vs. media', text: 'Qué tan lejos está el precio de hoy del promedio de 14 días. Verde = está barato para lo normal; rojo = está caro.' },
    { label: 'Calidad', text: 'El equipo tiene niveles de calidad (de Normal a Obra Maestra): mejor calidad, mejores stats y más precio. Los materiales son siempre Normal: dejá "Normal" si no sabés.' },
  ],
  flip: [
    { desc: true, text: '"Flip" = comprar barato en un lado y vender más caro en otro para ganar la diferencia. Comprás donde está barato, transportás y vendés donde está más caro.' },
    { th: 'ROI', text: 'Retorno sobre la inversión: cuánto ganás en relación a lo que gastás. Comprás por 1.000 y ganás 200 limpios = 20% de ROI.' },
    { th: 'Beneficio/kg', text: 'Ganancia por kilo de peso. Tu montura carga peso limitado, así que lo clave no es solo el ROI: conviene llevar lo que más plata da por kilo.' },
    { label: 'Modo de venta', text: '"Orden de venta" = ponés tu precio y esperás que compren (mejor precio, tarda). "Venta instantánea" = le vendés ya a una orden de compra (menos, pero al toque).' },
  ],
  sniper: [
    { desc: true, text: 'Una "ganga" es un item listado mucho más barato de lo normal (por apuro o para largar el loot). Lo comprás y lo relistás a precio normal para ganar la diferencia.' },
    { label: 'Descuento mínimo', text: 'Qué tan barato tiene que estar respecto a su precio normal para mostrártelo. 25% = al menos un cuarto más barato que su media.' },
    { th: 'Vol/día', text: 'Cuántas unidades se venden por día en promedio. Importa MUCHO: si se venden 2 por día, aunque sea ganga podés tardar días en revenderlo.' },
  ],
  volume: [
    { label: 'Universo', text: 'Qué conjunto de items analizar: recursos/comida/pociones (lo más líquido) o equipo popular. Es solo la lista que la app revisa.' },
    { label: 'Ventana', text: 'De cuánto tiempo hacia atrás sumar las ventas: última media hora, hora, día. Menos tiempo = más "ahora mismo".' },
    { th: 'Tendencia', text: 'Si el precio subió o bajó dentro de la ventana. Verde = sube (más demanda, buen sitio para vender/transportar); rojo = baja.' },
  ],
  refine: [
    { desc: true, text: 'Al refinar, el juego te DEVUELVE parte de los materiales. En la ciudad con bono te devuelve ~37% (y ~54% con "foco"), o sea tu costo real baja mucho.' },
    { label: 'Tarifa estación', text: 'Lo que cobra la estación de refinado por usarla, según la "nutrición" que consume tu tanda. La fija cada ciudad; si no sabés, dejá 100.' },
    { th: 'Con foco', text: 'El "foco" es un recurso diario (los Premium reciben ~10.000/día) que gastás para que te devuelvan MÁS material. Estas columnas muestran la ganancia usándolo.' },
  ],
  craft: [
    { label: 'Retorno de recursos', text: 'Cuántos materiales te devuelve el juego al craftear. Depende de DÓNDE crafteás: en la ciudad con bono de tu línea te devuelven más. Si dudás, elegí "Ciudad con bono".' },
    { checkbox: 'Impuesto al vender en MN', text: 'No está 100% claro si el Mercado Negro cobra impuesto de venta. Dejalo activado para ser conservador: tus ganancias reales serán iguales o mejores.' },
  ],
  blackmarket: [
    { desc: true, text: 'El Mercado Negro está en Caerleon y es un comprador NPC: paga por equipo para dárselo como botín a los monstruos. A veces paga más que los jugadores.' },
    { label: 'Encantamientos', text: 'El encantamiento sube el poder de un item. "Plano" = sin encantar (nivel 0); ".1" y ".2" = niveles de encantamiento.' },
    { label: 'Beneficio mínimo', text: 'La ganancia limpia mínima por unidad para que la app te muestre la oportunidad. Subilo para ver solo las jugadas gordas.' },
  ],
  gold: [
    { h3: 'Señal', text: 'Una sugerencia automática basada solo en el promedio, no una garantía. El oro se mueve en ciclos de días o semanas: sirve para comprar barato y vender en los picos.' },
  ],
  planner: [
    { label: 'Capital disponible', text: 'La plata que podés invertir sin quedarte sin nada para jugar. El plan usa este número para no proponerte jugadas más grandes de lo que podés bancar.' },
    { h3: 'Coach IA', text: 'Esto es un EXTRA opcional: una IA que narra el plan con palabras. El plan y todos los números funcionan perfecto sin ella. Podés ignorarlo.' },
  ],
};

export function applyTooltips(view) {
  const c = document.getElementById('view-container');
  if (!c) return;
  const rules = TIPS[view];
  if (!rules) return;
  for (const r of rules) {
    let el = null;
    if (r.desc) el = c.querySelector('.view-desc');
    else if (r.th) el = [...c.querySelectorAll('th')].find(t => t.textContent.includes(r.th));
    else if (r.label) el = [...c.querySelectorAll('.ctrl label, .set-row span')].find(l => l.textContent.includes(r.label));
    else if (r.stat) el = [...c.querySelectorAll('.stat-label')].find(l => l.textContent.includes(r.stat));
    else if (r.h3) el = [...c.querySelectorAll('.card h3, h3')].find(l => l.textContent.includes(r.h3));
    else if (r.checkbox) { const s = [...c.querySelectorAll('span')].find(x => x.textContent.includes(r.checkbox)); el = s; }
    if (el && !el.querySelector('.help-dot') && !el.dataset.tipped) {
      el.dataset.tipped = '1';
      el.insertAdjacentHTML('beforeend', ' ' + help(r.text, r.side || 'top'));
    }
  }
}
