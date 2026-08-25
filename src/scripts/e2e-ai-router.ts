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
import { callAIWithFallback } from "@/server/ai/ai-router";

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
  check("4. segunda llamada desde caché", !!r2.fromCache && r2.latencyMs === 0, `fromCache=${r2.fromCache} latency=${r2.latencyMs}ms`);
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
