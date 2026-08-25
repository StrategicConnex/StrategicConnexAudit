/**
 * openrouter-live-test.mjs — Prueba de integración REAL contra OpenRouter.
 *
 * Hace consultas verdaderas a la API de OpenRouter para verificar:
 * - Conexión y autenticación
 * - Meta-modelo "openrouter/free"
 * - Modelos :free individuales
 * - Latencia, rate limiting, y errores reales
 *
 * USO:
 *   node src/server/ai/openrouter-live-test.mjs
 *
 * Requiere OPENROUTER_API_KEY en .env o variable de entorno
 */

import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ─── Cargar .env manualmente ───────────────────────────────────────
function loadEnv() {
    const envPath = resolve(__dirname, '../../../.env.local');
  try {
    const content = readFileSync(envPath, 'utf-8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx === -1) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '');
      if (!process.env[key]) {
        process.env[key] = val;
      }
    }
  } catch {
    // .env.local no encontrado, usar process.env
  }
}

loadEnv();

const API_KEY = process.env.OPENROUTER_API_KEY;
const BASE_URL = process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1';

const TEST_MESSAGE = {
  role: 'user',
  content: "Responde SOLO con la palabra 'OK' y un emoji. No agregues nada más.",
};

// Lista sincronizada con TASK_ROUTING en ai-router.ts (union de todas las
// cadenas de fallback por tarea). Mantener en sync al añadir/quitar modelos.
const MODELS = [
  { id: 'openrouter/free', label: '🤖 Meta-model (openrouter/free)' },
  { id: 'google/gemma-4-26b-a4b-it:free', label: '💎 Gemma 4 26B' },
  { id: 'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free', label: '🧠 Nemotron 3 Nano Omni' },
  { id: 'nvidia/nemotron-3-super-120b-a12b:free', label: '🧠 Nemotron 3 Super' },
  { id: 'nvidia/nemotron-3-ultra-550b-a55b:free', label: '🧠 Nemotron 3 Ultra' },
  { id: 'nvidia/nemotron-3-nano-30b-a3b:free', label: '🧠 Nemotron 3 Nano' },
];

async function testModel(modelId, timeoutMs = 15_000) {
  const start = Date.now();
  try {
    const response = await fetch(`${BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${API_KEY}`,
        'HTTP-Referer': 'https://scaudit.app',
        'X-Title': 'StrategicAudit Pro Live Test',
      },
      body: JSON.stringify({
        model: modelId,
        messages: [TEST_MESSAGE],
        temperature: 0.1,
        max_tokens: 10,
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });

    const latencyMs = Date.now() - start;

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      return { status: 'error', latencyMs, error: `HTTP ${response.status}: ${text.slice(0, 200)}` };
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '(empty)';
    const modelUsed = data.model || modelId;

    return { status: 'ok', latencyMs, content: content.slice(0, 50), modelUsed };
  } catch (err) {
    const latencyMs = Date.now() - start;
    return { status: 'error', latencyMs, error: err.message || String(err) };
  }
}

