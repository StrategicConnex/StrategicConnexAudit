/**
 * Verificación en vivo de capacidades (tools + structured outputs) de los
 * candidatos :free para cadenas JSON-críticas.
 *
 * Uso: node scripts/test-model-capabilities.mjs   (lee OPENROUTER_API_KEY de .env.local)
 */
import { readFileSync } from 'fs';

for (const l of readFileSync('.env.local', 'utf-8').split('\n')) {
  if (l.startsWith('OPENROUTER_API_KEY=')) {
    process.env.OPENROUTER_API_KEY ??= l.slice(19).trim().replace(/^["']|["']$/g, '');
  }
}
const KEY = process.env.OPENROUTER_API_KEY;
if (!KEY) { console.error('OPENROUTER_API_KEY no configurada'); process.exit(1); }

const CANDIDATES = [
  'nvidia/nemotron-3-super-120b-a12b:free',
  'openai/gpt-oss-20b:free',
  'google/gemma-4-26b-a4b-it:free',
  'nvidia/nemotron-3-ultra-550b-a55b:free',
  'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free',
  'nvidia/nemotron-3.5-lightning:free',
  'dots-studio/dots-3-note-preview:free',
];

// ─── 1. Metadatos de la Models API ─────────────────────────────────────────
console.log('Consultando catálogo OpenRouter…');
const modelsRes = await fetch('https://openrouter.ai/api/v1/models', {
  headers: { Authorization: `Bearer ${KEY}` },
  signal: AbortSignal.timeout(15_000),
});
const catalog = await modelsRes.json();
const meta = new Map((catalog.data ?? []).map((m) => [m.id, m]));

function apiCaps(id) {
  const m = meta.get(id);
  if (!m) return { exists: false, tools: false, structured: false, responseFormat: false };
  const sp = m.supported_parameters ?? [];
  return {
    exists: true,
    tools: sp.includes('tools'),
    structured: sp.includes('structured_outputs'),
    responseFormat: sp.includes('response_format'),
  };
}

// ─── 2/3. Tests reales: tool call y json_schema ─────────────────────────────
const TOOLS = [{
  type: 'function',
  function: {
    name: 'get_evidence_detail',
    description: 'Obtiene evidencia cruda de un check de seguridad por id.',
    parameters: {
      type: 'object',
      properties: { checkId: { type: 'string', description: 'id del check' } },
      required: ['checkId'],
      additionalProperties: false,
    },
  },
}];

const JSON_SCHEMA_BODY = {
  messages: [
    { role: 'system', content: 'Responde SOLO con JSON válido según el schema.' },
    { role: 'user', content: 'Evalúa el puerto 3389 abierto en un servidor Windows público.' },
  ],
  response_format: {
    type: 'json_schema',
    json_schema: {
      name: 'finding',
      strict: true,
      schema: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          severity: { type: 'string', enum: ['info', 'low', 'medium', 'high', 'critical'] },
          cvss: { type: 'number' },
        },
        required: ['title', 'severity', 'cvss'],
        additionalProperties: false,
      },
    },
  },
};

async function chat(body) {
  const start = Date.now();
  try {
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${KEY}`,
        'HTTP-Referer': 'https://scaudit.app',
      },
      body: JSON.stringify({ temperature: 0.1, max_tokens: 400, ...body }),
      signal: AbortSignal.timeout(45_000),
    });
    const latencyMs = Date.now() - start;
    if (!res.ok) {
      const t = await res.text().catch(() => '');
      return { ok: false, latencyMs, error: `HTTP ${res.status}: ${t.slice(0, 100)}` };
    }
    return { ok: true, latencyMs, data: await res.json() };
  } catch (err) {
    return { ok: false, latencyMs: Date.now() - start, error: String(err.message || err) };
  }
}

console.log(`\nVerificando ${CANDIDATES.length} candidatos…\n`);
const matrix = [];
for (const model of CANDIDATES) {
  const caps = apiCaps(model);

  // Tool call real
  const toolTest = await chat({
    model,
    messages: [{ role: 'user', content: 'Necesito la evidencia del check "tls-certificate". Usa la función disponible.' }],
    tools: TOOLS,
    tool_choice: 'auto',
  });
  let toolOk = false;
  if (toolTest.ok) {
    const msg = toolTest.data.choices?.[0]?.message;
    toolOk = Array.isArray(msg?.tool_calls) && msg.tool_calls.length > 0 &&
      msg.tool_calls[0]?.function?.name === 'get_evidence_detail';
  }

  // json_schema real
  const jsonTest = await chat({ model, ...JSON_SCHEMA_BODY });
  let jsonOk = false;
  if (jsonTest.ok) {
    try {
      const c = jsonTest.data.choices?.[0]?.message?.content ?? '';
      const parsed = JSON.parse(c.replace(/```json?|```/g, '').trim());
      jsonOk = typeof parsed.title === 'string' && typeof parsed.cvss === 'number';
    } catch { jsonOk = false; }
  }

  matrix.push({ model, caps, toolOk, jsonOk, toolLatency: toolTest.latencyMs, toolError: toolTest.error });
  console.log(
    `${caps.tools && toolOk ? '✅' : '⚠️'} ${model}\n` +
    `     api: tools=${caps.tools ? 'sí' : 'NO'} structured=${caps.structured ? 'sí' : 'NO'}\n` +
    `     tool_call real: ${toolOk ? '✅' : '❌'} (${String(toolTest.latencyMs)}ms${toolTest.error ? ' — ' + toolTest.error.slice(0, 70) : ''})\n` +
    `     json_schema real: ${jsonOk ? '✅' : '❌'} (${String(jsonTest.latencyMs)}ms${jsonTest.error ? ' — ' + jsonTest.error.slice(0, 70) : ''})`
  );
}

console.log('\n═══ MATRIZ FINAL (para MODEL_CAPABILITIES) ═══');
for (const r of matrix.filter(r => r.caps.exists && (r.toolOk || r.jsonOk))) {
  console.log(`  "${r.model}": { supportsTools: ${r.toolOk}, supportsStructuredOutput: ${r.jsonOk} },`);
}
