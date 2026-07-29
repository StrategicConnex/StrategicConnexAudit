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
import { eq, and, sql } from "drizzle-orm";
import { runDnsBruteForce } from "./dns-brute";
import { runCtMonitor } from "./ct-monitor";
import { runShadowDetection } from "./shadow-detector";
import { persistDnsSnapshot } from "../history/dns-history";
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
  const assetChangesLog: AssetChange[] = [];

  for (const asset of trulyNewAssets) {
    try {
      await db.insert(intelligenceAssets).values({
        projectId,
        assetType: asset.assetType,
        value: asset.value,
        ip: asset.ip,
        metadata: asset.metadata,
        firstSeenAt: new Date(),
        lastSeenAt: new Date(),
      });

      assetChangesLog.push({
        projectId,
        domain,
        assetType: asset.assetType,
        value: asset.value,
        changeType: "new",
        previousValue: null,
        currentValue: asset.ip,
        metadata: asset.metadata,
        detectedAt: new Date(),
      });
    } catch (err: any) {
      // Si ya existe (unique constraint), actualizar lastSeenAt
      if (err?.code === "23505") {
        try {
          await db
            .update(intelligenceAssets)
            .set({ lastSeenAt: new Date() })
            .where(
              and(
                eq(intelligenceAssets.projectId, projectId),
                eq(intelligenceAssets.assetType, asset.assetType),
                eq(intelligenceAssets.value, asset.value)
              )
            );
        } catch (updateErr) {
          console.error(`[Discovery] Error actualizando lastSeenAt para ${asset.value}:`, updateErr);
        }
      } else {
        console.error(`[Discovery] Error insertando activo ${asset.value}:`, err);
      }
    }
  }

  // 5. Actualizar lastSeenAt de activos conocidos que siguen apareciendo
  for (const asset of allNewAssets) {
    if (knownSet.has(`${asset.assetType}:${asset.value}`)) {
      try {
        await db
          .update(intelligenceAssets)
          .set({ lastSeenAt: new Date() })
          .where(
            and(
              eq(intelligenceAssets.projectId, projectId),
              eq(intelligenceAssets.assetType, asset.assetType),
              eq(intelligenceAssets.value, asset.value)
            )
          );
      } catch {
        // Ignorar errores de actualización
      }
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
