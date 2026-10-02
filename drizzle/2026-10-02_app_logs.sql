-- ═════════════════════════════════════════════════════════════════════════════
-- Migration 2026-10-02: tabla app_logs (ADR-007)
--
-- Sink de observabilidad de errores: retiene los errores de la app (nivel
-- error) con historial ilimitado para los rechecks post-push T+5m/T+24h,
-- en sustitucion de la ventana de minutos de "vercel logs" (sin sink de
-- plataforma). Escritura solo desde el backend via directDb
-- (src/server/observability/app-logs-sink.ts).
--
-- RLS habilitada SIN policies: anon/authenticated quedan denegados
-- (defensa en profundidad; el backend es dueno de la tabla y no la sufre).
-- Idempotente.
-- ═════════════════════════════════════════════════════════════════════════════

create table if not exists public.app_logs (
  id         uuid not null default gen_random_uuid(),
  created_at timestamptz not null default now(),
  level      text not null default 'error',
  message    text not null,
  code       text,
  source     text not null,
  path       text,
  context    jsonb not null default '{}',
  constraint app_logs_pkey primary key (id)
);

create index if not exists idx_app_logs_created_at
  on public.app_logs (created_at);

-- RLS sin policies: solo el rol dueno (backend via directDb) accede.
alter table public.app_logs enable row level security;
