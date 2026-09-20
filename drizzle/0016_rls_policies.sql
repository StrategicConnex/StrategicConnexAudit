-- ═══════════════════════════════════════════════════════════════════════════════
-- BOOTSTRAP PREVIO: tablas drift + enum project_role
--
-- Las migraciones 0016-0024 referencian project_members / project_invitations /
-- team_audit_logs / domain_technologies (y sus policies subquean projects), pero
-- esas tablas no se creaban en NINGUNA migración hasta 0025 → una instalación
-- desde cero fallaba en 0016 (GRANT sobre tabla inexistente). Este bloque las
-- crea de forma IDEMPOTENTE antes de tiempo; 0025 las vuelve a declarar con
-- IF NOT EXISTS y no tiene efecto adicional. La BD live no se ve afectada:
-- drizzle-kit migrate decide por timestamp del journal, no por hash.
-- ═══════════════════════════════════════════════════════════════════════════════

-- ── 1. Enum project_role (drift) ───────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'project_role') THEN
    CREATE TYPE project_role AS ENUM ('owner', 'admin', 'editor', 'viewer', 'guest');
  END IF;
END $$;
--> statement-breakpoint

-- ── 2. Tablas drift (idempotente) ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "project_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" "project_role" DEFAULT 'viewer' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'project_members_project_id_user_id_unique'
  ) THEN
    ALTER TABLE "project_members"
      ADD CONSTRAINT "project_members_project_id_user_id_unique"
      UNIQUE ("project_id", "user_id");
  END IF;
END $$;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "idx_project_members_user" ON "project_members" ("user_id");
--> statement-breakpoint

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname LIKE '%project_members_project_id%_fk%'
                 AND conrelid = 'project_members'::regclass) THEN
    ALTER TABLE "project_members"
      ADD CONSTRAINT "project_members_project_id_projects_id_fk"
      FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE CASCADE;
    ALTER TABLE "project_members"
      ADD CONSTRAINT "project_members_user_id_users_id_fk"
      FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;
  END IF;
END $$;
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "project_invitations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"email" text NOT NULL,
	"role" "project_role" DEFAULT 'viewer' NOT NULL,
	"token" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"invited_by" uuid,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'project_invitations_token_unique') THEN
    ALTER TABLE "project_invitations" ADD CONSTRAINT "project_invitations_token_unique" UNIQUE ("token");
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'project_invitations_project_id_email_unique') THEN
    ALTER TABLE "project_invitations"
      ADD CONSTRAINT "project_invitations_project_id_email_unique" UNIQUE ("project_id", "email");
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname LIKE '%project_invitations%fk%'
                 AND conrelid = 'project_invitations'::regclass) THEN
    ALTER TABLE "project_invitations"
      ADD CONSTRAINT "project_invitations_project_id_projects_id_fk"
      FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE CASCADE;
    ALTER TABLE "project_invitations"
      ADD CONSTRAINT "project_invitations_invited_by_users_id_fk"
      FOREIGN KEY ("invited_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;
  END IF;
END $$;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "idx_project_invitations_invited_by" ON "project_invitations" ("invited_by");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "team_audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"actor_id" uuid,
	"action" text NOT NULL,
	"target_email" text,
	"role" "project_role",
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "idx_team_audit_logs_project" ON "team_audit_logs" ("project_id");
--> statement-breakpoint

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname LIKE '%team_audit_logs%fk%'
                 AND conrelid = 'team_audit_logs'::regclass) THEN
    ALTER TABLE "team_audit_logs"
      ADD CONSTRAINT "team_audit_logs_project_id_projects_id_fk"
      FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE CASCADE;
    ALTER TABLE "team_audit_logs"
      ADD CONSTRAINT "team_audit_logs_actor_id_users_id_fk"
      FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE SET NULL;
  END IF;
END $$;
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "domain_technologies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"domain" text NOT NULL,
	"tech_name" text NOT NULL,
	"category" text NOT NULL,
	"confidence" numeric(4, 3) DEFAULT '0.900' NOT NULL,
	"detected_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "idx_domain_technologies_project" ON "domain_technologies" ("project_id");
--> statement-breakpoint

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname LIKE '%domain_technologies%fk%'
                 AND conrelid = 'domain_technologies'::regclass) THEN
    ALTER TABLE "domain_technologies"
      ADD CONSTRAINT "domain_technologies_project_id_projects_id_fk"
      FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE CASCADE;
  END IF;
