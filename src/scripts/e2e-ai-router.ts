/**
 * Prueba end-to-end REAL del pool de agentes AI (ai-router.ts).
 * Ejecuta callAIWithFallback contra OpenRouter y verifica:
 *   1. Llamada normal (general-chat) → success + modelUsed + latencia
 *   2. Llamada idéntica inmediata → servida por CACHÉ (latencyMs=0)
 *   3. incident-brief → success
 *
 * Uso: npx tsx --env-file=.env.local src/scripts/e2e-ai-router.ts
 */
// El parche DEBE ser el primer import: redirige 'server-only' al stub antes
// de que ai-router → env-secrets lo resuelvan.
import "../../scripts/patch-server-only.cjs";
import { callAIWithFallback, callAIWithFallbackStream } from "@/server/ai/ai-router";

async function main() {
  console.log("\n════════════════════════════════════════════════");
  console.log("  🧪 E2E — Pool de agentes AI (callAIWithFallback)");
  console.log("════════════════════════════════════════════════\n");

  let failures = 0;
  const check = (name: string, cond: boolean, detail: string) => {
    console.log(`  ${cond ? "✅" : "❌"} ${name}  ${detail}`);
    if (!cond) failures++;
  };

  // ── Test 1: llamada real general-chat ──
  const messages = [
    { role: "system" as const, content: "Eres un asistente de seguridad web." },
    { role: "user" as const, content: `Responde exactamente: POOL-OK ${Date.now()}` },
  ];
  const t0 = Date.now();
  const r1 = await callAIWithFallback({ taskType: "general-chat", messages, maxTokens: 50 });
  check(
    "1. general-chat success",
    r1.success,
    `modelo=${r1.modelUsed} latencia=${r1.latencyMs}ms (wall ${Date.now() - t0}ms)`
  );
  if (r1.success) {
    check("2. contenido no vacío", r1.content.length > 0, `"${r1.content.slice(0, 60)}"`);
    check("3. modelo del pool usado", r1.modelUsed !== "none", r1.modelUsed);
  }

  // ── Test 2: caché (misma petición) ──
  const r2 = await callAIWithFallback({ taskType: "general-chat", messages, maxTokens: 50 });
  check("4. segunda llamada desde caché", !!r2.fromCache && r2.latencyMs < 100, `fromCache=${r2.fromCache} latency=${r2.latencyMs}ms`);
  check("5. contenido de caché idéntico", r1.content === r2.content, "");

  // ── Test 3: otra tarea (incident-brief) ──
  const r3 = await callAIWithFallback({
    taskType: "incident-brief",
    messages: [{ role: "user" as const, content: "Brief de 1 línea: SQL injection en /login." }],
    maxTokens: 100,
  });
  check(
    "6. incident-brief success",
    r3.success,
    `modelo=${r3.modelUsed} latencia=${r3.latencyMs}ms "${r3.content.slice(0, 60)}"`
  );

  // ── Test 4: streaming SSE en vivo por proveedor (Sprint 1, evidencia de la
  // desviación de MODEL_CAPABILITIES: el streaming es transporte del gateway
  // OpenAI-compatible, y aquí se prueba EN VIVO que cada proveedor del pool
  // (cadena OpenRouter, Groq y Gemini) entrega deltas y cuánto tarda el
  // primero (TTFT, objetivo p50 ≤ 1.500 ms vs baseline 4,9 s no-stream). ──
  console.log("\n── Streaming en vivo (cadena OpenRouter → Groq → Gemini) ──\n");

  interface StreamProbe {
    name: string;
    ok: boolean;
    model: string;
    ttftMs: number | null;
    totalMs: number;
    chars: number;
    /** Error del router si success=false (para distinguir outage de regresión). */
    error: string | null;
  }

  const runProbe = async (
    name: string,
    ask: string,
  ): Promise<StreamProbe> => {
    let ttftMs: number | null = null;
    let chars = 0;
    const t0 = Date.now();
    const res = await callAIWithFallbackStream(
      {
        taskType: "general-chat",
        messages: [{ role: "user" as const, content: ask }],
        maxTokens: 60,
        userId: null,
      },
      (text) => {
        if (ttftMs === null) ttftMs = Date.now() - t0;
        chars += text.length;
      },
    );
    return {
      name,
      ok: res.success,
      model: res.modelUsed,
      ttftMs,
      totalMs: Date.now() - t0,
      chars,
      error: res.error ?? null,
    };
  };

  const savedOpenRouterKey = process.env.OPENROUTER_API_KEY;
  const savedGroqKey = process.env.GROQ_API_KEY;
  const probes: StreamProbe[] = [];

  // 4a. Cadena OpenRouter (primario, sin tocar el entorno).
  probes.push(
    await runProbe("openrouter", `Responde exactamente: STREAM-OR ${Date.now()}`),
  );

  // 4b. Groq: sin clave OpenRouter la cadena queda vacía → failover inter-
  //     proveedor (envSecrets lee process.env en cada acceso, así que basta).
  delete process.env.OPENROUTER_API_KEY;
  probes.push(await runProbe("groq", `Responde exactamente: STREAM-GROQ ${Date.now()}`));

  // 4c. Gemini: sin OpenRouter ni Groq → solo Gemini en el failover.
  delete process.env.GROQ_API_KEY;
  probes.push(await runProbe("gemini", `Responde exactamente: STREAM-GEMINI ${Date.now()}`));

  // Restaurar el entorno para lo que venga después del probe.
  if (savedOpenRouterKey) process.env.OPENROUTER_API_KEY = savedOpenRouterKey;
  if (savedGroqKey) process.env.GROQ_API_KEY = savedGroqKey;

  const streamSeq = 7;
  // Tolerancia de outage (review cierre Sprint 1): 503 "high demand" o
  // cuelgue upstream son indisponibilidad del proveedor, no regresión del
  // código — se omiten con ⚠️ para que la caída de un proveedor no teña de
  // rojo una corrida local. Cualquier otro fallo sigue siendo ❌ (ahí sí hay
  // algo del pool que investigar).
  const OUTAGE_RE = /503|high demand|aborted due to timeout/i;
  for (const p of probes) {
    const detail = `modelo=${p.model} ttft=${p.ttftMs ?? "-"}ms total=${p.totalMs}ms chars=${p.chars}`;
    if (!p.ok && p.error !== null && OUTAGE_RE.test(p.error)) {
      console.log(
        `  ⚠️  ${streamSeq}. stream ${p.name} OMITIDO (upstream no disponible): ` +
          `${p.error.replace(/\n/g, " ").slice(0, 160)}`,
      );
      continue;
    }
    check(`${streamSeq}. stream ${p.name} success`, p.ok, detail);
    check(
      `${streamSeq + 1}. stream ${p.name} entregó deltas (SSE real)`,
      p.chars > 0,
      `${p.chars} chars`,
    );
  }

  // E6 — TTFT medido en vivo vs baseline no-stream (4,9 s p50 de la
  // auditoría). El objetivo del sprint es p50 ≤ 1,5 s; aquí se compara con
  // el baseline para demostrar el salto, y el p50 exacto se imprime siempre.
  const ttfts = probes
    .map((p) => p.ttftMs)
    .filter((v): v is number => typeof v === "number")
    .sort((a, b) => a - b);
  const ttftP50 = ttfts.length > 0 ? (ttfts[Math.floor(ttfts.length / 2)] ?? null) : null;
  const BASELINE_NO_STREAM_P50_MS = 4_900;
  console.log(
    `\n  📊 TTFT p50 de la sesión: ${ttftP50 ?? "n/d"} ms ` +
      `(objetivo sprint ≤ 1500 ms · baseline no-stream ${BASELINE_NO_STREAM_P50_MS} ms)`,
  );
  check(
    `${streamSeq + 2}. TTFT p50 por debajo del baseline no-stream`,
    ttftP50 !== null && ttftP50 < BASELINE_NO_STREAM_P50_MS,
    `p50=${ttftP50}ms < ${BASELINE_NO_STREAM_P50_MS}ms`,
  );

  // ── Resumen ──
  console.log("\n────────────────────────────────────────────────");
  console.log(failures === 0 ? "  ✅ TODOS LOS TESTS PASARON" : `  ❌ ${failures} test(s) fallaron`);
  console.log("");
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error("💥 Error fatal:", err);
  process.exit(1);
});
