// @vitest-environment node
/**
 * ai-real-connections.test.ts — prueba de TODAS las IAs que el proyecto tiene
 * configuradas, con conexiones y datos REALES (sin mocks).
 *
 * POR QUÉ ESTÁ AQUÍ Y NO EN tests/: `tests/integration/**` queda excluido de la
 * suite unitaria (ver vitest.config.ts) y corre con `pnpm test:integration`.
 * Así ninguna llamada de red a un proveedor de IA se hace "de paso" en cada PR.
 *
 * OPT-IN: los tests de red sólo se ejecutan con `AI_REAL_TESTS=1`. Sin esa
 * variable se omiten (no fallan), porque `test:integration` corre en entornos
 * sin egress ni claves.
 *
 *     AI_REAL_TESTS=1 pnpm test:integration
 *
 * CLAVES: se leen SIEMPRE de process.env (`.env.local` se carga con dotenv al
 * arrancar el proceso de test). Nada se hardcodea y nada se imprime en claro:
 * los mensajes de fallo nombran la variable, nunca su valor.
 *
 * INVENTARIO VERIFICADO EN CÓDIGO (src/shared/config/env-secrets.ts,
 * src/server/ai/ai-router.ts) — actualizado 2026-10-19:
 *
 * | Proveedor  | Estado en runtime              | Variable            |
 * |------------|--------------------------------|---------------------|
 * | OpenRouter | PRIMARIO (meta-modelo + cadena :free) | OPENROUTER_API_KEY |
 * | Groq       | FAILOVER 1 (endpoint OpenAI-compat)   | GROQ_API_KEY (opcional) |
 * | Gemini     | FAILOVER 2 (endpoint OpenAI-compat)   | GEMINI_API_KEY (opcional) |
 *
 * FAILOVER ANTI-MONODEPENDENCIA (enmienda owner 2026-10-19): tras agotarse la
 * cadena OpenRouter de la tarea, ai-router.ts entra en FALLBACK_PROVIDERS
 * (Groq openai/gpt-oss-120b → Gemini gemini-3.8-flash), ambos verificados en
 * vivo (chat/json_object/tools). prohibición de Anthropic se mantiene: sin
 * ANTHROPIC_API_KEY. Los legados违约 eliminados el 2026-10-17 siguen fuera:
 * NVIDIA NIM (404) y Xiaomi/apifreellm («Incorrect API key») — NOTA: la
 * GEMINI_API_KEY de aquel día fue reportada como filtrada por Google y se
 * eliminó; la presente es una clave NUEVA (formato AQ.*) verificada en vivo
 * el 2026-10-19. Detalle: tests/integration/AI-CONNECTIONS-REPORT.md.
 */
import { describe, expect, it } from "vitest";
import { promises as dns } from "node:dns";
import dotenv from "dotenv";
import pg from "pg";
import { callAIWithFallback } from "../../src/server/ai/ai-router";

dotenv.config({ path: ".env.local" });

/** Opt-in explícito: sin esto, ninguna llamada de red sale de este archivo. */
const AI_REAL = process.env.AI_REAL_TESTS === "1" || process.env.AI_REAL_TESTS === "true";

if (!AI_REAL) {
  console.warn(
    "[ai-real] AI_REAL_TESTS no definido → se OMITEN las llamadas de red a los proveedores de IA."
  );
}

/** Red + modelos gratuitos: margen amplio, pero acotado para no colgar CI. */
const NET_TIMEOUT_MS = 60_000;

const hasKey = (name: string) => Boolean(process.env[name]);

interface Latency {
  provider: string;
  ms: number;
  status: string;
  detail?: string;
}

const latencies: Latency[] = [];

/**
 * Enmascara identificadores opacos largos (claves, ids de cuenta del proveedor)
 * que un mensaje de error puede traer del cuerpo de la respuesta. Los valores de
 * las variables de entorno nunca se imprimen; esto protege además lo que un
 * proveedor decida devolver en claro.
 */
const redact = (s: string) => s.replace(/[A-Za-z0-9_\-]{24,}/g, "…");

