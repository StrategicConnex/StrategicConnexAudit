-- ═══════════════════════════════════════════════════════════════════════════════
-- Migration 0046: escritura (UPDATE) bajo RLS en las tablas de inteligencia
--
-- PROBLEMA (bloqueo de P0.2, anunciado en el §1.1 del plan): `intelligence_assets`
-- e `intelligence_findings` tienen RLS habilitada con policies de SELECT (0022) e
-- INSERT (0023), pero NINGUNA de UPDATE. La escritura del servidor funciona hoy
-- sólo porque los caminos que escriben usan `directDb` (rol `postgres`, medido
-- `rolbypassrls = true`). En cuanto el upsert de descubrimiento (que refresca
-- `last_seen_at` de un activo ya existente) o el ciclo de vida de los hallazgos
-- (`status`, `due_at`, `acknowledged_at`…) se migren a `withRLS`, el UPDATE
-- afectaría 0 filas en silencio — sin policy, RLS no ve la fila — y el error
-- sólo aparecería como «no se actualizó nada». Esta migración es el requisito
-- previo de esas dos migraciones, no un extra.
--
-- DECISIÓN de predicado: `public.user_has_project_access(project_id)`, el helper
-- SECURITY DEFINER de 0025 — el mismo que usan las policies de la fase 2 (0027)
-- y el mismo predicado que la policy SELECT de 0022 (escrito allí inline). Se
-- descarta resolver la pertenencia vía `intelligence_investigations`, que fue la
-- propuesta inicial, por dos motivos medidos:
--   1. `intelligence_assets.investigation_id` es NULLABLE y 0045 lo dejó en
--      `ON DELETE SET NULL` **a propósito** (preservar la evidencia forense al
--      borrar una investigación). Una policy por esa vía dejaría sin poder
--      actualizar justo esas filas huérfanas, que son un caso que el diseño
--      decidió conservar.
--   2. Sería MÁS restrictiva que el SELECT de la MISMA tabla (leer sí, actualizar
--      no), un desajuste de política difícil de diagnosticar y de explicar.
--
-- Idempotente (DROP POLICY IF EXISTS + CREATE), como 0022/0023/0027. Los grants
-- se declaran explícitamente aunque en la base live probablemente ya lleguen por
-- los DEFAULT PRIVILEGES de Supabase: 0022 sólo declaró `GRANT SELECT` y 0042
-- tuvo que revertir a mano un TRUNCATE heredado, así que el estado se escribe en
-- vez de suponerse. `GRANT` es idempotente por naturaleza.
-- ═══════════════════════════════════════════════════════════════════════════════

-- 1. Privilegios de escritura para `authenticated` (el INSERT lo introdujo 0023
--    sin declarar el grant; el UPDATE es el que falta entero).
GRANT INSERT, UPDATE ON intelligence_assets TO authenticated;
--> statement-breakpoint

GRANT INSERT, UPDATE ON intelligence_findings TO authenticated;
--> statement-breakpoint

-- 2. intelligence_assets — UPDATE (upsert de descubrimiento: last_seen_at, metadata)
DROP POLICY IF EXISTS "intelligence_assets_update_member_or_owner" ON intelligence_assets;
--> statement-breakpoint

CREATE POLICY "intelligence_assets_update_member_or_owner" ON intelligence_assets
  FOR UPDATE TO authenticated
  USING (public.user_has_project_access(project_id))
  WITH CHECK (public.user_has_project_access(project_id));
--> statement-breakpoint

-- 3. intelligence_findings — UPDATE (ciclo de vida: status, due_at, acknowledged_at)
DROP POLICY IF EXISTS "intelligence_findings_update_member_or_owner" ON intelligence_findings;
--> statement-breakpoint

CREATE POLICY "intelligence_findings_update_member_or_owner" ON intelligence_findings
  FOR UPDATE TO authenticated
  USING (public.user_has_project_access(project_id))
  WITH CHECK (public.user_has_project_access(project_id));
--> statement-breakpoint
