CREATE TYPE "public"."finding_severity" AS ENUM('info', 'low', 'medium', 'high', 'critical');--> statement-breakpoint
CREATE TYPE "public"."investigation_status" AS ENUM('draft', 'queued', 'running', 'completed', 'failed', 'canceled');--> statement-breakpoint
CREATE TYPE "public"."target_type" AS ENUM('domain', 'hostname', 'url', 'ip', 'email', 'asn', 'cidr');--> statement-breakpoint
CREATE TYPE "public"."tool_run_status" AS ENUM('queued', 'running', 'completed', 'failed', 'canceled', 'rate_limited');--> statement-breakpoint
CREATE TABLE "intelligence_assets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"investigation_id" uuid,
	"asset_type" text NOT NULL,
	"value" text NOT NULL,
	"ip" text,
	"first_seen_at" timestamp with time zone DEFAULT now(),
	"last_seen_at" timestamp with time zone DEFAULT now(),
	"metadata" jsonb DEFAULT '{}'::jsonb,
	CONSTRAINT "uniq_intel_asset_project_type_value" UNIQUE("project_id","asset_type","value")
);
--> statement-breakpoint
CREATE TABLE "intelligence_findings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"investigation_id" uuid NOT NULL,
	"tool_run_id" uuid,
	"project_id" uuid NOT NULL,
	"severity" "finding_severity" NOT NULL,
	"confidence" numeric(4, 3) DEFAULT '0.700' NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"recommendation" text,
	"evidence" jsonb DEFAULT '{}'::jsonb,
	"affected_asset" text,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "intelligence_investigations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"owner_id" uuid,
	"title" text NOT NULL,
	"target" text NOT NULL,
	"normalized_target" text NOT NULL,
	"target_type" "target_type" NOT NULL,
	"status" "investigation_status" DEFAULT 'draft' NOT NULL,
	"score" integer,
	"summary" text,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "intelligence_run_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"investigation_id" uuid NOT NULL,
	"tool_run_id" uuid,
	"event_type" text NOT NULL,
	"message" text NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "intelligence_tool_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"investigation_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"tool_id" text NOT NULL,
	"category" text NOT NULL,
	"status" "tool_run_status" DEFAULT 'queued' NOT NULL,
	"input" jsonb NOT NULL,
	"output" jsonb,
	"error" text,
	"cache_key" text,
	"duration_ms" integer,
	"cost_units" integer DEFAULT 1 NOT NULL,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "intelligence_usage_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"user_id" uuid,
	"tool_id" text NOT NULL,
	"target_hash" text NOT NULL,
	"units" integer DEFAULT 1 NOT NULL,
	"allowed" boolean NOT NULL,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "web_vitals_logs" ADD COLUMN "session_id" text;--> statement-breakpoint
ALTER TABLE "web_vitals_logs" ADD COLUMN "path" text;--> statement-breakpoint
ALTER TABLE "web_vitals_logs" ADD COLUMN "browser" text;--> statement-breakpoint
ALTER TABLE "web_vitals_logs" ADD COLUMN "country" text;--> statement-breakpoint
ALTER TABLE "web_vitals_logs" ADD COLUMN "fid" numeric(8, 2);--> statement-breakpoint
ALTER TABLE "web_vitals_logs" ADD COLUMN "page_views" integer DEFAULT 1;--> statement-breakpoint
ALTER TABLE "web_vitals_logs" ADD COLUMN "session_duration" integer;--> statement-breakpoint
ALTER TABLE "web_vitals_logs" ADD COLUMN "time_on_page" integer;--> statement-breakpoint
ALTER TABLE "web_vitals_logs" ADD COLUMN "errors" jsonb;--> statement-breakpoint
ALTER TABLE "web_vitals_logs" ADD COLUMN "interactions" jsonb;--> statement-breakpoint
ALTER TABLE "web_vitals_logs" ADD COLUMN "resources" jsonb;--> statement-breakpoint
ALTER TABLE "web_vitals_logs" ADD COLUMN "connection" jsonb;--> statement-breakpoint
ALTER TABLE "web_vitals_logs" ADD COLUMN "memory" jsonb;--> statement-breakpoint
ALTER TABLE "web_vitals_logs" ADD COLUMN "timing" jsonb;--> statement-breakpoint
ALTER TABLE "web_vitals_logs" ADD COLUMN "raw_payload" jsonb;--> statement-breakpoint
ALTER TABLE "intelligence_assets" ADD CONSTRAINT "intelligence_assets_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "intelligence_assets" ADD CONSTRAINT "intelligence_assets_investigation_id_intelligence_investigations_id_fk" FOREIGN KEY ("investigation_id") REFERENCES "public"."intelligence_investigations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "intelligence_findings" ADD CONSTRAINT "intelligence_findings_investigation_id_intelligence_investigations_id_fk" FOREIGN KEY ("investigation_id") REFERENCES "public"."intelligence_investigations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "intelligence_findings" ADD CONSTRAINT "intelligence_findings_tool_run_id_intelligence_tool_runs_id_fk" FOREIGN KEY ("tool_run_id") REFERENCES "public"."intelligence_tool_runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "intelligence_findings" ADD CONSTRAINT "intelligence_findings_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "intelligence_investigations" ADD CONSTRAINT "intelligence_investigations_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "intelligence_investigations" ADD CONSTRAINT "intelligence_investigations_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "intelligence_run_events" ADD CONSTRAINT "intelligence_run_events_investigation_id_intelligence_investigations_id_fk" FOREIGN KEY ("investigation_id") REFERENCES "public"."intelligence_investigations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "intelligence_run_events" ADD CONSTRAINT "intelligence_run_events_tool_run_id_intelligence_tool_runs_id_fk" FOREIGN KEY ("tool_run_id") REFERENCES "public"."intelligence_tool_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "intelligence_tool_runs" ADD CONSTRAINT "intelligence_tool_runs_investigation_id_intelligence_investigations_id_fk" FOREIGN KEY ("investigation_id") REFERENCES "public"."intelligence_investigations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "intelligence_tool_runs" ADD CONSTRAINT "intelligence_tool_runs_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "intelligence_usage_events" ADD CONSTRAINT "intelligence_usage_events_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "intelligence_usage_events" ADD CONSTRAINT "intelligence_usage_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_intel_findings_project_severity" ON "intelligence_findings" USING btree ("project_id","severity");--> statement-breakpoint
CREATE INDEX "idx_intel_investigations_project_created" ON "intelligence_investigations" USING btree ("project_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_intel_investigations_target" ON "intelligence_investigations" USING btree ("normalized_target");--> statement-breakpoint
CREATE INDEX "idx_intel_tool_runs_investigation" ON "intelligence_tool_runs" USING btree ("investigation_id");--> statement-breakpoint
CREATE INDEX "idx_intel_tool_runs_tool_created" ON "intelligence_tool_runs" USING btree ("tool_id","created_at");