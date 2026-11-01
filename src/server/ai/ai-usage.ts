import { NextResponse, after } from "next/server";
import { checkAiDailyQuota } from "@/shared/lib/ratelimit";
import type { AITaskType } from "./ai-router";

/**
 * ai-usage.ts — Presupuesto IA por usuario (P0-1 anti-ruina).
 *
 * Dos piezas:
 * 1. `recordAiUsage()` — persiste una fila en `ai_usage` por llamada al
 *    router. Fire-and-forget: jamás lanza ni bloquea la respuesta.
 * 2. `assertAiQuota()` — gate de cuota diaria por task que las rutas llaman
 *    antes de invocar al router. Retorna Response 429 o null.
 */

export interface AiUsageEntry {
  userId: string | null;
  taskType: AITaskType;
  modelUsed: string;
  tokensIn?: number | null;
  tokensOut?: number | null;
  latencyMs?: number | null;
  success: boolean;
  fromCache?: boolean;
  /** Coste estimado USD de la llamada (Sprint 1, #17; 0 para :free). */
  costUsd?: number | null;
  /** Hash de versión del prompt (Sprint 1, #18). */
  promptVersion?: string | null;
  /** TTFT en ms hasta el primer delta (Sprint 1 A2; null si no hubo stream). */
  ttftMs?: number | null;
  /** true = respuesta servida con streaming (Sprint 1 A2). */
  streamed?: boolean;
}

type InsertableDb = {
  insert: (table: unknown) => { values: (v: unknown) => Promise<unknown> };
};

/**
 * Persiste el uso. `db` es inyectable para tests; por defecto directDb
 * (service role, sin RLS — ningún endpoint lee esta tabla salvo admin).
 */
export async function recordAiUsage(
  entry: AiUsageEntry,
  db?: InsertableDb
): Promise<void> {
  try {
    if (db) {
      await db.insert({} as unknown).values({
        userId: entry.userId,
        taskType: entry.taskType,
        modelUsed: entry.modelUsed,
        tokensIn: entry.tokensIn ?? null,
        tokensOut: entry.tokensOut ?? null,
        latencyMs: entry.latencyMs ?? null,
        success: entry.success,
        fromCache: entry.fromCache ?? false,
        costUsd: entry.costUsd ?? null,
        promptVersion: entry.promptVersion ?? null,
        ttftMs: entry.ttftMs ?? null,
        streamed: entry.streamed ?? false,
      });
      return;
    }
    const { directDb } = await import("@/shared/db");
    const { aiUsage } = await import("@/shared/db/schemas/health");
    await directDb.insert(aiUsage).values({
      userId: entry.userId,
      taskType: entry.taskType,
      modelUsed: entry.modelUsed,
      tokensIn: entry.tokensIn ?? null,
      tokensOut: entry.tokensOut ?? null,
      latencyMs: entry.latencyMs ?? null,
      success: entry.success,
      fromCache: entry.fromCache ?? false,
      costUsd: entry.costUsd ?? null,
      promptVersion: entry.promptVersion ?? null,
      ttftMs: entry.ttftMs ?? null,
      streamed: entry.streamed ?? false,
    });
  } catch {
    // Silencio deliberado: la telemetría nunca rompe la respuesta al usuario.
  }
}

/**
 * TD-28(b): programa el registro de uso para que sobreviva al cierre de la
 * respuesta.
 *
 * `void recordAiUsage(…)` se perdía cuando Vercel congela la invocación en
 * cuanto termina el stream: la medición de campo del 2026-10-30 encontró 26
 * filas de `ai_usage` para 33 turnos generados (~21 % sin fila), y las que
 * faltaban eran justo las dos más pesadas. `after()` mantiene la función viva
 * hasta que la promesa se resuelve, así que la fila se escribe siempre.
 *
 * Fuera de un request scope (tasks de Trigger.dev, scripts, tests) `after()`
 * lanza; ahí se mantiene el fire-and-forget de siempre.
 *
 * Recibe el registro como callback (no la fila) para que quien llama siga
 * invocando `recordAiUsage` y los spies de los tests sigan observándolo.
 */
export function scheduleAiUsage(run: () => unknown): void {
  const safe = (): void => {
    try {
      void Promise.resolve(run()).catch(() => {});
    } catch {
      // La telemetría nunca rompe la respuesta, ni siquiera si el callback
      // lanza de forma síncrona.
    }
  };
  try {
    after(safe);
  } catch {
    safe();
  }
}

/**
 * Gate de cuota diaria. Retorna null si hay cuota, o Response 429 con
 * header X-AI-Quota-Remaining: 0 si se agotó.
 */
export async function assertAiQuota(
  userId: string,
  taskType: AITaskType
): Promise<NextResponse | null> {
  const result = await checkAiDailyQuota(userId, taskType);
  if (result.success) return null;
  return NextResponse.json(
    {
      success: false,
      error: `Cuota diaria de IA agotada para esta acción. Se renueva en ${result.retryAfter ?? 3600}s.`,
    },
    {
      status: 429,
      headers: {
        "X-AI-Quota-Remaining": "0",
        "Retry-After": String(result.retryAfter ?? 3600),
      },
    }
  );
}
