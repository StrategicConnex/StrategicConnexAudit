CREATE TABLE IF NOT EXISTS "dns_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"investigation_id" uuid,
	"record_type" text NOT NULL,
	"query" text NOT NULL,
	"value" text NOT NULL,
	"ttl" integer,
	"snapshot_hash" text NOT NULL,
	"snapshot_date" timestamp with time zone DEFAULT now() NOT NULL,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "dns_history" ADD CONSTRAINT "dns_history_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "dns_history" ADD CONSTRAINT "dns_history_investigation_id_intelligence_investigations_id_fk" FOREIGN KEY ("investigation_id") REFERENCES "public"."intelligence_investigations"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_dns_history_project_record_type" ON "dns_history" ("project_id", "record_type");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_dns_history_query_created" ON "dns_history" ("query", "created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_dns_history_snapshot_date" ON "dns_history" ("snapshot_date");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "whois_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"investigation_id" uuid,
	"domain" text NOT NULL,
	"registrar" text,
	"created_date" timestamp with time zone,
	"expires_date" timestamp with time zone,
	"updated_date" timestamp with time zone,
	"status" jsonb DEFAULT '[]'::jsonb,
	"nameservers" jsonb DEFAULT '[]'::jsonb,
	"abuse_contact" text,
	"registrant_org" text,
	"snapshot_hash" text NOT NULL,
	"snapshot_date" timestamp with time zone DEFAULT now() NOT NULL,
	"diff_summary" text,
	"original_snapshot" jsonb DEFAULT '{}'::jsonb,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "whois_history" ADD CONSTRAINT "whois_history_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "whois_history" ADD CONSTRAINT "whois_history_investigation_id_intelligence_investigations_id_fk" FOREIGN KEY ("investigation_id") REFERENCES "public"."intelligence_investigations"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_whois_history_project_domain" ON "whois_history" ("project_id", "domain");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_whois_history_domain_snapshot" ON "whois_history" ("domain", "snapshot_date");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_whois_history_expires_date" ON "whois_history" ("expires_date");
