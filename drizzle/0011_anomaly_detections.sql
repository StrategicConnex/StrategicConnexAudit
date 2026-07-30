-- Migration 0011: Anomaly Detection (P3.2)
CREATE TABLE IF NOT EXISTS "anomaly_detections" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "project_id" uuid NOT NULL REFERENCES "projects"("id") ON DELETE CASCADE,
  "investigation_id" uuid REFERENCES "intelligence_investigations"("id") ON DELETE SET NULL,
  "metric_type" text NOT NULL,
  "severity" text NOT NULL DEFAULT 'warning',
  "actual_value" numeric(12, 4) NOT NULL,
  "expected_value" numeric(12, 4) NOT NULL,
  "z_score" numeric(8, 3) NOT NULL,
  "window_size_hours" integer NOT NULL DEFAULT 24,
  "label" text NOT NULL,
  "detail" text,
  "detected_at" timestamptz NOT NULL DEFAULT now(),
  "resolved_at" timestamptz,
  "metadata" jsonb DEFAULT '{}',
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "idx_anomaly_project_metric" ON "anomaly_detections" ("project_id", "metric_type");
CREATE INDEX IF NOT EXISTS "idx_anomaly_severity_detected" ON "anomaly_detections" ("severity", "detected_at");
CREATE INDEX IF NOT EXISTS "idx_anomaly_detected_at" ON "anomaly_detections" ("detected_at");
CREATE INDEX IF NOT EXISTS "idx_anomaly_unresolved" ON "anomaly_detections" ("project_id", "resolved_at");
