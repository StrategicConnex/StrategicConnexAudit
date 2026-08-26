alter table public.adversary_assessments
  add column if not exists current_step text,
  add column if not exists checks_done integer not null default 0;
alter table public.mitre_evaluations
  add column if not exists current_step text,
  add column if not exists checks_done integer not null default 0;
alter table public.mitre_evaluations
  add column if not exists checks_total integer not null default 0;
