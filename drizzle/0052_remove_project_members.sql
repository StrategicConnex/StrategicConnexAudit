-- ═══════════════════════════════════════════════════════════════════════════════
-- Migration 0052 (P2-16): eliminar project_members — producto owner-only
--
-- `project_members` fue una tabla de membresías que el producto ya no usa: el
-- criterio canónico de acceso es la propiedad (`projects.owner_id`). Borrarla
-- sin más sería un error de seguridad silencioso: **21 policies de 0016/0017/
-- 0022/0023/0024 hacen subquery contra esa tabla**, y `DROP TABLE … CASCADE`
-- las elimina con ella. Las tablas afectadas quedan con RLS activada y sin
-- ninguna policy → fail-closed: nadie excepto los roles con BYPASSRLS
-- (`directDb`) podría leerlas. El síntoma en producción sería «0 filas» sin
-- error, no un fallo visible.
--
-- Por eso el orden es: redefinir el helper a owner-only, **recrear esas 21
-- policies con el mismo nombre y comando** usando el helper (así conservan su
-- semántica salvo la rama de membresía, que desaparece), comprobar que no queda
-- ninguna referencia viva y sólo entonces borrar la tabla.
--
-- Idempotente: `CREATE OR REPLACE FUNCTION`, `DROP POLICY IF EXISTS` + `CREATE`,
-- `DROP TABLE IF EXISTS`.
-- ═══════════════════════════════════════════════════════════════════════════════

-- ── 1. El helper pasa a owner-only ────────────────────────────────────────────
-- Es el mismo helper SECURITY DEFINER de 0025 que usan las policies de 0027 y
-- 0046; redefinirlo aquí mantiene un único predicado en toda la base y evita
-- recursión de policies sobre `projects`.
CREATE OR REPLACE FUNCTION public.user_has_project_access(p_project_id uuid)
RETURNS boolean
LANGUAGE sql STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM projects pr
    WHERE pr.id = p_project_id
      AND pr.owner_id = public.current_auth_uid()
  )
$$;
--> statement-breakpoint

-- ── 2. Policies de SELECT/INSERT/UPDATE que dependían de la membresía ─────────
-- Mismo nombre, misma tabla, mismo comando; el predicado pasa de
-- «owner O miembro» a «owner». Las hijas sin `project_id` conservan su salto
-- por la tabla padre.

-- 2.1 0016 — uptime_logs, anomaly_detections
DROP POLICY IF EXISTS "uptime_logs_select_member_or_owner" ON uptime_logs;
CREATE POLICY "uptime_logs_select_member_or_owner" ON uptime_logs FOR SELECT TO authenticated
  USING (public.user_has_project_access(project_id));
--> statement-breakpoint

DROP POLICY IF EXISTS "anomaly_detections_select_member_or_owner" ON anomaly_detections;
CREATE POLICY "anomaly_detections_select_member_or_owner" ON anomaly_detections FOR SELECT TO authenticated
  USING (public.user_has_project_access(project_id));
--> statement-breakpoint

-- 2.2 0017 — adversary_engagements (project_id) y adversary_task_nodes (engagement_id)
DROP POLICY IF EXISTS "adversary_engagements_select_member_or_owner" ON adversary_engagements;
CREATE POLICY "adversary_engagements_select_member_or_owner" ON adversary_engagements FOR SELECT TO authenticated
  USING (public.user_has_project_access(project_id));
--> statement-breakpoint

DROP POLICY IF EXISTS "adversary_task_nodes_select_member_or_owner" ON adversary_task_nodes;
CREATE POLICY "adversary_task_nodes_select_member_or_owner" ON adversary_task_nodes FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM adversary_engagements e
    WHERE e.id = adversary_task_nodes.engagement_id
      AND public.user_has_project_access(e.project_id)
  ));
--> statement-breakpoint

-- 2.3 0022 — SELECT de inteligencia
DROP POLICY IF EXISTS "intelligence_findings_select_member_or_owner" ON intelligence_findings;
CREATE POLICY "intelligence_findings_select_member_or_owner" ON intelligence_findings FOR SELECT TO authenticated
  USING (public.user_has_project_access(project_id));
--> statement-breakpoint

DROP POLICY IF EXISTS "intelligence_assets_select_member_or_owner" ON intelligence_assets;
CREATE POLICY "intelligence_assets_select_member_or_owner" ON intelligence_assets FOR SELECT TO authenticated
  USING (public.user_has_project_access(project_id));
--> statement-breakpoint

DROP POLICY IF EXISTS "intelligence_investigations_select_member_or_owner" ON intelligence_investigations;
CREATE POLICY "intelligence_investigations_select_member_or_owner" ON intelligence_investigations FOR SELECT TO authenticated
  USING (public.user_has_project_access(project_id));
--> statement-breakpoint

DROP POLICY IF EXISTS "intelligence_run_events_select_member_or_owner" ON intelligence_run_events;
CREATE POLICY "intelligence_run_events_select_member_or_owner" ON intelligence_run_events FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM intelligence_investigations i
    WHERE i.id = intelligence_run_events.investigation_id
      AND public.user_has_project_access(i.project_id)
  ));
--> statement-breakpoint

-- 2.4 0023 — escritura de inteligencia
DROP POLICY IF EXISTS "intelligence_investigations_insert_member_or_owner" ON intelligence_investigations;
CREATE POLICY "intelligence_investigations_insert_member_or_owner" ON intelligence_investigations FOR INSERT TO authenticated
  WITH CHECK (public.user_has_project_access(project_id));
