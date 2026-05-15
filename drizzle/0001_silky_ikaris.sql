CREATE TABLE "uptime_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"is_up" boolean NOT NULL,
	"status_code" integer,
	"response_time_ms" integer,
	"error_message" text,
	"checked_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "web_vitals_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"url" text NOT NULL,
	"device_type" "device" DEFAULT 'desktop' NOT NULL,
	"lcp" numeric(8, 2),
	"inp" numeric(8, 2),
	"cls" numeric(8, 4),
	"ttfb" numeric(8, 2),
	"fcp" numeric(8, 2),
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "plan_id" uuid;--> statement-breakpoint
ALTER TABLE "uptime_logs" ADD CONSTRAINT "uptime_logs_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "web_vitals_logs" ADD CONSTRAINT "web_vitals_logs_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_plan_id_subscription_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."subscription_plans"("id") ON DELETE no action ON UPDATE no action;