END $$;
--> statement-breakpoint
-- ═══════════════════════════════════════════════════════════════════════════════
-- ── 3. Tablas fantasma (existían solo en el schema TS y en BD live; cero DDL
--      en migraciones). RLS/policies posteriores (0022, 0027) las referencian.
--      DDL generado del schema TS; idempotente.
CREATE TABLE IF NOT EXISTS "adversary_assessments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"target" text NOT NULL,
	"risk_score" integer,
	"summary" text,
	"model_used" text,
	"evidence_count" integer DEFAULT 0 NOT NULL,
	"checks_total" integer DEFAULT 0 NOT NULL,
	"checks_passed" integer DEFAULT 0 NOT NULL,
	"current_step" text,
	"checks_done" integer DEFAULT 0 NOT NULL,
	"raw_evidence" jsonb,
	"analysis_failed" boolean DEFAULT false NOT NULL,
	"error" text,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'adversary_assessments_project_id_projects_id_fk'
                 AND conrelid = 'adversary_assessments'::regclass) THEN
    ALTER TABLE "adversary_assessments"
      ADD CONSTRAINT "adversary_assessments_project_id_projects_id_fk"
      FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE CASCADE;
  END IF;
END $$;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "idx_adv_assessments_project_status" ON "adversary_assessments" ("project_id", "status");
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "idx_adv_assessments_project_created" ON "adversary_assessments" ("project_id", "created_at");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "adversary_vulnerabilities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"assessment_id" uuid NOT NULL,
	"title" text NOT NULL,
	"severity" text NOT NULL,
	"cvss_score" numeric(3, 1),
	"cwe_id" text,
	"owasp_category" text,
	"mitre_id" text,
	"description" text NOT NULL,
	"evidence" jsonb,
	"remediation" text[] DEFAULT '{}' NOT NULL,
	"references" text[] DEFAULT '{}' NOT NULL,
	"confidence" numeric(3, 2) DEFAULT '0.80' NOT NULL,
	"ai_model" text,
	"false_positive" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'adversary_vulnerabilities_assessment_id_fk'
                 AND conrelid = 'adversary_vulnerabilities'::regclass) THEN
    ALTER TABLE "adversary_vulnerabilities"
      ADD CONSTRAINT "adversary_vulnerabilities_assessment_id_fk"
      FOREIGN KEY ("assessment_id") REFERENCES "public"."adversary_assessments"("id") ON DELETE CASCADE;
  END IF;
END $$;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "idx_adv_vulns_assessment_severity" ON "adversary_vulnerabilities" ("assessment_id", "severity");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "mitre_evaluations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"target" text NOT NULL,
	"risk_score" integer,
	"summary" text,
	"model_used" text,
	"exposed_count" integer DEFAULT 0 NOT NULL,
	"protected_count" integer DEFAULT 0 NOT NULL,
	"manual_only_count" integer DEFAULT 0 NOT NULL,
	"current_step" text,
	"checks_done" integer DEFAULT 0 NOT NULL,
	"checks_total" integer DEFAULT 0 NOT NULL,
	"raw_evidence" jsonb,
	"error" text,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'mitre_evaluations_project_id_projects_id_fk'
                 AND conrelid = 'mitre_evaluations'::regclass) THEN
    ALTER TABLE "mitre_evaluations"
      ADD CONSTRAINT "mitre_evaluations_project_id_projects_id_fk"
      FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE CASCADE;
  END IF;
END $$;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "idx_mitre_eval_project_status" ON "mitre_evaluations" ("project_id", "status");
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "idx_mitre_eval_project_created" ON "mitre_evaluations" ("project_id", "created_at");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "mitre_technique_results" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"evaluation_id" uuid NOT NULL,
	"mitre_id" text NOT NULL,
	"tactic" text NOT NULL,
	"technique_name" text NOT NULL,
	"verdict" text NOT NULL,
	"confidence" numeric(3, 2) DEFAULT '0.80' NOT NULL,
	"evidence" jsonb,
	"summary" text,
	"remediation" text[] DEFAULT '{}' NOT NULL,
	"playbook" text[] DEFAULT '{}' NOT NULL,
	"ai_model" text,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'mitre_technique_results_evaluation_id_fk'
                 AND conrelid = 'mitre_technique_results'::regclass) THEN
    ALTER TABLE "mitre_technique_results"
      ADD CONSTRAINT "mitre_technique_results_evaluation_id_fk"
      FOREIGN KEY ("evaluation_id") REFERENCES "public"."mitre_evaluations"("id") ON DELETE CASCADE;
  END IF;
