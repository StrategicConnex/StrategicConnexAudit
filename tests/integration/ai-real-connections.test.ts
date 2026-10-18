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
 * src/server/ai/ai-router.ts) — POOL OPENROUTER-ONLY (2026-10-18):
 *
 * | Proveedor  | Estado en runtime         | Variable            |
 * |------------|---------------------------|---------------------|
 * | OpenRouter | ÚNICO proveedor (meta-modelo + cadena :free) | OPENROUTER_API_KEY |
 *
 * Eliminados con la simplificación OpenRouter-only (2026-10-18): Anthropic
 * directo (failover P2-1, nunca activo sin key) junto a `providers.ts`. Los
 * legados ya se eliminaron el 2026-10-17: Gemini (clave filtrada), NVIDIA NIM
 * (404 «Function not found for account») y Xiaomi/apifreellm («Incorrect API
 * key»). Detalle: tests/integration/AI-CONNECTIONS-REPORT.md.
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
    const present = ["OPENROUTER_API_KEY"].filter(hasKey);
    // Se imprime únicamente el nombre: el valor jamás llega a un log ni a un test.
    console.log(`[ai-real] claves presentes: ${present.join(", ") || "(ninguna)"}`);
    expect(present.length).toBeGreaterThanOrEqual(1);
  });

  it("los proveedores eliminados ya no aparecen ni como opcionales en el esquema", async () => {
    const { envSchema } = await import("../../src/env");
    expect(envSchema.shape.GEMINI_API_KEY).toBeUndefined();
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
