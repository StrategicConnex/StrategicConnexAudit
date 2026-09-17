-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 0026: tabla ai_usage (presupuesto IA por usuario, P0-1)
--
-- Una fila por llamada a callAIWithFallback. Escritura fire-and-forget desde
-- la app; sin RLS (solo service role escribe, ningún endpoint la expone en
-- lectura salvo admin por canal privilegiado). Idempotente.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS ai_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  task_type TEXT NOT NULL,
  model_used TEXT NOT NULL DEFAULT 'none',
  tokens_in INTEGER,
  tokens_out INTEGER,
  latency_ms INTEGER,
  success BOOLEAN NOT NULL DEFAULT false,
  from_cache BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_usage_user_created ON ai_usage (user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_ai_usage_task_created ON ai_usage (task_type, created_at);
