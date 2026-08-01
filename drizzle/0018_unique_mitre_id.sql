-- ═══════════════════════════════════════════════════════════════════════════════
-- Migration 0018: Unique index on adversary_scenarios.mitre_id
--
-- CONTEXTO: getOrCreateScenarioId() (scenario-runner.ts) hace select-then-insert
-- para materializar el template del catálogo. Con el índice anterior NO único
-- (idx_adversary_mitre_id), dos POSTs concurrentes (o un POST colisionando con
-- el cron de 6h) podían insertar filas duplicadas para el mismo mitre_id.
--
-- Esta migración:
--   1. Dedupea duplicados EXISTENTES (conserva un id canónico estable: el primer
--      insert por created_at, desempatando por id — DISTINCT ON, determinista)
--      y re-atribuye adversary_runs.scenario_id / task_nodes.scenario_id al id
--      canónico antes de borrar.
--   2. Elimina el índice no único viejo.
--   3. Crea el índice ÚNICO uniq_adversary_mitre_id.
--
-- NOTA: no se usa MIN(id) porque PostgreSQL no tiene agregado MIN() sobre uuid.
-- DISTINCT ON (mitre_id) ORDER BY created_at, id es la forma correcta.
--
-- Con el índice único en su lugar, getOrCreateScenarioId usa
-- onConflictDoNothing({ target: mitreId }) → la race condition queda cerrada
-- a nivel de base de datos (no solo de aplicación).
--
-- NOTA DE DESPLIEGUE: en cualquier BD con datos existentes (dev/staging/prod)
-- hay que aplicar este SQL ANTES de correr `drizzle-kit push`, porque push
-- diffea el schema contra la BD e intentaría crear el índice único sin el paso
-- de dedupe (fallaría si existen mitre_ids duplicados).
-- ═══════════════════════════════════════════════════════════════════════════════

-- 1. Re-atribuir runs que apuntan a filas duplicadas hacia el id canónico
UPDATE adversary_runs r
SET scenario_id = c.keep_id
FROM (
  SELECT DISTINCT ON (mitre_id) mitre_id, id AS keep_id
  FROM adversary_scenarios
  ORDER BY mitre_id, created_at ASC, id ASC
) c
JOIN adversary_scenarios s ON s.mitre_id = c.mitre_id AND s.id <> c.keep_id
WHERE r.scenario_id = s.id;
--> statement-breakpoint

-- 2. Re-atribuir task nodes (mismo criterio, por si el PTT ya creó nodos)
UPDATE adversary_task_nodes t
SET scenario_id = c.keep_id
FROM (
  SELECT DISTINCT ON (mitre_id) mitre_id, id AS keep_id
  FROM adversary_scenarios
  ORDER BY mitre_id, created_at ASC, id ASC
) c
JOIN adversary_scenarios s ON s.mitre_id = c.mitre_id AND s.id <> c.keep_id
WHERE t.scenario_id = s.id;
--> statement-breakpoint

-- 3. Borrar las filas duplicadas (conserva solo el id canónico por mitre_id)
DELETE FROM adversary_scenarios s
USING (
  SELECT DISTINCT ON (mitre_id) mitre_id, id AS keep_id
  FROM adversary_scenarios
  ORDER BY mitre_id, created_at ASC, id ASC
) c
WHERE s.mitre_id = c.mitre_id AND s.id <> c.keep_id;
--> statement-breakpoint

-- 4. Eliminar el índice no único viejo (reemplazado por el único)
DROP INDEX IF EXISTS idx_adversary_mitre_id;
--> statement-breakpoint

-- 5. Índice ÚNICO: cierra la race condition a nivel de BD
CREATE UNIQUE INDEX IF NOT EXISTS uniq_adversary_mitre_id
  ON adversary_scenarios USING btree (mitre_id);
--> statement-breakpoint
