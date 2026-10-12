-- 0043 — intelligence_run_events: las FK que faltaban (integridad referencial).
--
-- P0.5 (2026-10-12). El schema de Drizzle YA declara estas dos FK con
-- `ON DELETE CASCADE` (src/shared/db/schemas/intelligence.ts →
-- `intelligenceRunEvents`), pero la tabla en producción sólo tenía la PRIMARY
-- KEY: la BD estaba drifted respecto al schema. Consecuencia medida:
-- 217 de 417 filas (52 %) de `intelligence_run_events` quedaron HUÉRFANAS (su
-- `investigation_id` apunta a investigaciones ya borradas) — residuo que dejó la
-- purga de la Fase 1 al borrar las investigaciones demo sin que nada arrastrara
-- sus eventos, porque la FK no existía.
--
-- Esta migración (1) limpia los huérfanos y (2) crea las dos FK que el schema
-- pide, para que borrar una investigación o un tool_run se lleve sus eventos por
-- cascada y no se vuelva a crear basura silenciosa. `investigation_id` es
-- NOT NULL (no se puede re-parentar a NULL: el huérfano se elimina);
-- `tool_run_id` es nullable y hoy no tiene ningún valor no-nulo (0 filas), así
-- que su limpieza es vacua pero se deja explícita por simetría y para que la FK
-- pueda crearse sin sorpresas.

-- 1) Huérfanos de `investigation_id` (NOT NULL → no hay re-parentado posible).
DELETE FROM "intelligence_run_events" e
 WHERE NOT EXISTS (
   SELECT 1 FROM "intelligence_investigations" i WHERE i.id = e."investigation_id"
 );
--> statement-breakpoint
-- 2) Huérfanos de `tool_run_id` (nullable): se re-parenta a NULL en vez de
--    borrar la fila — el evento sigue siendo válido sin el tool_run concreto.
UPDATE "intelligence_run_events" e
   SET "tool_run_id" = NULL
 WHERE e."tool_run_id" IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM "intelligence_tool_runs" t WHERE t.id = e."tool_run_id");
--> statement-breakpoint
-- 3) Las dos FK declaradas en el schema.
ALTER TABLE "intelligence_run_events"
  ADD CONSTRAINT "intelligence_run_events_investigation_id_intelligence_investigations_id_fk"
  FOREIGN KEY ("investigation_id") REFERENCES "intelligence_investigations"("id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "intelligence_run_events"
  ADD CONSTRAINT "intelligence_run_events_tool_run_id_intelligence_tool_runs_id_fk"
  FOREIGN KEY ("tool_run_id") REFERENCES "intelligence_tool_runs"("id") ON DELETE CASCADE;