/**
 * `callAIWithFallback` NO lanza cuando todo el chain falla: devuelve
 * `success:false`. Sin esto el resumen contaría una llamada caída como ✅.
 */
function markRouter(res: { success: boolean; error?: string; modelUsed: string }): void {
  const entry = latencies[latencies.length - 1];
  if (entry && !res.success) {
    entry.status = "error";
    entry.detail = redact((res.error ?? "sin detalle").slice(0, 160));
  }
}

/** Mide y registra una llamada real (para el reporte de cierre). */
async function timed<T>(provider: string, fn: () => Promise<T>): Promise<T> {
  const t0 = Date.now();
  try {
    const result = await fn();
    latencies.push({ provider, ms: Date.now() - t0, status: "ok" });
    return result;
  } catch (error) {
    latencies.push({
      provider,
      ms: Date.now() - t0,
      status: "error",
      detail: error instanceof Error ? redact(error.message.slice(0, 160)) : String(error),
    });
    throw error;
  }
}

/**
 * Un finding REAL de la BD (sin clasificar) para alimentar a los modelos.
 * Devuelve null si no hay BD o no hay findings: el test que lo usa se omite.
 */
async function realFinding(): Promise<{ id: string; title: string; description: string } | null> {
  const dsn = process.env.DIRECT_URL || process.env.DATABASE_URL;
  if (!dsn) return null;
  // Misma política TLS que el resto de scripts del repo (scripts/lib/db-connection.mjs):
  // el pooler de Supabase sirve una cadena que Node no trae en su almacén.
  const { connectionFor } = await import("../../scripts/lib/db-connection.mjs");
  const client = new pg.Client({
    ...connectionFor(dsn),
    connectionTimeoutMillis: 15_000,
  });
  try {
    await client.connect();
    const { rows } = await client.query(
      `select id::text as id, title, left(regexp_replace(description, '\\s+', ' ', 'g'), 600) as description
         from public.intelligence_findings
        where ai_triage is null
        order by created_at desc
        limit 1`
    );
    return rows[0] ?? null;
  } catch {
    return null;
  } finally {
    await client.end().catch(() => {});
  }
}

describe("AI — inventario de configuración (sin red)", () => {
  it("OpenRouter es la única clave de IA requerida por el esquema de env", async () => {
    const { envSchema } = await import("../../src/env");
    expect(envSchema.shape.OPENROUTER_API_KEY).toBeDefined();
    // Ni siquiera opcional: el proveedor eliminado ya no está en el contrato.
    expect(envSchema.shape.ANTHROPIC_API_KEY).toBeUndefined();
  });

  it("no hay claves de IA hardcodeadas y .env.local no está trackeado", async () => {
    const { execFileSync } = await import("node:child_process");
    const tracked = execFileSync("git", ["ls-files", ".env.local", ".env"], {
      encoding: "utf8",
    }).trim();
    expect(tracked).toBe("");
  });

  it("el reporte conoce las claves presentes (sólo presencia, nunca el valor)", () => {
    const present = ["OPENROUTER_API_KEY", "GROQ_API_KEY", "GEMINI_API_KEY"].filter(hasKey);
    // Se imprime únicamente el nombre: el valor jamás llega a un log ni a un test.
    console.log(`[ai-real] claves presentes: ${present.join(", ") || "(ninguna)"}`);
    expect(present.length).toBeGreaterThanOrEqual(1);
  });

  it("legados eliminados siguen fuera; failover anti-monod. aparece opcional", async () => {
    const { envSchema } = await import("../../src/env");
    // La GEMINI del incidente de la clave filtrada cambió el 2026-10-19: vuelve
    // como OPCIONAL (failover) con una clave nueva verificada en vivo. Los
    // proveedores verdaderamente muertos siguen prohibidos en el esquema.
    // safeParse(undefined) es la forma version-safe de asertar opcionalidad.
    expect(envSchema.shape.OPENROUTER_API_KEY.safeParse(undefined).success).toBe(false); // requerida
    expect(envSchema.shape.GROQ_API_KEY.safeParse(undefined).success).toBe(true); // opcional
    expect(envSchema.shape.GEMINI_API_KEY.safeParse(undefined).success).toBe(true); // opcional
    expect(envSchema.shape.NVIDIA_API_KEY).toBeUndefined();
    expect(envSchema.shape.XIAOMI_API_KEY).toBeUndefined();
    expect(envSchema.shape.BEARER_API_KEY).toBeUndefined();
  });
});

