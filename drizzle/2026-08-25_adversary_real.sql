-- ═══════════════════════════════════════════════════════════════════════
-- Adversary Real Assessment — 2026-08-25
-- 1. projects.active_testing_authorized: gate de consentimiento por proyecto
-- 2. adversary_assessments: una evaluación real (no destructiva) por ejecución
-- 3. adversary_vulnerabilities: hallazgos clasificados por el agente AI
-- ═══════════════════════════════════════════════════════════════════════

-- ─── 1. Gate de autorización para testing activo ──────────────────────
alter table public.projects
  add column if not exists active_testing_authorized boolean not null default false;

-- ─── 2. Evaluaciones reales ───────────────────────────────────────────
create table if not exists public.adversary_assessments (
  id             uuid primary key default gen_random_uuid(),
  project_id     uuid not null references public.projects(id) on delete cascade,
  status         text not null default 'pending'
                 check (status in ('pending','running','analyzing','completed','failed')),
  target         text not null,
  risk_score     integer,
  summary        text,
  model_used     text,
  evidence_count integer not null default 0,
  checks_total   integer not null default 0,
  checks_passed  integer not null default 0,
  raw_evidence   jsonb,
  analysis_failed boolean not null default false,
  error          text,
  started_at     timestamptz,
  completed_at   timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index if not exists idx_adv_assessments_project_status
  on public.adversary_assessments (project_id, status);
create index if not exists idx_adv_assessments_project_created
  on public.adversary_assessments (project_id, created_at desc);

-- ─── 3. Vulnerabilidades clasificadas por el agente AI ────────────────
create table if not exists public.adversary_vulnerabilities (
  id             uuid primary key default gen_random_uuid(),
  assessment_id  uuid not null references public.adversary_assessments(id) on delete cascade,
  title          text not null,
  severity       text not null check (severity in ('info','low','medium','high','critical')),
  cvss_score     numeric(3,1),
  cwe_id         text,
  owasp_category text,
  mitre_id       text,
  description    text not null,
  evidence       jsonb,
  remediation    text[] not null default '{}',
  "references"   text[] not null default '{}',
  confidence     numeric(3,2) not null default 0.80,
  ai_model       text,
  false_positive boolean not null default false,
  created_at     timestamptz not null default now()
);

create index if not exists idx_adv_vulns_assessment_severity
  on public.adversary_vulnerabilities (assessment_id, severity desc);

-- ─── 4. intelligence_findings: permitir hallazgos sin investigación ───
-- Los hallazgos [ADV-REAL] nacen de assessments (sin investigation padre).
alter table public.intelligence_findings
  alter column investigation_id drop not null;
