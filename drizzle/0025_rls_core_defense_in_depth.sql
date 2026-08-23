-- ═══════════════════════════════════════════════════════════════════════════════
-- Migration 0025: Defense-in-depth RLS en tablas core + bootstrap de tablas drift
--
-- CONTEXTO (auditoría 2026-08):
--   1. DRIFT: las tablas project_members / project_invitations / team_audit_logs /
--      domain_technologies existen en los schemas TS y en la BD live (creadas
--      out-of-band), pero NO en ninguna migración → un entorno desde cero no puede
--      reconstruirse. Este fichero las crea de forma IDEMPOTENTE (IF NOT EXISTS),
--      por lo que es seguro aplicar sobre la BD live.
--      NOTA para entornos desde cero: las migraciones 0016/0019 referencian estas
--      tablas; aplíquese este fichero ANTES de ejecutar la serie completa.
--   2. DEFENSE-IN-DEPTH: projects (tabla raíz multi-tenant con owner_id), users,
--      audit_logs y developer_api_keys NO tenían RLS. Hoy PostgREST no tiene grants
--      sobre ellas (fail-closed accidental); al habilitar RLS el aislamiento pasa a
--      ser explícito y un GRANT futuro ya no expone datos cross-tenant.
--
-- SEGURIDAD DE RECURSIÓN: la policy de project_members (0016) solo compara
-- user_id = uid (no subquea projects), por lo que una policy de projects que
-- referencie project_members NO genera recursión infinita entre policies.
-- El resto de policies existentes (0016–0024) subqueen projects con el MISMO
-- predicado member_or_owner que se usa aquí → su semántica queda intacta.
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

-- ── 3. Helper functions SECURITY DEFINER (rompen recursión y centralizan) ──────
-- uid del JWT actual (establecido por withRLS() vía request.jwt.claims)
CREATE OR REPLACE FUNCTION public.current_auth_uid()
RETURNS uuid
LANGUAGE sql STABLE
SET search_path = public
AS $$
  SELECT (NULLIF(current_setting('request.jwt.claims', true), '')::json->>'sub')::uuid
$$;
--> statement-breakpoint

-- ¿El usuario actual es owner o miembro del proyecto?
CREATE OR REPLACE FUNCTION public.user_has_project_access(p_project_id uuid)
RETURNS boolean
LANGUAGE sql STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
           SELECT 1 FROM projects pr
           WHERE pr.id = p_project_id
             AND pr.owner_id = public.current_auth_uid()
         )
      OR EXISTS (
           SELECT 1 FROM project_members pm
           WHERE pm.project_id = p_project_id
             AND pm.user_id = public.current_auth_uid()
         )
$$;
--> statement-breakpoint

-- ¿El usuario actual tiene rol admin de plataforma? (SECURITY DEFINER para no
-- depender de la policy SELECT-self de users)
CREATE OR REPLACE FUNCTION public.current_user_is_platform_admin()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM users u
    WHERE u.id = public.current_auth_uid()
      AND u.role = 'admin'
  )
$$;
--> statement-breakpoint

-- ── 4. RLS en projects (tabla raíz multi-tenant) ──────────────────────────────
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

DROP POLICY IF EXISTS "projects_select_member_or_owner" ON projects;
--> statement-breakpoint

CREATE POLICY "projects_select_member_or_owner" ON projects
  FOR SELECT TO authenticated
  USING (
    public.user_has_project_access(id)
  );
--> statement-breakpoint

-- Solo el owner puede crear/modificar/borrar su proyecto
DROP POLICY IF EXISTS "projects_insert_owner" ON projects;
--> statement-breakpoint

CREATE POLICY "projects_insert_owner" ON projects
  FOR INSERT TO authenticated
  WITH CHECK (owner_id = public.current_auth_uid());
--> statement-breakpoint

DROP POLICY IF EXISTS "projects_update_owner" ON projects;
--> statement-breakpoint

CREATE POLICY "projects_update_owner" ON projects
  FOR UPDATE TO authenticated
  USING (owner_id = public.current_auth_uid())
  WITH CHECK (owner_id = public.current_auth_uid());
--> statement-breakpoint

DROP POLICY IF EXISTS "projects_delete_owner" ON projects;
--> statement-breakpoint

CREATE POLICY "projects_delete_owner" ON projects
  FOR DELETE TO authenticated
  USING (owner_id = public.current_auth_uid());
--> statement-breakpoint

-- ── 5. RLS en users (solo lectura del propio perfil) ──────────────────────────
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

DROP POLICY IF EXISTS "users_select_self" ON users;
--> statement-breakpoint

CREATE POLICY "users_select_self" ON users
  FOR SELECT TO authenticated
  USING (id = public.current_auth_uid());
--> statement-breakpoint

-- ── 6. RLS en developer_api_keys (hashes de API keys) ─────────────────────────
ALTER TABLE developer_api_keys ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

DROP POLICY IF EXISTS "developer_api_keys_select_own" ON developer_api_keys;
--> statement-breakpoint

CREATE POLICY "developer_api_keys_select_own" ON developer_api_keys
  FOR SELECT TO authenticated
  USING (user_id = public.current_auth_uid());
--> statement-breakpoint

DROP POLICY IF EXISTS "developer_api_keys_update_own" ON developer_api_keys;
--> statement-breakpoint

CREATE POLICY "developer_api_keys_update_own" ON developer_api_keys
  FOR UPDATE TO authenticated
  USING (user_id = public.current_auth_uid())
  WITH CHECK (user_id = public.current_auth_uid());
--> statement-breakpoint

DROP POLICY IF EXISTS "developer_api_keys_insert_own" ON developer_api_keys;
--> statement-breakpoint

CREATE POLICY "developer_api_keys_insert_own" ON developer_api_keys
  FOR INSERT TO authenticated
  WITH CHECK (user_id = public.current_auth_uid());
--> statement-breakpoint

-- ── 7. RLS en audit_logs (propios registros O admin de plataforma) ────────────
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

DROP POLICY IF EXISTS "audit_logs_select_self_or_admin" ON audit_logs;
--> statement-breakpoint

CREATE POLICY "audit_logs_select_self_or_admin" ON audit_logs
  FOR SELECT TO authenticated
  USING (
    user_id = public.current_auth_uid()
    OR public.current_user_is_platform_admin()
  );
