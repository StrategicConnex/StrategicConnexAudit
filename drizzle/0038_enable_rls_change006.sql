-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 0038: CHANGE-006 — ENABLE ROW LEVEL SECURITY en 7 tablas
--
-- CONTEXTO: 5 tablas con grant SELECT a `authenticated` y policies SELECT ya
-- diseñadas (0016/0025+) vivían con RLS disabled → policies inertes y lectura
-- cross-tenant vía PostgREST (RSK-10). 2 tablas (exec_briefs, ai_eval_results)
-- sin grant ni policy → ENABLE las deja fail-closed ante grants futuros.
--
-- Aprobación: CHANGE-006-APPROVAL-PACKAGE.md §17 (owner, 2026-10-01).
-- Pre-checks §10.1: 7× relrowsecurity=false, relforcerowsecurity=false;
-- 63 RLS / 84 policies / 70 tablas; quals adversary_* member-or-owner leídas.
-- 0 grants, 0 policies, NUNCA FORCE. Idempotente (ENABLE re-ejecutable).
-- Rollback: DISABLE ROW LEVEL SECURITY ×7 (§5.4 del paquete).
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE "project_members" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "uptime_logs" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "anomaly_detections" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "adversary_engagements" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "adversary_task_nodes" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "exec_briefs" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "ai_eval_results" ENABLE ROW LEVEL SECURITY;
