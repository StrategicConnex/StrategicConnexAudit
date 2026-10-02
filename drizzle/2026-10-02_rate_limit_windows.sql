-- ═════════════════════════════════════════════════════════════════════════════
-- Migration 2026-10-02: tabla rate_limit_windows (ADR-002 enmienda 15)
--
-- Rate limit distribuido: sustituye el store exclusivamente en memoria de
-- src/shared/lib/ratelimit.ts (enmienda 14). Una fila por (prefix, identifier)
-- con el array de timestamps (epoch ms) de la ventana sliding-window; el
-- upsert es atómico, asi todas las instancias serverless cuentan contra la
-- misma fila. Escritura/lectura solo desde el backend via directDb.
--
-- RLS habilitada SIN policies: anon/authenticated quedan denegados
-- (defensa en profundidad; el backend es duedla de la tabla y no la sufre).
-- Idempotente.
-- ═════════════════════════════════════════════════════════════════════════════

create table if not exists public.rate_limit_windows (
  prefix     text not null,
  identifier text not null,
  ts         bigint[] not null,
  expires_at timestamptz not null default now(),
  constraint rate_limit_windows_pkey primary key (prefix, identifier)
);

create index if not exists idx_rate_limit_windows_expires_at
  on public.rate_limit_windows (expires_at);

-- RLS sin policies: solo el rol duedlo (backend via directDb) accede.
alter table public.rate_limit_windows enable row level security;
