/**
 * discovery/orchestrator.ts — Discovery Orchestrator
 *
 * Coordina la ejecución de todos los módulos de descubrimiento continuo
 * y persiste los resultados en la base de datos.
 *
 * Flujo:
 *   1. Obtener activos previamente conocidos de la BD (por proyecto)
 *   2. Ejecutar todos los módulos de descubrimiento
 *   3. Detectar activos nuevos vs. conocidos
 *   4. Persistir activos nuevos en intelligence_assets
 *   5. Registrar cambios en asset_changes
 *   6. Generar hallazgos de seguridad consolidados
 */

import { db } from "@/shared/db";
import { intelligenceAssets } from "@/shared/db/schemas/intelligence";
import { eq, sql } from "drizzle-orm";
import { runDnsBruteForce } from "./dns-brute";
import { runCtMonitor } from "./ct-monitor";
import { runShadowDetection } from "./shadow-detector";
import type { DiscoveryConfig, DiscoveryRunResult, AssetChange } from "./types";

// ─── Persistencia de asset_changes (tabla separada para tracking) ─────────────

export const assetChanges = sql`asset_changes`;

/**
 * Descubrimiento completo: ejecuta todos los módulos y persiste resultados.
 */
export async function runDiscovery(config: DiscoveryConfig): Promise<DiscoveryRunResult> {
  const { domain, projectId, dnsBruteForce = true, ctMonitor = true, shadowDetection = true } = config;
  const startTime = Date.now();

  console.log(`[Discovery] Iniciando descubrimiento para ${domain} (proyecto ${projectId})`);

  // 1. Obtener activos ya conocidos
  const knownAssets = await db
    .select({ value: intelligenceAssets.value, assetType: intelligenceAssets.assetType })
    .from(intelligenceAssets)
    .where(eq(intelligenceAssets.projectId, projectId));

  const knownSet = new Set(
    knownAssets.map((a) => `${a.assetType}:${a.value}`)
  );

  // 2. Ejecutar módulos en paralelo
  const modules = await Promise.all([
    dnsBruteForce ? runDnsBruteForce(domain, projectId) : Promise.resolve({
      moduleId: "dns-brute",
      moduleName: "DNS Brute Force Subdomain Discovery",
      assets: [],
      findings: [],
      success: true,
      durationMs: 0,
    }),
    ctMonitor ? runCtMonitor(domain, projectId) : Promise.resolve({
      moduleId: "ct-monitor",
      moduleName: "Certificate Transparency Log Monitor",
      assets: [],
      findings: [],
      success: true,
      durationMs: 0,
    }),
  ]);

  // Shadow detection necesita los subdominios descubiertos
  const discoveredSubdomains = modules
    .flatMap((m) => m.assets)
    .filter((a) => a.assetType === "subdomain")
    .map((a) => a.value);

  const shadowResult = shadowDetection
    ? await runShadowDetection(domain, projectId, discoveredSubdomains)
    : {
        moduleId: "shadow-detector",
        moduleName: "Shadow Asset Detector",
        assets: [],
        findings: [],
        success: true,
        durationMs: 0,
      };

  const allModuleResults = [...modules, shadowResult];

  // 3. Consolidar activos nuevos
  const allNewAssets = allModuleResults.flatMap((m) => m.assets);
  const trulyNewAssets = allNewAssets.filter(
    (a) => !knownSet.has(`${a.assetType}:${a.value}`)
  );

  // 4. Persistir activos nuevos en la BD
  // PERF: upsert MASIVO en un solo statement (onConflictDoUpdate sobre la
  // unique (project_id, asset_type, value)). Antes había un INSERT por asset
  // con UPDATE de recuperación en conflicto 23505 — N roundtrips por run.
  const assetChangesLog: AssetChange[] = [];
  const now = new Date();

  if (trulyNewAssets.length > 0) {
    const inserted = await db
      .insert(intelligenceAssets)
      .values(
        trulyNewAssets.map((asset) => ({
          projectId,
          assetType: asset.assetType,
          value: asset.value,
          ip: asset.ip,
          metadata: asset.metadata,
          firstSeenAt: now,
          lastSeenAt: now,
        }))
      )
      .onConflictDoUpdate({
        target: [
          intelligenceAssets.projectId,
          intelligenceAssets.assetType,
          intelligenceAssets.value,
        ],
        set: { lastSeenAt: now },
      })
      .returning({
        assetType: intelligenceAssets.assetType,
        value: intelligenceAssets.value,
      });

    const insertedSet = new Set(
      inserted.map((a) => `${a.assetType}:${a.value}`)
    );

    for (const asset of trulyNewAssets) {
      assetChangesLog.push({
        projectId,
        domain,
        assetType: asset.assetType,
        value: asset.value,
        changeType: "new",
        previousValue: null,
        currentValue: asset.ip ?? null,
        metadata: asset.metadata,
        detectedAt: now,
      });
      if (!insertedSet.has(`${asset.assetType}:${asset.value}`)) {
        console.warn(
          `[Discovery] Conficto inesperado al insertar activo ${asset.value}: no devuelto por RETURNING`
        );
      }
    }
  }

  // 5. Actualizar lastSeenAt de activos conocidos que siguen apareciendo
  // PERF: un solo UPDATE con tupla (project_id, asset_type, value) IN …
  // en lugar de un UPDATE por asset.
  const knownStillSeen = allNewAssets.filter((a) =>
    knownSet.has(`${a.assetType}:${a.value}`)
  );

  if (knownStillSeen.length > 0) {
    const tuples = sql.join(
      knownStillSeen.map(
        (a) => sql`(${projectId}::uuid, ${a.assetType}, ${a.value})`
      ),
      sql`, `
    );
    try {
      await db.execute(
        sql`UPDATE intelligence_assets SET last_seen_at = ${now}
            WHERE (project_id, asset_type, value) IN (${tuples})`
      );
    } catch (updateErr) {
      console.error("[Discovery] Error actualizando lastSeenAt masivo:", updateErr);
    }
  }

  const totalDuration = Date.now() - startTime;

  console.log(
    `[Discovery] Completado para ${domain}. ` +
    `${trulyNewAssets.length} activos nuevos, ` +
    `${allNewAssets.length} totales. ` +
    `Duración: ${totalDuration}ms`
  );

  return {
    domain,
    projectId,
    modules: allModuleResults,
    timestamp: new Date().toISOString(),
    totalNewAssets: trulyNewAssets.length,
    totalChanges: assetChangesLog.length,
  };
}
