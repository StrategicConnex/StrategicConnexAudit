-- 0044 — Restituir las 11 FK que el schema declara y la base de datos nunca tuvo.
--
-- P0.5-E (2026-10-12). Cierra el defecto raíz detectado en P0.5: el schema de
-- Drizzle declaraba FK que la BD no tenía, así que borrar un padre dejaba filas
-- huérfanas sin que nada fallara. `0043` arregló `intelligence_run_events`;
-- este barrido cierra el resto, medido con `scripts/db/fk-schema-drift-guard.mjs`
-- antes de escribir esta migración: 93 FK declaradas, 82 en la BD, 11 ausentes.
--
-- Huérfanos medidos (2026-10-12, solo estas 3 tablas tienen alguno; las otras 8
-- tablas están vacías o sin valores no nulos, así que su limpieza es una red de
-- seguridad para entornos distintos de producción, no una necesidad local):
--   intelligence_tool_runs.investigation_id   147 huérfanos de 330 filas
--   intelligence_findings.investigation_id    102 huérfanos de 149 filas
--   intelligence_assets.investigation_id        1 huérfano  de 7 filas
--
-- Política de limpieza (regla general, igual que en 0043):
--   · columna NULLABLE  → se re-parenta a NULL: la fila se conserva y pierde el
--     vínculo muerto. Un tool_run o un finding siguen siendo datos válidos.
--   · columna NOT NULL  → no hay re-parentado posible: la fila sólo existe en
--     función de su padre, así que se elimina. Sólo afecta a
--     adversary_engagements.project_id y adversary_task_nodes.engagement_id,
--     ambas con 0 filas hoy (DELETE inerte).
--
-- Las acciones ON DELETE se copian del schema
-- (src/shared/db/schemas/*.ts), que es la fuente de verdad: donde el schema dice
-- `cascade`, esta migración dice CASCADE. Ojo con el matiz semántico de las tres
-- columnas nullable de `intelligence_*`: el schema pide CASCADE (borrar una
-- investigación se lleva sus tool_runs/findings/assets), no SET NULL. Si el
-- producto prefiere preservarlos desvinculándolos, hay que cambiar el schema
-- primero y volver a generar; el guard `fk-schema-drift-guard.mjs` fallaría con
-- un CASCADE en BD si el schema pidiera SET NULL, y al revés.
--
-- Nota sobre los nombres: se usa la convención de drizzle-kit
-- (`<hija>_<col>_<padre>_<col>_fk`). Postgres trunca a 63 bytes los que exceden
-- (ya ocurre en `intelligence_run_events`); es inofensivo y mantiene la simetría
-- con lo que generaría `drizzle-kit generate`.

-- ═══ 1. Limpieza de huérfanos ═══════════════════════════════════════════

-- (a) Columnas nullable → re-parentado a NULL.
UPDATE "intelligence_tool_runs" c
   SET "investigation_id" = NULL
 WHERE c."investigation_id" IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM "intelligence_investigations" p WHERE p."id" = c."investigation_id");
--> statement-breakpoint
UPDATE "intelligence_findings" c
   SET "investigation_id" = NULL
 WHERE c."investigation_id" IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM "intelligence_investigations" p WHERE p."id" = c."investigation_id");
--> statement-breakpoint
UPDATE "intelligence_assets" c
   SET "investigation_id" = NULL
 WHERE c."investigation_id" IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM "intelligence_investigations" p WHERE p."id" = c."investigation_id");
--> statement-breakpoint
UPDATE "whois_history" c
   SET "investigation_id" = NULL
 WHERE c."investigation_id" IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM "intelligence_investigations" p WHERE p."id" = c."investigation_id");
--> statement-breakpoint
UPDATE "anomaly_detections" c
   SET "investigation_id" = NULL
 WHERE c."investigation_id" IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM "intelligence_investigations" p WHERE p."id" = c."investigation_id");
--> statement-breakpoint
UPDATE "adversary_runs" c
   SET "investigation_id" = NULL
 WHERE c."investigation_id" IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM "intelligence_investigations" p WHERE p."id" = c."investigation_id");
--> statement-breakpoint
UPDATE "adversary_runs" c
   SET "engagement_id" = NULL
 WHERE c."engagement_id" IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM "adversary_engagements" p WHERE p."id" = c."engagement_id");
--> statement-breakpoint
UPDATE "adversary_engagements" c
   SET "owner_id" = NULL
 WHERE c."owner_id" IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM "users" p WHERE p."id" = c."owner_id");
--> statement-breakpoint
UPDATE "adversary_task_nodes" c
   SET "scenario_id" = NULL
 WHERE c."scenario_id" IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM "adversary_scenarios" p WHERE p."id" = c."scenario_id");
--> statement-breakpoint

-- (b) Columnas NOT NULL → no hay re-parentado: se elimina la fila rota.
--     Medido el 2026-10-12: 0 filas en ambas tablas (sentencias inertes).
DELETE FROM "adversary_engagements" c
 WHERE NOT EXISTS (SELECT 1 FROM "projects" p WHERE p."id" = c."project_id");
--> statement-breakpoint
DELETE FROM "adversary_task_nodes" c
 WHERE NOT EXISTS (SELECT 1 FROM "adversary_engagements" p WHERE p."id" = c."engagement_id");
--> statement-breakpoint

-- ═══ 2. Las 11 FK declaradas en el schema ═══════════════════════════════

-- intelligence: las tres columnas nullable que quedaron sin FK en producción.
ALTER TABLE "intelligence_tool_runs"
  ADD CONSTRAINT "intelligence_tool_runs_investigation_id_intelligence_investigations_id_fk"
  FOREIGN KEY ("investigation_id") REFERENCES "intelligence_investigations"("id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "intelligence_findings"
  ADD CONSTRAINT "intelligence_findings_investigation_id_intelligence_investigations_id_fk"
  FOREIGN KEY ("investigation_id") REFERENCES "intelligence_investigations"("id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "intelligence_assets"
  ADD CONSTRAINT "intelligence_assets_investigation_id_intelligence_investigations_id_fk"
  FOREIGN KEY ("investigation_id") REFERENCES "intelligence_investigations"("id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "whois_history"
  ADD CONSTRAINT "whois_history_investigation_id_intelligence_investigations_id_fk"
  FOREIGN KEY ("investigation_id") REFERENCES "intelligence_investigations"("id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "anomaly_detections"
  ADD CONSTRAINT "anomaly_detections_investigation_id_intelligence_investigations_id_fk"
  FOREIGN KEY ("investigation_id") REFERENCES "intelligence_investigations"("id") ON DELETE SET NULL;
--> statement-breakpoint

-- adversary: la propia tabla de engaños nunca tuvo FK (ni hacia su proyecto).
ALTER TABLE "adversary_engagements"
  ADD CONSTRAINT "adversary_engagements_project_id_projects_id_fk"
  FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "adversary_engagements"
  ADD CONSTRAINT "adversary_engagements_owner_id_users_id_fk"
  FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE SET NULL;
--> statement-breakpoint
ALTER TABLE "adversary_runs"
  ADD CONSTRAINT "adversary_runs_investigation_id_intelligence_investigations_id_fk"
  FOREIGN KEY ("investigation_id") REFERENCES "intelligence_investigations"("id") ON DELETE SET NULL;
--> statement-breakpoint
ALTER TABLE "adversary_runs"
  ADD CONSTRAINT "adversary_runs_engagement_id_adversary_engagements_id_fk"
  FOREIGN KEY ("engagement_id") REFERENCES "adversary_engagements"("id") ON DELETE SET NULL;
--> statement-breakpoint
ALTER TABLE "adversary_task_nodes"
  ADD CONSTRAINT "adversary_task_nodes_engagement_id_adversary_engagements_id_fk"
  FOREIGN KEY ("engagement_id") REFERENCES "adversary_engagements"("id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "adversary_task_nodes"
  ADD CONSTRAINT "adversary_task_nodes_scenario_id_adversary_scenarios_id_fk"
  FOREIGN KEY ("scenario_id") REFERENCES "adversary_scenarios"("id") ON DELETE SET NULL;
