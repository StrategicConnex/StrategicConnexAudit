CREATE TABLE IF NOT EXISTS "siem_alert_logs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "rule_event_type" text NOT NULL,
  "ip" text NOT NULL,
  "severity" text NOT NULL DEFAULT 'warning',
  "label" text NOT NULL,
  "count" integer NOT NULL,
  "window_minutes" integer NOT NULL,
  "target" text NOT NULL,
  "status" text NOT NULL DEFAULT 'success',
  "response_code" integer,
  "error_message" text,
  "metadata" jsonb DEFAULT '{}'::jsonb,
  "detected_at" timestamp with time zone NOT NULL,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "idx_siem_logs_created" ON "siem_alert_logs" ("created_at");
CREATE INDEX IF NOT EXISTS "idx_siem_logs_severity_created" ON "siem_alert_logs" ("severity", "created_at");
CREATE INDEX IF NOT EXISTS "idx_siem_logs_rule_type_created" ON "siem_alert_logs" ("rule_event_type", "created_at");