--> statement-breakpoint

DROP POLICY IF EXISTS "intelligence_investigations_update_member_or_owner" ON intelligence_investigations;
CREATE POLICY "intelligence_investigations_update_member_or_owner" ON intelligence_investigations FOR UPDATE TO authenticated
  USING (public.user_has_project_access(project_id))
  WITH CHECK (public.user_has_project_access(project_id));
--> statement-breakpoint

DROP POLICY IF EXISTS "intelligence_findings_insert_member_or_owner" ON intelligence_findings;
CREATE POLICY "intelligence_findings_insert_member_or_owner" ON intelligence_findings FOR INSERT TO authenticated
  WITH CHECK (public.user_has_project_access(project_id));
--> statement-breakpoint

DROP POLICY IF EXISTS "intelligence_assets_insert_member_or_owner" ON intelligence_assets;
CREATE POLICY "intelligence_assets_insert_member_or_owner" ON intelligence_assets FOR INSERT TO authenticated
  WITH CHECK (public.user_has_project_access(project_id));
--> statement-breakpoint

DROP POLICY IF EXISTS "intelligence_run_events_insert_member_or_owner" ON intelligence_run_events;
CREATE POLICY "intelligence_run_events_insert_member_or_owner" ON intelligence_run_events FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM intelligence_investigations i
    WHERE i.id = intelligence_run_events.investigation_id
      AND public.user_has_project_access(i.project_id)
  ));
--> statement-breakpoint

DROP POLICY IF EXISTS "intelligence_tool_runs_select_member_or_owner" ON intelligence_tool_runs;
CREATE POLICY "intelligence_tool_runs_select_member_or_owner" ON intelligence_tool_runs FOR SELECT TO authenticated
  USING (public.user_has_project_access(project_id));
--> statement-breakpoint

DROP POLICY IF EXISTS "intelligence_tool_runs_insert_member_or_owner" ON intelligence_tool_runs;
CREATE POLICY "intelligence_tool_runs_insert_member_or_owner" ON intelligence_tool_runs FOR INSERT TO authenticated
  WITH CHECK (public.user_has_project_access(project_id));
--> statement-breakpoint

-- 2.5 0024 — tablas de proyecto de la fase 1
DROP POLICY IF EXISTS "audits_select_member_or_owner" ON audits;
CREATE POLICY "audits_select_member_or_owner" ON audits FOR SELECT TO authenticated
  USING (public.user_has_project_access(project_id));
--> statement-breakpoint

DROP POLICY IF EXISTS "audits_insert_member_or_owner" ON audits;
CREATE POLICY "audits_insert_member_or_owner" ON audits FOR INSERT TO authenticated
  WITH CHECK (public.user_has_project_access(project_id));
--> statement-breakpoint

DROP POLICY IF EXISTS "crawl_results_select_member_or_owner" ON crawl_results;
CREATE POLICY "crawl_results_select_member_or_owner" ON crawl_results FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM audits a
    WHERE a.id = crawl_results.audit_id
      AND public.user_has_project_access(a.project_id)
  ));
--> statement-breakpoint

DROP POLICY IF EXISTS "keyword_targets_select_member_or_owner" ON keyword_targets;
CREATE POLICY "keyword_targets_select_member_or_owner" ON keyword_targets FOR SELECT TO authenticated
  USING (public.user_has_project_access(project_id));
--> statement-breakpoint

DROP POLICY IF EXISTS "rank_history_select_member_or_owner" ON rank_history;
CREATE POLICY "rank_history_select_member_or_owner" ON rank_history FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM keyword_targets kt
    WHERE kt.id = rank_history.keyword_id
      AND public.user_has_project_access(kt.project_id)
  ));
--> statement-breakpoint

DROP POLICY IF EXISTS "integration_data_gsc_select_member_or_owner" ON integration_data_gsc;
CREATE POLICY "integration_data_gsc_select_member_or_owner" ON integration_data_gsc FOR SELECT TO authenticated
  USING (public.user_has_project_access(project_id));
--> statement-breakpoint

-- ── 3. Guarda: nadie puede quedar colgando de la tabla que desaparece ─────────
-- Si alguna migración futura (o una policy añadida a mano) vuelve a referenciar
-- `project_members`, `DROP TABLE … CASCADE` la borraría en silencio. Aquí la
-- migración falla en voz alta y deja el listado exacto de lo que falta.
DO $$
DECLARE
  restantes TEXT;
BEGIN
  SELECT string_agg(format('%I.%I', schemaname, policyname), ', ' ORDER BY tablename)
    INTO restantes
    FROM pg_policies
   WHERE schemaname = 'public'
     AND (coalesce(qual, '') LIKE '%project_members%'
       OR coalesce(with_check, '') LIKE '%project_members%');

  IF restantes IS NOT NULL THEN
    RAISE EXCEPTION
      'P2-16: estas policies todavía leen project_members y el DROP CASCADE las borraría en silencio: %. Reescríbelas owner-only antes del DROP.',
      restantes;
  END IF;
END $$;
--> statement-breakpoint

-- ── 4. La tabla de membresías desaparece ─────────────────────────────────────
DROP TABLE IF EXISTS public.project_members CASCADE;
