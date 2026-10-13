/**
 * discovery/orchestrator.ts — Discovery Orchestrator
 *
 * Coordina la ejecución de todos los módulos de descubrimiento continuo
 * y persiste los resultados en la base de datos.
 *
 * Flujo:
 *   1. Ejecutar todos los módulos de descubrimiento (red)
 *   2. Obtener activos previamente conocidos de la BD (por proyecto)
 *   3. Detectar activos nuevos vs. conocidos
 *   4. Persistir activos nuevos en intelligence_assets (upsert)
 *   5. Refrescar `last_seen_at` de los activos que siguen apareciendo
 *   6. Registrar los cambios detectados en el log de la ejecución
 *
 * AUTORIDAD DE BD (P0.2, Oleada 2): el servicio ya no importa la base; recibe el
 * manejador (`DbExecutor`) del llamante, igual que el historial DNS/WHOIS. Pero
 * aquí manda una diferencia: la fase de red (DNS brute + CT logs + shadow) puede
 * durar minutos, así que va **separada** de la de persistencia. Envolver las dos
 * en una misma transacción retendría una conexión del pool durante todo el
 * escaneo —producción usa `max: 2`— y unos pocos descubrimientos solapados
 * dejarían la aplicación sin conexiones. De ahí las tres puertas:
 *
 *   - route handler con sesión → `discoverAssets(config)` y, después,
 *     `withRLS(userId, (tx) => persistDiscovery(tx, …))`: transacción CORTA que
 *     estrena las policies de `intelligence_assets` (0022 SELECT, 0023 INSERT y
 *     0046 UPDATE). El upsert `onConflictDoUpdate` sólo funciona con esa última:
 *     sin ella el UPDATE de la fila en conflicto afectaría 0 filas sin error.
 *   - cron / worker sin sesión → `runDiscovery(directDb, config)`: atajo
 *     explícito con bypass deliberado, visible en el call site.
 */

import type { DbExecutor } from "@/shared/db/executor";
import { intelligenceAssets } from "@/shared/db/schemas/intelligence";
import { eq, sql } from "drizzle-orm";
import { runDnsBruteForce } from "./dns-brute";
import { runCtMonitor } from "./ct-monitor";
import { runShadowDetection } from "./shadow-detector";
import type {
  AssetChange,
  DiscoveredAsset,
  DiscoveryConfig,
  DiscoveryModuleResult,
  DiscoveryRunResult,
} from "./types";
import { logger } from "@/lib/logger";

// ─── Persistencia de asset_changes (tabla separada para tracking) ─────────────

export const assetChanges = sql`asset_changes`;

/** Módulo vacío: mantiene la forma del resultado cuando un módulo se desactiva. */
function skippedModule(moduleId: string, moduleName: string): DiscoveryModuleResult {
  return { moduleId, moduleName, assets: [], findings: [], success: true, durationMs: 0 };
}

/**
 * Fase 1 — RED, sin base de datos: ejecuta los módulos y devuelve lo crudo.
 * No escribe nada, así que el llamante puede decidir después con qué autoridad
 * se persiste (y con qué transacción).
 */
export async function discoverAssets(config: DiscoveryConfig): Promise<DiscoveryModuleResult[]> {
  const { domain, projectId, dnsBruteForce = true, ctMonitor = true, shadowDetection = true } = config;

  logger.info(`[Discovery] Iniciando descubrimiento para ${domain} (proyecto ${projectId})`);

  // 1. Ejecutar módulos en paralelo
  const modules = await Promise.all([
    dnsBruteForce
      ? runDnsBruteForce(domain, projectId)
      : Promise.resolve(skippedModule("dns-brute", "DNS Brute Force Subdomain Discovery")),
    ctMonitor
      ? runCtMonitor(domain, projectId)
      : Promise.resolve(skippedModule("ct-monitor", "Certificate Transparency Log Monitor")),
  ]);

  // Shadow detection necesita los subdominios descubiertos
  const discoveredSubdomains = modules
    .flatMap((m) => m.assets)
    .filter((a) => a.assetType === "subdomain")
    .map((a) => a.value);

  const shadowResult = shadowDetection
    ? await runShadowDetection(domain, projectId, discoveredSubdomains)
    : skippedModule("shadow-detector", "Shadow Asset Detector");

  return [...modules, shadowResult];
}

