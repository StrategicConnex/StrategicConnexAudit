-- ═══════════════════════════════════════════════════════════════════════
-- Cobertura MITRE Real — 2026-08-25
-- 1. mitre_evaluations: batch de evaluación real de técnicas MITRE por proyecto
-- 2. mitre_technique_results: veredicto/evidencia/remediación/playbook por técnica
-- ═══════════════════════════════════════════════════════════════════════

create table if not exists public.mitre_evaluations (
  id             uuid primary key default gen_random_uuid(),
  project_id     uuid not null references public.projects(id) on delete cascade,
  status         text not null default 'pending'
                 check (status in ('pending','running','analyzing','completed','failed')),
  target         text not null,
  risk_score     integer,
  summary        text,
  model_used     text,
  exposed_count      integer not null default 0,
  protected_count    integer not null default 0,
  manual_only_count  integer not null default 0,
  raw_evidence   jsonb,
  error          text,
  started_at     timestamptz,
  completed_at   timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index if not exists idx_mitre_eval_project_status
  on public.mitre_evaluations (project_id, status);
create index if not exists idx_mitre_eval_project_created
  on public.mitre_evaluations (project_id, created_at desc);

create table if not exists public.mitre_technique_results (
  id             uuid primary key default gen_random_uuid(),
  evaluation_id  uuid not null references public.mitre_evaluations(id) on delete cascade,
  mitre_id       text not null,
  tactic         text not null,
  technique_name text not null,
  verdict        text not null
                 check (verdict in ('exposed','not_exposed','not_externally_testable','error')),
  confidence     numeric(3,2) not null default 0.80,
  evidence       jsonb,
  summary        text,
  remediation    text[] not null default '{}',
  playbook       text[] not null default '{}',
  ai_model       text,
  created_at     timestamptz not null default now()
);

create index if not exists idx_mitre_tech_results_evaluation
  on public.mitre_technique_results (evaluation_id, verdict);
