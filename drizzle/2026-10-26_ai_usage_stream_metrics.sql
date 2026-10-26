-- Migration 2026-10-26: métricas de streaming en ai_usage (Sprint 1, A2).
-- Sin estas columnas el objetivo "TTFT p50 ≤ 1,5 s" no es medible en prod:
--   SELECT percentile_disc(0.5) WITHIN GROUP (ORDER BY ttft_ms)
--   FROM ai_usage WHERE streamed AND NOT from_cache AND success
--     AND created_at > now() - interval '7 days';
ALTER TABLE "ai_usage" ADD COLUMN IF NOT EXISTS "ttft_ms" integer;
ALTER TABLE "ai_usage" ADD COLUMN IF NOT EXISTS "streamed" boolean DEFAULT false NOT NULL;