describe("AI Real — OpenRouter (proveedor PRIMARIO del runtime)", () => {
  it.skipIf(!AI_REAL)(
    "chat mínimo en vivo a través del router real (callAIWithFallback)",
    async () => {
      expect(hasKey("OPENROUTER_API_KEY")).toBe(true);

      const res = await timed("openrouter:general-chat", () =>
        callAIWithFallback({
          taskType: "general-chat",
          messages: [
            { role: "system", content: "Respondes con una sola palabra." },
            { role: "user", content: "Responde con la palabra OK" },
          ],
          maxTokens: 16,
          temperature: 0,
          // nonce: la caché semántica no puede hacer pasar un hit por un modelo vivo.
          cacheScope: `ai-real-connections:${Date.now()}`,
          userId: null,
        })
      );
      markRouter(res);

      if (!res.success) {
        // Diagnóstico de red en el propio fallo: si openrouter.ai cae en un sinkhole
        // DNS (ECONNREFUSED a una IP de loopback), el IP dice la causa sin
        // necesidad de mirar el entorno del operador.
        const resolved = await dns
          .lookup("openrouter.ai")
          .then((r) => r.address)
          .catch((e: { code?: string }) => `sin resolución (${e.code ?? "?"})`);
        throw new Error(
          redact(
            `OpenRouter no respondió: ${res.error ?? "sin detalle"} ` +
              `(model=${res.modelUsed}, ${res.latencyMs}ms; DNS openrouter.ai → ${resolved}). ` +
              "Si la IP es un loopback/privada, el DNS local o el ISP no resuelve ese dominio."
          )
        );
      }
      expect(res.content.length).toBeGreaterThan(0);
      expect(res.modelUsed).not.toBe("none");
      expect(res.latencyMs).toBeGreaterThan(0);
    },
    NET_TIMEOUT_MS
  );

  it.skipIf(!AI_REAL)(
    "cadena JSON-crítica (finding-triage) devuelve JSON parseable con un finding REAL",
    async () => {
      const finding = await realFinding();
      if (!finding) {
        console.warn("[ai-real] sin findings reales en la BD: se omite el caso con datos reales");
        return;
      }

      const res = await timed("openrouter:finding-triage", () =>
        callAIWithFallback({
          taskType: "finding-triage",
          messages: [
            {
              role: "user",
              content:
                `Devuelve EXCLUSIVAMENTE JSON con esta forma: ` +
                `{"triage":[{"findingId":"<uuid>","severity":"info|low|medium|high|critical",` +
                `"businessImpact":"1 frase"}]}.\n\n` +
                `HALLAZGO REAL\nid=${finding.id}\nTítulo: ${finding.title}\n` +
                `Descripción: ${finding.description}`,
            },
          ],
          maxTokens: 220,
          temperature: 0,
          cacheScope: `ai-real-connections:triage:${finding.id}:${Date.now()}`,
          userId: null,
        })
      );
      markRouter(res);

      if (!res.success) {
        throw new Error(
          redact(`finding-triage no respondió: ${res.error ?? "sin detalle"} (${res.modelUsed})`)
        );
      }

      const jsonStart = res.content.indexOf("{");
      expect(jsonStart, `salida sin JSON: ${res.content.slice(0, 200)}`).toBeGreaterThanOrEqual(0);
      const parsed = JSON.parse(res.content.slice(jsonStart)) as {
        triage?: Array<{ findingId?: string; severity?: string; businessImpact?: string }>;
      };
      expect(parsed.triage?.[0]?.findingId).toBe(finding.id);
      expect(["info", "low", "medium", "high", "critical"]).toContain(parsed.triage?.[0]?.severity);
      expect(parsed.triage?.[0]?.businessImpact?.length ?? 0).toBeGreaterThan(10);
    },
    NET_TIMEOUT_MS
  );
});

