/**
 * integration-sync.trigger.ts — Reconciliación diaria de `integrations` (TD-10 / TSK-016).
 *
 * No existe servicio de sync externo (verificado: sin OAuth ni `src/app/api/integrations/**`),
 * así que el sweep NO llama a APIs externas: reconcilia cada integración `active` contra el
 * estado real de la BD y persiste el resultado en `integration_sync_logs` (antes tabla fantasma
 * sin escritor).
 *
 * Por integración, en cada corrida:
 *   1. inserta un log `running` (startedAt),
 *   2. reconcilia: sin `credentials_encrypted` → failed; con él, cuenta las filas nuevas de su
 *      tabla de datos (`integration_data_gsc|ga4|bing`) desde `last_sync_at` → `recordsSynced`
 *      (tipos sin tabla de datos — ahrefs/semrush — quedan en success con recordsSynced null),
 *   3. cierra el log (`success`/`failed`, completedAt),
 *   4. `success` → actualiza `integrations.last_sync_at`; `failed` con >48h desde el último
 *      sync exitoso (fallback `created_at`) → marca la integración `expired`.
 *
 * Escritura vía `directDb` (bypass RLS): `integrations` y `integration_sync_logs` tienen RLS ON.
 *
 * Variables de entorno (Trigger.dev Dashboard → Env vars): DATABASE_URL / DIRECT_URL.
 */

import { schedules } from "@trigger.dev/sdk";
import { and, count, eq, gt } from "drizzle-orm";
import { directDb } from "@/shared/db";
import {
  integrationDataBing,
  integrationDataGa4,
  integrationDataGsc,
  integrationSyncLogs,
  integrations,
} from "@/shared/db/schemas";

const STALE_MS = 48 * 60 * 60 * 1000;

type DataTable =
  | typeof integrationDataGsc
  | typeof integrationDataGa4
  | typeof integrationDataBing;

const DATA_TABLE_BY_TYPE: Partial<Record<string, DataTable>> = {
  gsc: integrationDataGsc,
  ga4: integrationDataGa4,
  bing: integrationDataBing,
};

export const integrationSyncSweep = schedules.task({
  id: "integration-sync-sweep",
  cron: "0 3 * * *",
  retry: { maxAttempts: 3 },
  run: async (payload: { timestamp: Date }) => {
    const now = payload.timestamp;
    console.log(`[IntegrationSync] Inicio ${now.toISOString()}`);

    const rows = await directDb
      .select()
      .from(integrations)
      .where(eq(integrations.status, "active"));

    let synced = 0;
    let failures = 0;
    let expired = 0;
    const details: Array<{
      id: string;
      type: string;
      outcome: "synced" | "failed" | "expired";
      recordsSynced: number | null;
      error: string | null;
    }> = [];

    for (const integration of rows) {
      let outcome: "synced" | "failed" | "expired" = "failed";
      let recordsSynced: number | null = null;
      let errorMessage: string | null = null;

      try {
        const [logRow] = await directDb
          .insert(integrationSyncLogs)
          .values({
            integrationId: integration.id,
            status: "running",
            startedAt: now,
          })
          .returning({ id: integrationSyncLogs.id });

        let status: "success" | "failed" = "success";
        try {
          if (!integration.credentialsEncrypted) {
            throw new Error("credenciales ausentes");
          }
          const table = DATA_TABLE_BY_TYPE[integration.type];
          if (table) {
            const since = integration.lastSyncAt;
            const condition = since
              ? and(
                  eq(table.projectId, integration.projectId),
                  gt(table.createdAt, since)
                )
              : eq(table.projectId, integration.projectId);
            const counts = await directDb
              .select({ n: count() })
              .from(table)
              .where(condition);
            recordsSynced = counts[0]?.n ?? 0;
          }
        } catch (err) {
          status = "failed";
          errorMessage = (err instanceof Error ? err.message : String(err)).slice(
            0,
            500
          );
        }

        let expiredNow = false;
        if (status === "failed") {
          const ref = integration.lastSyncAt ?? integration.createdAt;
          expiredNow =
            ref != null && now.getTime() - new Date(ref).getTime() > STALE_MS;
          if (expiredNow) {
            errorMessage = errorMessage
              ? `${errorMessage}; marcada expired (>48h sin sync)`
              : "marcada expired (>48h sin sync)";
          }
        }

        if (logRow) {
          await directDb
            .update(integrationSyncLogs)
            .set({
              status,
              recordsSynced,
              errorMessage,
              completedAt: now,
            })
            .where(eq(integrationSyncLogs.id, logRow.id));
        }

        if (status === "success") {
          await directDb
            .update(integrations)
            .set({ lastSyncAt: now, updatedAt: now })
            .where(eq(integrations.id, integration.id));
          outcome = "synced";
        } else {
          if (expiredNow) {
            await directDb
              .update(integrations)
              .set({ status: "expired", updatedAt: now })
              .where(eq(integrations.id, integration.id));
            outcome = "expired";
          } else {
            outcome = "failed";
          }
        }
      } catch (err) {
        errorMessage = (err instanceof Error ? err.message : String(err)).slice(
          0,
          500
        );
        outcome = "failed";
      }

      if (outcome === "synced") {
        synced++;
      } else {
        failures++;
        if (outcome === "expired") expired++;
      }
      details.push({
        id: integration.id,
        type: integration.type,
        outcome,
        recordsSynced,
        error: errorMessage,
      });
    }

    console.log(
      `[IntegrationSync] Fin: escaneadas=${rows.length} sincronizadas=${synced} fallidas=${failures} expiradas=${expired}`
    );

    return {
      success: failures === 0,
      scanned: rows.length,
      synced,
      failures,
      expired,
      details,
      timestamp: now.toISOString(),
    };
  },
});
