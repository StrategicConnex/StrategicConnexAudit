import { NextResponse } from "next/server";
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
    });
  } catch {
    // Silencio deliberado: la telemetría nunca rompe la respuesta al usuario.
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
