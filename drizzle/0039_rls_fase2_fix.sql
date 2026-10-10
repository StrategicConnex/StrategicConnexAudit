-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 0039: fix de RLS fase 2 — hijas sin project_id (seguimiento de 0027)
--
-- PROBLEMA: el bloque dinámico de 0027 incluía cinco tablas que NO tienen
-- `project_id` (integration_sync_logs, competitor_keywords, backlink_history,
-- ab_test_results, report_exports). El `CREATE POLICY` con
-- `USING (user_has_project_access(project_id))` fallaba y el `EXCEPTION WHEN
-- OTHERS` lo tragaba en silencio: esas tablas quedaban con RLS habilitado pero
-- sin ninguna policy (fail-closed accidental), y nadie se enteraba.
--
-- 0027 ya se corrigió en su origen, pero las bases que ya lo ejecutaron no
-- volverán a correrlo. Esta migración aplica las mismas policies vía EXISTS al
-- padre, de forma idempotente (DROP POLICY IF EXISTS + CREATE), tanto en bases
-- ya migradas como en las que reclamen 0027 ya corregido.
-- ─────────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS integration_sync_logs_fase2 ON integration_sync_logs;
CREATE POLICY integration_sync_logs_fase2 ON integration_sync_logs FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM integrations i WHERE i.id = integration_sync_logs.integration_id AND public.user_has_project_access(i.project_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM integrations i WHERE i.id = integration_sync_logs.integration_id AND public.user_has_project_access(i.project_id)));
--> statement-breakpoint

DROP POLICY IF EXISTS competitor_keywords_fase2 ON competitor_keywords;
CREATE POLICY competitor_keywords_fase2 ON competitor_keywords FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM competitors c WHERE c.id = competitor_keywords.competitor_id AND public.user_has_project_access(c.project_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM competitors c WHERE c.id = competitor_keywords.competitor_id AND public.user_has_project_access(c.project_id)));
--> statement-breakpoint

DROP POLICY IF EXISTS backlink_history_fase2 ON backlink_history;
CREATE POLICY backlink_history_fase2 ON backlink_history FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM backlinks b WHERE b.id = backlink_history.backlink_id AND public.user_has_project_access(b.project_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM backlinks b WHERE b.id = backlink_history.backlink_id AND public.user_has_project_access(b.project_id)));
--> statement-breakpoint

DROP POLICY IF EXISTS ab_test_results_fase2 ON ab_test_results;
CREATE POLICY ab_test_results_fase2 ON ab_test_results FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM ab_tests t WHERE t.id = ab_test_results.test_id AND public.user_has_project_access(t.project_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM ab_tests t WHERE t.id = ab_test_results.test_id AND public.user_has_project_access(t.project_id)));
--> statement-breakpoint

DROP POLICY IF EXISTS report_exports_fase2 ON report_exports;
CREATE POLICY report_exports_fase2 ON report_exports FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM reports r WHERE r.id = report_exports.report_id AND public.user_has_project_access(r.project_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM reports r WHERE r.id = report_exports.report_id AND public.user_has_project_access(r.project_id)));
