/**
 * Test masivo de TODOS los modelos :free del catálogo OpenRouter.
 * Uso: node scripts/test-free-models.mjs   (lee OPENROUTER_API_KEY de .env.local)
 */
import { readFileSync } from 'fs';

for (const l of readFileSync('.env.local', 'utf-8').split('\n')) {
  if (l.startsWith('OPENROUTER_API_KEY=')) {
    process.env.OPENROUTER_API_KEY ??= l.slice(19).trim().replace(/^["']|["']$/g, '');
  }
}
const KEY = process.env.OPENROUTER_API_KEY;

const MODELS = [
  'dots-studio/dots-3-note-preview:free',
  'liquid/lfm-2.5-2.6b:free',
  'nvidia/nemotron-3.5-lightning:free',
  'thinkingmachines/inkling-small:free',
  'poolside/laguna-s-2.1:free',
  'thinkingmachines/inkling:free',
  'poolside/laguna-xs-2.1:free',
  'cohere/north-mini-code:free',
  'z-ai/glm-5.2:free',
  'nvidia/nemotron-3.5-content-safety:free',
  'nvidia/nemotron-3-ultra-550b-a55b:free',
  'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free',
  'google/gemma-4-26b-a4b-it:free',
  'google/gemma-4-31b-it:free',
  'nvidia/nemotron-3-super-120b-a12b:free',
];

async function test(modelId) {
  const start = Date.now();
  try {
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${KEY}`,
        'HTTP-Referer': 'https://scaudit.app',
      },
      body: JSON.stringify({
        model: modelId,
        messages: [{ role: 'user', content: "Responde SOLO con la palabra OK." }],
        temperature: 0.1,
        max_tokens: 20,
      }),
      signal: AbortSignal.timeout(20_000),
    });
    const latencyMs = Date.now() - start;
    if (!res.ok) {
      const t = await res.text().catch(() => '');
      return { ok: false, latencyMs, error: `HTTP ${res.status}: ${t.slice(0, 90)}` };
    }
    const data = await res.json();
    const content = data.choices?.[0]?.message?.content || '(empty)';
    return { ok: true, latencyMs, content: content.trim().slice(0, 40) };
  } catch (err) {
    return { ok: false, latencyMs: Date.now() - start, error: err.message?.slice(0, 90) || String(err) };
  }
}

console.log(`Probando ${MODELS.length} modelos :free...\n`);
const results = [];
for (const m of MODELS) {
  const r = await test(m);
  results.push({ m, ...r });
  console.log(`${r.ok ? '✅' : '❌'} ${String(r.latencyMs).padStart(6)}ms  ${m}${r.ok ? `  → "${r.content}"` : `\n        ↳ ${r.error}`}`);
}

console.log('\n── Ranking (OK por latencia) ──');
for (const r of results.filter(r => r.ok).sort((a, b) => a.latencyMs - b.latencyMs)) {
  console.log(`  ${String(r.latencyMs).padStart(6)}ms  ${r.m}`);
}