// ─── Test de autenticación (lista de modelos) ───────────────────────
async function testAuth() {
  console.log('  📋 Verificando autenticación (GET /models)...');
  try {
    const response = await fetch(`${BASE_URL}/models`, {
      headers: {
        Authorization: `Bearer ${API_KEY}`,
        'HTTP-Referer': 'https://scaudit.app',
      },
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) {
      console.log(`  ❌ Auth falló: HTTP ${response.status}`);
      return false;
    }
    const data = await response.json();
    const freeCount = (data.data || []).filter(m => m.id?.includes(':free')).length;
    console.log(`  ✅ Auth OK — ${(data.data || []).length} modelos disponibles (${freeCount} gratuitos :free)`);
    return true;
  } catch (err) {
    console.log(`  ❌ Auth error: ${err.message}`);
    return false;
  }
}

async function main() {
  console.log('\n══════════════════════════════════════════════════════════');
  console.log('  🧪 OpenRouter — Live Integration Test');
  console.log('══════════════════════════════════════════════════════════\n');

  if (!API_KEY) {
    console.error('❌ OPENROUTER_API_KEY no está configurada.');
    console.error('   Get a FREE key at https://openrouter.ai/keys');
    process.exit(1);
  }

  // Mostrar key parcial
  console.log(`  🔑 API Key: ${API_KEY.slice(0, 12)}...${API_KEY.slice(-4)}`);
  console.log(`  🌐 Base URL: ${BASE_URL}`);
  console.log(`  ⏱️  Timeout: 15s por modelo\n`);

  // Auth test
  await testAuth();

  console.log('');

  // Test each model
  const results = [];

  for (const { id, label } of MODELS) {
    const timestamp = new Date().toISOString().slice(11, 19);
    process.stdout.write(`  [${timestamp}] ${label.padEnd(40)} ... `);
    const result = await testModel(id);
    result.model = id;
    results.push(result);

    if (result.status === 'ok') {
      console.log(`✅ ${result.latencyMs}ms  →  "${result.content}"`);
    } else {
      console.log(`❌ ${result.latencyMs}ms`);
      const errShort = (result.error || '').slice(0, 100);
      console.log(`     ↳ ${errShort}`);
    }
  }

  // Summary
  const ok = results.filter(r => r.status === 'ok');
  const errors = results.filter(r => r.status === 'error');

  console.log('\n══════════════════════════════════════════════════════════');
  console.log('  📊  Resumen Final');
  console.log('══════════════════════════════════════════════════════════\n');

  console.log(`  ✅  ${ok.length}/${results.length} modelos respondieron OK`);
  console.log(`  ❌  ${errors.length}/${results.length} modelos fallaron`);

  if (ok.length > 0) {
    const avgLat = ok.reduce((s, r) => s + r.latencyMs, 0) / ok.length;
    const minLat = Math.min(...ok.map(r => r.latencyMs));
    const maxLat = Math.max(...ok.map(r => r.latencyMs));
    console.log(`  ⏱️   Latencia: min=${minLat}ms  avg=${avgLat.toFixed(0)}ms  max=${maxLat}ms`);

    // Modelos funcionales
    console.log('');
    console.log('  🏆  Ranking de modelos (por latencia):');
    for (const r of [...ok].sort((a, b) => a.latencyMs - b.latencyMs)) {
      const modelLabel = MODELS.find(m => m.id === r.model)?.label || r.model;
      console.log(`       ${r.latencyMs.toString().padStart(5)}ms  ${modelLabel}`);
    }
  }

  if (errors.length > 0) {
    console.log('\n  ⚠️  Modelos con errores:');
    for (const r of errors) {
      const modelLabel = MODELS.find(m => m.id === r.model)?.label || r.model;
      console.log(`       ${modelLabel}: ${(r.error || '?').slice(0, 120)}`);
    }

    console.log('\n  🔍  Posibles causas:');
    console.log('       • Rate limiting (50 req/día para cuentas free sin saldo)');
    console.log('       • Modelo temporalmente no disponible');
    console.log('       • Cuota diaria de OpenRouter agotada para ese modelo');
  }

  // Evaluación general del ai-router
  console.log('\n──────────────────────────────────────────────────────────');
  console.log('  📋  Diagnóstico del ai-router.ts');
  console.log('──────────────────────────────────────────────────────────\n');

  const metaModelOk = results.find(r => r.model === 'openrouter/free')?.status === 'ok';

  console.log(`  Meta-model router (openrouter/free): ${metaModelOk ? '✅ FUNCIONAL' : '❌ FALLÓ'}`);
  console.log(`  Modelos :free en fallback chain:    ${ok.length} funcionales`);

  if (metaModelOk) {
    console.log('\n  ✅ El ai-router usará openrouter/free como PRIMERA opción.');
    console.log('     Si falla, hará fallback a los modelos :free individuales.');
  } else {
    console.log('\n  ⚠️  openrouter/free falló. El ai-router hará fallback directo');
    console.log('     a los modelos :free individuales en el orden definido.');
  }

  if (ok.length >= 2) {
    console.log('\n  ✅ Resiliencia: hay suficientes modelos funcionales para');
    console.log('     que el mecanismo de fallback del ai-router funcione.');
  } else {
    console.log('\n  ⚠️  Resiliencia limitada! El ai-router puede fallar si el');
    console.log('     primer modelo no funciona y los fallbacks también fallan.');
  }

  console.log('');
  console.log(`  Test completado: ${new Date().toISOString()}`);

  process.exit(ok.length > 0 ? 0 : 1);
}

main().catch(err => {
  console.error('\n💥 Error fatal:', err);
  process.exit(1);
});
