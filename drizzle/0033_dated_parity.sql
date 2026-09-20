-- ═══════════════════════════════════════════════════════════════════════════════
-- Migration 0033: paridad con las migraciones fechadas (2026-08-25/26)
--
-- Las 4 migraciones fechadas (admin_telemetry, adversary_real, mitre_real,
-- assessment_progress) nunca entraron al journal de drizzle: se aplicaron a mano
-- en producción. Sin ellas, una instalación desde cero queda sin columnas
-- (projects.is_deleted/is_hidden/active_testing_authorized), sin CHECKs, sin el
-- unique user_logs(user_id) que exige el upsert de telemetría, sin la policy
-- admin de user_logs y con intelligence_findings.investigation_id NOT NULL.
--
-- 100% IDEMPOTENTE: en producción (todo ya aplicado) se registra en el ledger
-- como no-op; en instalaciones nuevas completa la paridad con producción.
-- La policy de user_logs usa public.current_auth_uid() (creada en 0025) en vez
-- de auth.uid() para ser portable fuera de Supabase.
-- ═══════════════════════════════════════════════════════════════════════════════

-- ── 1. user_logs: unique (user_id) para el upsert de telemetría ────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'user_logs_user_id_key'
                 AND conrelid = 'user_logs'::regclass) THEN
    ALTER TABLE "user_logs" ADD CONSTRAINT "user_logs_user_id_key" UNIQUE ("user_id");
  END IF;
END $$;
--> statement-breakpoint

ALTER TABLE "user_logs" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

DROP POLICY IF EXISTS "admin_read_user_logs" ON "user_logs";
--> statement-breakpoint

CREATE POLICY "admin_read_user_logs"
  ON "user_logs"
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM "users" u
      WHERE u.id = public.current_auth_uid()
        AND u.email = 'palacios_juan@hotmail.com'
        AND u.role = 'admin'
    )
  );
--> statement-breakpoint

-- ── 2. projects: soft delete ampliado + gate de testing activo ─────────────────
ALTER TABLE "projects"
  ADD COLUMN IF NOT EXISTS "is_deleted" boolean DEFAULT false NOT NULL;
--> statement-breakpoint

ALTER TABLE "projects"
  ADD COLUMN IF NOT EXISTS "is_hidden" boolean DEFAULT false NOT NULL;
--> statement-breakpoint

ALTER TABLE "projects"
  ADD COLUMN IF NOT EXISTS "active_testing_authorized" boolean DEFAULT false NOT NULL;
--> statement-breakpoint

UPDATE "projects" SET "is_deleted" = true
WHERE "deleted_at" IS NOT NULL AND "is_deleted" = false;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "idx_projects_visibility" ON "projects" ("is_deleted", "is_hidden")
  WHERE "is_deleted" = false AND "is_hidden" = false;
--> statement-breakpoint

-- Backfill de user_logs desde users existentes (no-op en instalación nueva)
INSERT INTO "user_logs" ("user_id", "email", "last_login")
SELECT u."id", u."email", COALESCE(u."last_sign_in_at", u."created_at", now())
FROM "users" u
ON CONFLICT ("user_id") DO NOTHING;
--> statement-breakpoint

-- ── 3. CHECKs de adversary_assessments / adversary_vulnerabilities ─────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'adversary_assessments_status_check'
                 AND conrelid = 'adversary_assessments'::regclass) THEN
    ALTER TABLE "adversary_assessments" ADD CONSTRAINT "adversary_assessments_status_check"
      CHECK ("status" IN ('pending','running','analyzing','completed','failed'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'adversary_vulnerabilities_severity_check'
                 AND conrelid = 'adversary_vulnerabilities'::regclass) THEN
    ALTER TABLE "adversary_vulnerabilities" ADD CONSTRAINT "adversary_vulnerabilities_severity_check"
      CHECK ("severity" IN ('info','low','medium','high','critical'));
  END IF;
END $$;
--> statement-breakpoint

-- ── 4. CHECKs de mitre_evaluations / mitre_technique_results ───────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'mitre_evaluations_status_check'
                 AND conrelid = 'mitre_evaluations'::regclass) THEN
    ALTER TABLE "mitre_evaluations" ADD CONSTRAINT "mitre_evaluations_status_check"
      CHECK ("status" IN ('pending','running','analyzing','completed','failed'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'mitre_technique_results_verdict_check'
                 AND conrelid = 'mitre_technique_results'::regclass) THEN
    ALTER TABLE "mitre_technique_results" ADD CONSTRAINT "mitre_technique_results_verdict_check"
      CHECK ("verdict" IN ('exposed','not_exposed','not_externally_testable','error'));
  END IF;
END $$;
--> statement-breakpoint

-- ── 5. intelligence_findings: hallazgos sin investigación padre ([ADV-REAL]) ───
ALTER TABLE "intelligence_findings" ALTER COLUMN "investigation_id" DROP NOT NULL;
--> statement-breakpoint
