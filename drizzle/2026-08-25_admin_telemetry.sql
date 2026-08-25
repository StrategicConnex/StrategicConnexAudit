-- ═══════════════════════════════════════════════════════════════════════
-- Admin Panel + Telemetría — 2026-08-25
-- 1. user_logs: registro de accesos (email, last_login, ip, país)
-- 2. projects: is_deleted / is_hidden (soft delete ampliado)
-- 3. RLS: solo el admin puede leer user_logs
-- ═══════════════════════════════════════════════════════════════════════

-- ─── 1. user_logs ──────────────────────────────────────────────────────
create table if not exists public.user_logs (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.users(id) on delete cascade,
  email       text not null,
  last_login  timestamptz not null default now(),
  ip_address  text,
  country     text,
  user_agent  text,
  access_count integer not null default 1,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint user_logs_user_id_key unique (user_id)
);

create index if not exists idx_user_logs_last_login on public.user_logs (last_login desc);
create index if not exists idx_user_logs_email on public.user_logs (email);

alter table public.user_logs enable row level security;

-- SELECT: solo el usuario admin de plataforma (por email, nunca user_metadata).
-- La escritura la hace el backend con la conexión de servicio (bypassa RLS).
drop policy if exists "admin_read_user_logs" on public.user_logs;
create policy "admin_read_user_logs"
  on public.user_logs
  for select
  to authenticated
  using (
    exists (
      select 1 from public.users u
      where u.id = (select auth.uid())
        and u.email = 'palacios_juan@hotmail.com'
        and u.role = 'admin'
    )
  );

-- ─── 2. projects: soft delete ampliado ─────────────────────────────────
alter table public.projects
  add column if not exists is_deleted boolean not null default false,
  add column if not exists is_hidden  boolean not null default false;

-- Backfill: proyectos con deleted_at se marcan también is_deleted
update public.projects
set is_deleted = true
where deleted_at is not null and is_deleted = false;

create index if not exists idx_projects_visibility on public.projects (is_deleted, is_hidden)
  where is_deleted = false and is_hidden = false;

-- ─── 3. Backfill de user_logs desde users existentes ───────────────────
insert into public.user_logs (user_id, email, last_login)
select u.id, u.email, coalesce(u.last_sign_in_at, u.created_at, now())
from public.users u
on conflict (user_id) do nothing;
