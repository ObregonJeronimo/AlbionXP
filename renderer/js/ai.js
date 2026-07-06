// AI narration layer with provider rotation.
// Chain: Ollama (local, no account) -> Groq (key) -> OpenRouter (key, :free models).
// Every provider/model failure rotates to the next; final fallback is template text,
// so the planner NEVER depends on an AI being available.
import { state } from './state.js';

// ---------- Ollama (local, keyless) ----------
const OLLAMA = 'http://127.0.0.1:11434';

export async function detectOllama() {
  try {
    const res = await window.albion.fetchJson(`${OLLAMA}/api/tags`);
    if (!res.ok || !res.data || !Array.isArray(res.data.models)) return null;
    return res.data.models.map(m => m.name);
  } catch (_) { return null; }
}

// Recommended default model: small, Spanish-capable, ~2 GB
export const DEFAULT_MODEL = 'llama3.2:3b';

/**
 * Self-healing: full diagnosis + automatic repair of what can be repaired
 * silently (starting a stopped server). Returns a status the UI can act on:
 * { ok, stage: 'ready'|'no-model'|'not-installed'|'start-failed', models, detail }
 */
export async function healOllama(onStatus = () => {}) {
  const diag = await window.albion.ollamaDiagnose();

  if (diag.running && diag.models.length) return { ok: true, stage: 'ready', models: diag.models };

  if (diag.running && !diag.models.length) {
    return { ok: false, stage: 'no-model', models: [], detail: 'Ollama funciona pero no tiene ningún modelo descargado.' };
  }

  if (!diag.installedPath) {
    return { ok: false, stage: 'not-installed', models: [], detail: 'Ollama no está instalado en este equipo.' };
  }

  // Installed but stopped -> try to start it ourselves
  onStatus('Ollama está instalado pero apagado — arrancándolo…');
  const started = await window.albion.ollamaStart();
  if (started.ok) {
    const diag2 = await window.albion.ollamaDiagnose();
    if (diag2.models.length) return { ok: true, stage: 'ready', models: diag2.models };
    return { ok: false, stage: 'no-model', models: [], detail: 'Ollama arrancó pero no tiene ningún modelo descargado.' };
  }
  return {
    ok: false, stage: 'start-failed', models: [],
    detail: 'Ollama está instalado pero no se pudo arrancar automáticamente. Ábrelo desde el menú Inicio ("Ollama") o reinstálalo.',
  };
}

async function askOllama(model, system, user) {
  const res = await window.albion.postJson(`${OLLAMA}/api/chat`, {
    model,
    stream: false,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
    options: { temperature: 0.4, num_predict: 900 },
  });
  if (!res.ok || !res.data?.message?.content) throw new Error(res.error || `Ollama HTTP ${res.status}`);
  return res.data.message.content;
}

// ---------- OpenAI-compatible providers (Groq / OpenRouter) ----------
const GROQ_MODELS = ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant'];
const OPENROUTER_MODELS = [
  'meta-llama/llama-3.3-70b-instruct:free',
  'google/gemma-3-27b-it:free',
  'mistralai/mistral-small-3.1-24b-instruct:free',
];

async function askOpenAICompat(baseUrl, key, model, system, user, extraHeaders = {}) {
  const res = await window.albion.postJson(`${baseUrl}/chat/completions`, {
    model,
    temperature: 0.4,
    max_tokens: 900,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
  }, { Authorization: `Bearer ${key}`, ...extraHeaders });
  if (!res.ok) throw new Error(res.error || res.data?.error?.message || `HTTP ${res.status}`);
  const content = res.data?.choices?.[0]?.message?.content;
  if (!content) throw new Error('respuesta vacía');
  return content;
}

// ---------- Rotation chain ----------

/**
 * Ask the best available AI. Rotates on any failure (429/quota/network).
 * Returns { text, provider } or null if nothing worked.
 */
export async function askAI(system, user, onStatus = () => {}) {
  const attempts = [];

  // 1. Local Ollama (no account, recommended) — with silent self-repair
  let ollamaModels = await detectOllama();
  if (!ollamaModels) {
    const healed = await healOllama(onStatus);
    if (healed.ok) ollamaModels = healed.models;
  }
  if (ollamaModels && ollamaModels.length) {
    // Prefer instruction-tuned small/medium models if present
    const preferred = ollamaModels.sort((a, b) => {
      const rank = (n) => /llama3|qwen|mistral|gemma|phi/i.test(n) ? 0 : 1;
      return rank(a) - rank(b);
    });
    for (const m of preferred.slice(0, 2)) attempts.push({ provider: `Ollama · ${m}`, fn: () => askOllama(m, system, user) });
  }

  // 2. Groq (if the user saved a key in settings)
  if (state.groqKey) {
    for (const m of GROQ_MODELS) {
      attempts.push({ provider: `Groq · ${m}`, fn: () => askOpenAICompat('https://api.groq.com/openai/v1', state.groqKey, m, system, user) });
    }
  }

  // 3. OpenRouter free models (if key saved)
  if (state.openrouterKey) {
    for (const m of OPENROUTER_MODELS) {
      attempts.push({
        provider: `OpenRouter · ${m.split('/')[1]}`,
        fn: () => askOpenAICompat('https://openrouter.ai/api/v1', state.openrouterKey, m, system, user,
          { 'HTTP-Referer': 'https://albion-silver-hub.local', 'X-Title': 'Albion Silver Hub' }),
      });
    }
  }

  for (const a of attempts) {
    onStatus(`Consultando ${a.provider}…`);
    try {
      const text = await a.fn();
      return { text, provider: a.provider };
    } catch (e) {
      onStatus(`${a.provider} falló (${String(e.message).slice(0, 80)}), rotando…`);
    }
  }
  return null;
}

export const AI_SYSTEM_PROMPT = `Eres un coach experto de economía de Albion Online. Recibirás un PLAN CALCULADO con datos reales de mercado (precios, volúmenes, beneficios, tiempos ya computados por un motor determinista).
Tu trabajo: narrar el plan en español, claro y motivador, paso a paso, SIN CAMBIAR NINGÚN NÚMERO. No inventes precios ni tiempos: usa exactamente los del plan. Puedes añadir consejos tácticos del juego (rutas seguras, horas de menos ganks, usar órdenes de compra, foco, premium) que no contradigan los datos. Formato: markdown breve, pasos numerados, máximo ~350 palabras.`;
