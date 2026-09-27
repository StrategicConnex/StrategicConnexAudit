-- ─────────────────────────────────────────────────────────────────────────
-- Migration 2026-09-27: tabla pdf_progress (etapa Upstash → Postgres)
--
-- Sustituye las claves Redis `pdf_progress:<userId>:<genId>` que alimentaban
-- el SSE de progreso de PDF (VULN-007) tras eliminar @upstash/redis.
-- Una fila por (usuario, generación); la escritura la hace el backend con la
-- conexión de servicio (bypassa RLS) y la lectura el SSE, siempre por PK.
-- Idempotente.
-- ─────────────────────────────────────────────────────────────────────────

create table if not exists public.pdf_progress (
  user_id    uuid not null,
  gen_id     text not null,
  percent    integer not null default 0,
  step       text,
  status     text not null default 'working',
  error      text,
  updated_at timestamptz not null default now(),
  constraint pdf_progress_pkey primary key (user_id, gen_id)
);

create index if not exists idx_pdf_progress_updated_at
  on public.pdf_progress (updated_at);

-- RLS: cada usuario solo ve (y borra) sus propias generaciones.
alter table public.pdf_progress enable row level security;

grant select, insert, update, delete on public.pdf_progress to authenticated;

drop policy if exists "pdf_progress_owner" on public.pdf_progress;
create policy "pdf_progress_owner"
  on public.pdf_progress
  for all
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- Higiene: filas huérfanas de generaciones que murieron sin cerrar.
delete from public.pdf_progress where updated_at < now() - interval '1 day';