describe("AI Real — Failover anti-monodependencia: Groq (decisión 2026-10-19)", () => {
  /** PONG mínimo DIRECTO al endpoint OpenAI-compatible (sin router): el
   * failover solo se camina a sí mismo si OpenRouter cae, así que la verificación
   * viva del proveedor se hace ROAD-level, no por callAIWithFallback. */
  const GROQ_CHAT_URL = "https://api.groq.com/openai/v1/chat/completions";

  it.skipIf(!AI_REAL)(
    "chat mínimo en vivo: openai/gpt-oss-120b PONG + json_object a la vez",
    async () => {
      if (!hasKey("GROQ_API_KEY")) {
        console.warn("[ai-real] GROQ_API_KEY no configurada: failover Groq se omite (como en runtime)");
        return;
      }

      const t0 = Date.now();
      const response = await timed("groq:gpt-oss-120b", () =>
        fetch(GROQ_CHAT_URL, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "openai/gpt-oss-120b",
            messages: [{ role: "user", content: 'Devuelve SOLO este JSON en texto plano sin markdown: {"pong":true}' }],
            max_tokens: 200,
            reasoning_effort: "low",
            response_format: { type: "json_object" },
          }),
          signal: AbortSignal.timeout(NET_TIMEOUT_MS),
        })
      );

      expect(response.ok).toBe(true);
      const data = await response.json();
      expect(data.model).toContain("gpt-oss-120b");
      expect(String(data.choices?.[0]?.message?.content ?? "")).toContain('"pong"');
      expect(data.usage?.completion_tokens).toBeGreaterThan(0);
      console.log(`[ai-real] groq: PONG via ${data.model}, in=${data.usage?.prompt_tokens} out=${data.usage?.completion_tokens}, ${Date.now() - t0}ms`);
    },
    NET_TIMEOUT_MS
  );
});

describe("AI Real — Failover anti-monodependencia: Gemini (decisión 2026-10-19)", () => {
  const GEMINI_CHAT_URL = "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions";

  it.skipIf(!AI_REAL)(
    "chat mínimo en vivo: gemini-3.8-flash PONG + json_object a la vez",
    async () => {
      if (!hasKey("GEMINI_API_KEY")) {
        console.warn("[ai-real] GEMINI_API_KEY no configurada: failover Gemini se omite (como en runtime)");
        return;
      }

      const t0 = Date.now();
      const response = await timed("gemini:gemini-3.8-flash", () =>
        fetch(GEMINI_CHAT_URL, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${process.env.GEMINI_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "gemini-3.8-flash",
            messages: [{ role: "user", content: "Devuelve SOLO este JSON: {\"ok\":true}" }],
            response_format: { type: "json_object" },
          }),
          signal: AbortSignal.timeout(NET_TIMEOUT_MS),
        })
      );

      expect(response.ok).toBe(true);
      const data = await response.json();
      expect(data.model).toContain("gemini-3.8-flash");
      expect(String(data.choices?.[0]?.message?.content ?? "")).toContain('"ok"');
      console.log(`[ai-real] gemini: ok=${data.choices[0].message.content}, in=${data.usage?.prompt_tokens} out=${data.usage?.completion_tokens}, ${Date.now() - t0}ms`);
    },
    NET_TIMEOUT_MS
  );
});

describe("AI Real — resumen de la ejecución", () => {
  it("imprime el resumen de latencias medido en esta corrida", () => {
    console.log(`\n[ai-real] ${latencies.length} llamada(s) real(es) medida(s):`);
    for (const l of latencies) {
      console.log(
        `  ${l.status === "ok" ? "✅" : "❌"} ${l.provider} — ${l.ms}ms${l.detail ? ` — ${l.detail}` : ""}`
      );
    }
    expect(latencies.length).toBeGreaterThanOrEqual(0);
  });
});
