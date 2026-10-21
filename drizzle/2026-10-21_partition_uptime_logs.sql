-- Sprint 6 (Q4 6.1, re-scoped): particionar uptime_logs por RANGE(checked_at).
-- Estrategia rename → reconstruir → copiar → policies/grants → (drop legacy en
-- fase posterior, Task 9, tras verificación).
--> statement-breakpoint
ALTER TABLE uptime_logs RENAME TO uptime_logs_legacy;
--> statement-breakpoint
DROP INDEX IF EXISTS idx_uptime_logs_project_checked;
--> statement-breakpoint
DROP INDEX IF EXISTS idx_uptime_logs_checked;
--> statement-breakpoint
CREATE TABLE uptime_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  is_up BOOLEAN NOT NULL,
  status_code INTEGER,
  response_time_ms INTEGER,
  error_message TEXT,
  checked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (id, checked_at)
) PARTITION BY RANGE (checked_at);
--> statement-breakpoint
-- Particiones del trimestre en curso (idempotente).
CREATE TABLE IF NOT EXISTS uptime_logs_2026_09 PARTITION OF uptime_logs
  FOR VALUES FROM ('2026-09-01') TO ('2026-10-01');
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS uptime_logs_2026_10 PARTITION OF uptime_logs
  FOR VALUES FROM ('2026-10-01') TO ('2026-11-01');
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS uptime_logs_2026_11 PARTITION OF uptime_logs
  FOR VALUES FROM ('2026-11-01') TO ('2026-12-01');
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS uptime_logs_2026_12 PARTITION OF uptime_logs
  FOR VALUES FROM ('2026-12-01') TO ('2027-01-01');
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS uptime_logs_2027_01 PARTITION OF uptime_logs
  FOR VALUES FROM ('2027-01-01') TO ('2027-02-01');
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS uptime_logs_2027_02 PARTITION OF uptime_logs
  FOR VALUES FROM ('2027-02-01') TO ('2027-03-01');
--> statement-breakpoint
-- Decisión del owner (2026-10-20, checkpoint C1): el trigger de fallback
-- `trigger_create_uptime_partition` / `create_uptime_logs_partition()` fue
-- RETIRADO. En PG16 el routing de particiones ocurre ANTES de los triggers
-- BEFORE INSERT del parent, así que el fallback al vuelo no funciona: un
-- insert fuera del rango pre-creado falla CERRADO con 23514 (sin pérdida
-- silenciosa). La cobertura real es la pre-creación de particiones
-- (sep-2026→feb-2027 aquí) + TD-21 (higiene en cleanup.trigger.ts, pre-crea
-- 2 meses adelante).
-- Índices re-creados como índices participados (en el parent, heredados).
CREATE INDEX IF NOT EXISTS idx_uptime_logs_project_checked
  ON uptime_logs (project_id, checked_at);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_uptime_logs_checked
  ON uptime_logs (checked_at);
--> statement-breakpoint
-- Copia de datos: los rangos pre-creados cubren las fechas del legacy
-- (un insert fuera de rango fallaría cerrado, no se crea nada al vuelo).
INSERT INTO uptime_logs (id, project_id, is_up, status_code, response_time_ms, error_message, checked_at)
SELECT id, project_id, is_up, status_code, response_time_ms, error_message, checked_at
FROM uptime_logs_legacy
ORDER BY checked_at;
--> statement-breakpoint
-- Copia de policies RLS de la tabla legacy usando pg_policies (solo CREATE de
-- política igual — NO cambia la superficie RLS; el manifest sigue apuntando a
-- "uptime_logs" y los nombres de las policies son exactos).
DO $$
DECLARE
  c RECORD;
BEGIN
  FOR c IN
    SELECT policyname, cmd, roles, qual, with_check
    FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'uptime_logs_legacy'
  LOOP
    EXECUTE format(
      'CREATE POLICY %I ON uptime_logs FOR %s TO %s %s %s',
      c.policyname,
      c.cmd,
      (SELECT string_agg(quote_ident(r), ', ') FROM unnest(c.roles) r),
      CASE WHEN c.qual IS NOT NULL THEN 'USING (' || c.qual || ')' ELSE '' END,
      CASE WHEN c.with_check IS NOT NULL THEN 'WITH CHECK (' || c.with_check || ')' ELSE '' END
    );
  END LOOP;
END
$$;
--> statement-breakpoint
-- Copia de GRANTs (privilegios del legacy → nova tabla).
DO $$
DECLARE
  c RECORD;
BEGIN
  FOR c IN
    SELECT grantee, privilege_type
    FROM information_schema.role_table_grants
    WHERE table_schema = 'public' AND table_name = 'uptime_logs_legacy'
      AND grantee != 'PUBLIC' AND grantee != 'postgres'
  LOOP
    EXECUTE format('GRANT %s ON uptime_logs TO %I', c.privilege_type, c.grantee);
  END LOOP;
END
$$;
--> statement-breakpoint
-- Copia de banderas RLS del legacy (CREATE TABLE ... PARTITION OF NO hereda
-- relrowsecurity: una policy copiada sin ENABLE es inerte). Solo se re-crea
-- lo que ya existía en el legacy; no se cambia la superficie RLS.
DO $$
DECLARE
  c RECORD;
BEGIN
  FOR c IN
    SELECT relrowsecurity, relforcerowsecurity
    FROM pg_class
    WHERE relname = 'uptime_logs_legacy'
  LOOP
    IF c.relrowsecurity THEN
      EXECUTE 'ALTER TABLE uptime_logs ENABLE ROW LEVEL SECURITY';
      IF c.relforcerowsecurity THEN
        EXECUTE 'ALTER TABLE uptime_logs FORCE ROW LEVEL SECURITY';
      END IF;
    END IF;
  END LOOP;
END
$$;
--> statement-breakpoint
-- (El DROP de uptime_logs_legacy NO va en esta migración: se ejecuta en Task 9
-- tras verificación de conteos y muestra. Deja un comentario sentinela aquí.)
