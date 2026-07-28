CREATE TABLE IF NOT EXISTS "ai_health_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"checked_at" timestamp with time zone DEFAULT now() NOT NULL,
	"overall_status" text DEFAULT 'healthy' NOT NULL,
	"task_type" text DEFAULT 'all' NOT NULL,
	"models_healthy" integer DEFAULT 0 NOT NULL,
	"models_failed" integer DEFAULT 0 NOT NULL,
	"models_total" integer DEFAULT 0 NOT NULL,
	"avg_latency_ms" integer,
	"model_results" jsonb DEFAULT '[]'::jsonb,
	"trigger_source" text DEFAULT 'cron' NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_ai_health_checked_at" ON "ai_health_logs" ("checked_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_ai_health_overall_status" ON "ai_health_logs" ("overall_status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_ai_health_task_type_checked" ON "ai_health_logs" ("task_type", "checked_at");
