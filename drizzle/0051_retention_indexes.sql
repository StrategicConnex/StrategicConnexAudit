-- 0051 — Índices para optimizar DELETE de retención P2-14
-- Agrega índices en created_at sobre las 4 tablas que serán purgadas
-- periódicamente para controlar el crecimiento de la BD.
--
-- Cada DELETE WHERE created_at < ahora('30 días') beneficiará de un index
-- scan en lugar de un seq scan sobre tablas que pueden crecer sin cota.
--
-- IDEMPOTENTE: IF NOT EXISTS en cada statement.
-- Nombres: convención idx_<tabla>_<columna>.

-- ── Índices para DELETE de retención P2-14 ──

-- app_logs: errores de la app (ADR-007)
CREATE INDEX IF NOT EXISTS idx_app_logs_created_at
  ON public.app_logs USING btree (created_at);

-- intelligence_run_events: eventos de ejecución de herramientas
CREATE INDEX IF NOT EXISTS idx_intelligence_run_events_created_at
  ON public.intelligence_run_events USING btree (created_at);

-- intelligence_tool_runs: ejecuciones de herramientas de inteligencia
CREATE INDEX IF NOT EXISTS idx_intelligence_tool_runs_created_at
  ON public.intelligence_tool_runs USING btree (created_at);

-- intelligence_usage_events: métricas de uso de API (quota billing)
CREATE INDEX IF NOT EXISTS idx_intelligence_usage_events_created_at
  ON public.intelligence_usage_events USING btree (created_at);