END $$;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "idx_mitre_tech_results_evaluation" ON "mitre_technique_results" ("evaluation_id", "verdict");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "user_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"email" text NOT NULL,
	"last_login" timestamp with time zone DEFAULT now() NOT NULL,
	"ip_address" text,
	"country" text,
	"user_agent" text,
	"access_count" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'user_logs_user_id_users_id_fk'
                 AND conrelid = 'user_logs'::regclass) THEN
    ALTER TABLE "user_logs"
      ADD CONSTRAINT "user_logs_user_id_users_id_fk"
      FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;
  END IF;
END $$;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "idx_user_logs_last_login" ON "user_logs" ("last_login");
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "idx_user_logs_email" ON "user_logs" ("email");
--> statement-breakpoint

-- Migration 0016: RLS policies para tablas de monitoreo y anomalías
--
-- CONTEXTO: la verificación de pg_policies mostró que RLS estaba DESHABILITADO
-- en todas las tablas y no existían policies. El helper withRLS() de la app
-- (src/shared/db/rls.ts) establece request.jwt.claims {sub: userId} + SET ROLE
-- authenticated, pero sin policies ni grants los endpoints con withRLS:
--   a) no aíslan datos entre tenants (RLS off = todo visible)  ← FUGA
--   b) fallan con 42501 si authenticated no tiene grants       ← 500 fail-closed
--
-- Esta migración corrige uptime_logs y anomaly_detections (las 2 tablas usadas
-- por los endpoints que se migraron a withRLS en el turno previo: benchmarking,
-- intelligence/live y intelligence/anomalies). Las policies verifican membresía
-- real del usuario (dueño del proyecto O miembro de project_members).
-- ═══════════════════════════════════════════════════════════════════════════════

-- 1. Grants: el rol authenticated necesita SELECT a nivel tabla.
--    project_members se incluye porque las policies hacen subquery de membresía.
GRANT SELECT ON uptime_logs TO authenticated;
--> statement-breakpoint

GRANT SELECT ON anomaly_detections TO authenticated;
--> statement-breakpoint

GRANT SELECT ON project_members TO authenticated;
--> statement-breakpoint

-- 2. Habilitar RLS en las tablas
ALTER TABLE uptime_logs ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

ALTER TABLE anomaly_detections ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

-- 3. Policies SELECT — el usuario ve filas solo de proyectos donde es owner o member.
--    El sub del usuario viene de current_setting('request.jwt.claims') que establece withRLS().
--    DROP POLICY IF EXISTS hace la migración idempotente (re-ejecutable).
DROP POLICY IF EXISTS "uptime_logs_select_member_or_owner" ON uptime_logs;
--> statement-breakpoint

CREATE POLICY "uptime_logs_select_member_or_owner" ON uptime_logs
  FOR SELECT TO authenticated
  USING (
    project_id IN (
      SELECT p.id FROM projects p
      WHERE p.owner_id = (NULLIF(current_setting('request.jwt.claims', true), '')::json->>'sub')::uuid
         OR p.id IN (
              SELECT pm.project_id FROM project_members pm
              WHERE pm.user_id = (NULLIF(current_setting('request.jwt.claims', true), '')::json->>'sub')::uuid
            )
    )
  );
--> statement-breakpoint

DROP POLICY IF EXISTS "anomaly_detections_select_member_or_owner" ON anomaly_detections;
--> statement-breakpoint

CREATE POLICY "anomaly_detections_select_member_or_owner" ON anomaly_detections
  FOR SELECT TO authenticated
  USING (
    project_id IN (
      SELECT p.id FROM projects p
      WHERE p.owner_id = (NULLIF(current_setting('request.jwt.claims', true), '')::json->>'sub')::uuid
         OR p.id IN (
              SELECT pm.project_id FROM project_members pm
              WHERE pm.user_id = (NULLIF(current_setting('request.jwt.claims', true), '')::json->>'sub')::uuid
            )
    )
  );
--> statement-breakpoint

-- 4. RLS en project_members: el grant SELECT otorgado arriba solo debe exponer
--    la membresía del propio usuario, no la de todos los proyectos (metadata leak).
ALTER TABLE project_members ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

DROP POLICY IF EXISTS "project_members_select_own" ON project_members;
--> statement-breakpoint

CREATE POLICY "project_members_select_own" ON project_members
  FOR SELECT TO authenticated
  USING (
    user_id = (NULLIF(current_setting('request.jwt.claims', true), '')::json->>'sub')::uuid
  );
--> statement-breakpoint
