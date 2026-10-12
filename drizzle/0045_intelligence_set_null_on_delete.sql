-- 0045 — intelligence_*: ON DELETE CASCADE → SET NULL en investigation_id.
--
-- Decisión de producto (2026-10-12, operador). En un sistema de auditoría de
-- seguridad la trazabilidad es un activo: un hallazgo (`intelligence_findings`),
-- una ejecución de herramienta (`intelligence_tool_runs`) y un activo
-- descubierto (`intelligence_assets`) tienen valor forense propio y deben
-- sobrevivir al borrado de la investigación que los originó — cumplimiento,
-- análisis de tendencias y reportes futuros. CASCADE quemaría esos expedientes
-- al archivar una investigación, así que el schema pasa a declarar
-- `onDelete: "set null"` en las tres columnas nullable
-- (src/shared/db/schemas/intelligence.ts) y esta migración alinea la BD.
--
-- ALCANCE REAL (para no vender de más): las tres tablas tienen además
-- `project_id` NOT NULL con CASCADE hacia `projects`, de modo que borrar un
-- PROYECTO las sigue borrando igual. Este cambio sólo altera la conducta al
-- borrar una INVESTIGACIÓN suelta; hoy ningún camino de código borra
-- investigaciones, así que esto es preparación, no un cambio observable.
--
-- Requisito de la FK nueva: cada fila necesita un padre válido o NULL. La BD ya
-- está limpia (0044 re-parentó 147 + 102 + 1 huérfanos a NULL), así que la
-- validación de la constraint no encuentra nada y no hay que limpiar aquí.
--
-- Nombres: 0044 creó las constraints con la convención de drizzle-kit, que
-- Postgres truncó a 63 bytes (`…_intelligence_investigat`). El DROP usa el
-- nombre truncado REAL y, como red de seguridad, también el nombre corto
-- `_fkey` por si algún entorno las creó a mano; el ADD repite el nombre largo
-- (Postgres lo vuelve a truncar igual), de modo que re-ejecutar es idempotente.

-- ═══ intelligence_tool_runs ═════════════════════════════════════════════
ALTER TABLE "intelligence_tool_runs"
  DROP CONSTRAINT IF EXISTS "intelligence_tool_runs_investigation_id_intelligence_investigat",
  DROP CONSTRAINT IF EXISTS "intelligence_tool_runs_investigation_id_fkey";
--> statement-breakpoint
ALTER TABLE "intelligence_tool_runs"
  ADD CONSTRAINT "intelligence_tool_runs_investigation_id_intelligence_investigations_id_fk"
  FOREIGN KEY ("investigation_id") REFERENCES "intelligence_investigations"("id") ON DELETE SET NULL;
--> statement-breakpoint

-- ═══ intelligence_findings ═══════════════════════════════════════════════
ALTER TABLE "intelligence_findings"
  DROP CONSTRAINT IF EXISTS "intelligence_findings_investigation_id_intelligence_investigati",
  DROP CONSTRAINT IF EXISTS "intelligence_findings_investigation_id_fkey";
--> statement-breakpoint
ALTER TABLE "intelligence_findings"
  ADD CONSTRAINT "intelligence_findings_investigation_id_intelligence_investigations_id_fk"
  FOREIGN KEY ("investigation_id") REFERENCES "intelligence_investigations"("id") ON DELETE SET NULL;
--> statement-breakpoint

-- ═══ intelligence_assets ═════════════════════════════════════════════════
ALTER TABLE "intelligence_assets"
  DROP CONSTRAINT IF EXISTS "intelligence_assets_investigation_id_intelligence_investigation",
  DROP CONSTRAINT IF EXISTS "intelligence_assets_investigation_id_fkey";
--> statement-breakpoint
ALTER TABLE "intelligence_assets"
  ADD CONSTRAINT "intelligence_assets_investigation_id_intelligence_investigations_id_fk"
  FOREIGN KEY ("investigation_id") REFERENCES "intelligence_investigations"("id") ON DELETE SET NULL;
