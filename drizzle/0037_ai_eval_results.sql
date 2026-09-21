-- 0037: ai_eval_results — resultados del eval continuo del pool (Sprint 4, #8).
-- Idempotente: CREATE TABLE IF NOT EXISTS + CREATE INDEX IF NOT EXISTS.

CREATE TABLE IF NOT EXISTS "ai_eval_results" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "task_type" text NOT NULL,
  "case_id" text NOT NULL,
  "model" text NOT NULL,
  "prompt_version" text NOT NULL,
  "score" integer NOT NULL,
  "passed" boolean NOT NULL,
  "latency_ms" integer,
  "tokens_in" integer,
  "tokens_out" integer,
  "cost_usd" double precision,
  "errored" boolean DEFAULT false NOT NULL,
  "detail" jsonb,
  "user_id" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "idx_ai_eval_model_prompt" ON "ai_eval_results" ("model","prompt_version","created_at");
CREATE INDEX  IF NOT EXISTS "idx_ai_eval_task_created" ON "ai_eval_results" ("task_type","created_at");
