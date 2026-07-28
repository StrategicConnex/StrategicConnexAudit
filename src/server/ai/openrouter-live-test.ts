/**
 * openrouter-live-test.ts — Prueba de integración REAL contra OpenRouter.
 *
 * Hace consultas verdaderas a la API de OpenRouter para verificar:
 * - Conexión y autenticación
 * - El meta-modelo "openrouter/free" (router automático)
 * - Modelos :free individuales (DeepSeek, Gemini, Llama, Mistral, Qwen)
 * - Latencia, rate limiting, y errores reales
 *
 * USO:
 *   npx ts-node src/server/ai/openrouter-live-test.ts
 *   # o
 *   npx tsx src/server/ai/openrouter-live-test.ts
 *
 * Requiere OPENROUTER_API_KEY en .env
 */

import { env } from "@/shared/config/env";

interface ModelTestResult {
  model: string;
  status: "ok" | "error" | "skip";
  latencyMs: number;
  contentPreview: string;
  error?: string;
}

const TEST_MESSAGE = {
  role: "user",
  content:
    "Responde SOLO con la palabra 'OK' y un emoji. No agregues nada más.",
};

const MODELS_TO_TEST = [
  { id: "openrouter/free", label: "🤖 Meta-model (openrouter/free)" },
  { id: "google/gemini-2.0-flash-exp:free", label: "⚡ Gemini 2.0 Flash" },
  { id: "deepseek/deepseek-chat-v3:free", label: "🧠 DeepSeek V3" },
  { id: "meta-llama/llama-4:free", label: "🦙 Llama 4" },
  { id: "mistralai/mistral-small-3.1:free", label: "🌬️ Mistral Small 3.1" },
  { id: "qwen/qwen-2.5-72b-instruct:free", label: "🐉 Qwen 2.5 72B" },
];

async function testModel(
  modelId: string,
  baseUrl: string,
  apiKey: string,
  timeoutMs: number
): Promise<ModelTestResult> {
  const start = Date.now();
  try {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
        "HTTP-Referer": "https://scaudit.app",
        "X-Title": "StrategicAudit Pro — Live Test",
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
      const text = await response.text().catch(() => "");
      return {
        model: modelId,
        status: "error",
        latencyMs,
        contentPreview: "",
        error: `HTTP ${response.status}: ${text.slice(0, 200)}`,
      };
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || "(empty)";

    return {
      model: modelId,
      status: "ok",
      latencyMs,
      contentPreview: content.slice(0, 50),
    };
  } catch (err: unknown) {
    const latencyMs = Date.now() - start;
    const msg = err instanceof Error ? err.message : String(err);
    return {
      model: modelId,
      status: "error",
      latencyMs,
      contentPreview: "",
      error: msg,
    };
  }
}

async function main() {
  console.log("\n══════════════════════════════════════════════════════════");
  console.log("  🧪 OpenRouter Live Integration Test");
  console.log("══════════════════════════════════════════════════════════\n");

  // 1. Check API key
  const apiKey = env.openRouterApiKey;
  if (!apiKey) {
    console.error("❌ OPENROUTER_API_KEY no está configurada.");
    console.error("   Get a FREE key at https://openrouter.ai/keys");
    process.exit(1);
  }
  console.log(
    `✅ API Key presente: ${apiKey.slice(0, 12)}...${apiKey.slice(-4)}`
  );
  console.log(`🔗 Base URL: ${env.openRouterBaseUrl}`);
  console.log(`📡 Timeout: 15s por modelo\n`);

  // 2. Test each model
  const results: ModelTestResult[] = [];
  const baseUrl = env.openRouterBaseUrl || "https://openrouter.ai/api/v1";

  for (const { id, label } of MODELS_TO_TEST) {
    process.stdout.write(`  ${label.padEnd(42)} ... `);
    const result = await testModel(id, baseUrl, apiKey, 15_000);
    results.push(result);

    if (result.status === "ok") {
      console.log(`✅ ${result.latencyMs}ms`);
    } else {
      console.log(`❌ ${result.latencyMs}ms — ${(result.error || "").slice(0, 80)}`);
    }
  }

  // 3. Summary
  console.log("\n══════════════════════════════════════════════════════════");
  console.log("  📊 Resumen");
  console.log("══════════════════════════════════════════════════════════\n");

  const ok = results.filter((r) => r.status === "ok");
  const errors = results.filter((r) => r.status === "error");

  console.log(`  ✅  ${ok.length}/${results.length} modelos respondieron OK`);
  console.log(`  ❌  ${errors.length}/${results.length} modelos fallaron`);

  if (ok.length > 0) {
    const avgLatency =
      ok.reduce((s, r) => s + r.latencyMs, 0) / ok.length;
    console.log(`  ⏱️   Latencia promedio: ${avgLatency.toFixed(0)}ms`);
    console.log(
      `  🚀  Más rápido: ${Math.min(...ok.map((r) => r.latencyMs))}ms`
    );
  }

  if (errors.length > 0) {
    console.log("\n  Detalle de errores:");
    for (const err of errors) {
      console.log(`    • ${err.model} (${err.latencyMs}ms): ${err.error || "?"}`);
    }
  }

  console.log("\n──────────────────────────────────────────────────────────");
  console.log(`  ${new Date().toISOString()}`);
  console.log("──────────────────────────────────────────────────────────\n");

  // Exit with code
  process.exit(ok.length > 0 ? 0 : 1);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
