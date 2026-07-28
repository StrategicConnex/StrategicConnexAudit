CREATE TABLE "security_audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_type" text NOT NULL,
	"ip" text DEFAULT 'unknown' NOT NULL,
	"user_id" uuid,
	"path" text DEFAULT '/' NOT NULL,
	"method" text DEFAULT 'UNKNOWN' NOT NULL,
	"user_agent" text,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "idx_sec_audit_event_type_created" ON "security_audit_logs" USING btree ("event_type","created_at");--> statement-breakpoint
CREATE INDEX "idx_sec_audit_ip_created" ON "security_audit_logs" USING btree ("ip","created_at");