/**
 * Fase 2 — BD: registra lo descubierto con la autoridad que recibe el llamante.
 *
 * Espera una transacción corta (ver cabecera). La lectura de activos conocidos y
 * la escritura van juntas a propósito: si se hicieran en llamadas separadas, una
 * ejecución concurrente podría colarse entre ambas y decidir «nuevo» sobre algo
 * que ya existe.
 */
export async function persistDiscovery(
  tx: DbExecutor,
  input: { projectId: string; domain: string; modules: DiscoveryModuleResult[] },
): Promise<{ totalNewAssets: number; totalChanges: number }> {
  const { projectId, domain, modules } = input;
  const now = new Date();

  // 2. Activos ya conocidos del proyecto
  const knownAssets = await tx
    .select({ value: intelligenceAssets.value, assetType: intelligenceAssets.assetType })
    .from(intelligenceAssets)
    .where(eq(intelligenceAssets.projectId, projectId));

  const knownSet = new Set(knownAssets.map((a) => `${a.assetType}:${a.value}`));

  const allAssets = modules.flatMap((m) => m.assets);
  const trulyNewAssets = allAssets.filter((a) => !knownSet.has(`${a.assetType}:${a.value}`));

  // 3. Persistir activos nuevos
  // PERF: upsert MASIVO en un solo statement (onConflictDoUpdate sobre la
  // unique (project_id, asset_type, value)). Antes había un INSERT por asset
  // con UPDATE de recuperación en conflicto 23505 — N roundtrips por run.
  const assetChangesLog: AssetChange[] = [];

  if (trulyNewAssets.length > 0) {
    const inserted = await tx
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
        })),
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

    const insertedSet = new Set(inserted.map((a) => `${a.assetType}:${a.value}`));

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
        logger.warn(
          `[Discovery] Conficto inesperado al insertar activo ${asset.value}: no devuelto por RETURNING`,
        );
      }
    }
  }

  // 4. Actualizar lastSeenAt de activos conocidos que siguen apareciendo
  // PERF: un solo UPDATE con tupla (project_id, asset_type, value) IN …
  // en lugar de un UPDATE por asset.
  const knownStillSeen: DiscoveredAsset[] = allAssets.filter((a) =>
    knownSet.has(`${a.assetType}:${a.value}`),
  );

  if (knownStillSeen.length > 0) {
    const tuples = sql.join(
      knownStillSeen.map((a) => sql`(${projectId}::uuid, ${a.assetType}, ${a.value})`),
      sql`, `,
    );
    await tx.execute(
      sql`UPDATE intelligence_assets SET last_seen_at = ${now}
          WHERE (project_id, asset_type, value) IN (${tuples})`,
    );
  }

  logger.info(
    `[Discovery] Persistidos ${trulyNewAssets.length} activos nuevos y ` +
      `${knownStillSeen.length} ya conocidos para ${domain} (proyecto ${projectId})`,
  );

  return { totalNewAssets: trulyNewAssets.length, totalChanges: assetChangesLog.length };
}

/**
 * Atajo para llamadores SIN sesión (cron de Trigger.dev y demás workers):
 * descubre y persiste con el manejador que se le pasa — `directDb` en esos
 * caminos, donde el bypass de RLS es intencional y no hay usuario al que
 * atribuir la escritura.
 */
export async function runDiscovery(
  tx: DbExecutor,
  config: DiscoveryConfig,
): Promise<DiscoveryRunResult> {
  const startTime = Date.now();
  const modules = await discoverAssets(config);
  const persisted = await persistDiscovery(tx, {
    projectId: config.projectId,
    domain: config.domain,
    modules,
  });

  const totalDuration = Date.now() - startTime;

  logger.info(
    `[Discovery] Completado para ${config.domain}. ` +
      `${persisted.totalNewAssets} activos nuevos, ` +
      `${modules.flatMap((m) => m.assets).length} totales. ` +
      `Duración: ${totalDuration}ms`,
  );

  return {
    domain: config.domain,
    projectId: config.projectId,
    modules,
    timestamp: new Date().toISOString(),
    totalNewAssets: persisted.totalNewAssets,
    totalChanges: persisted.totalChanges,
  };
}
