-- ── Ciclo de vida del hallazgo: triage, SLA y actividad ──────────────────────
--
-- Contexto: `intelligence_findings` guardaba únicamente el hecho detectado
-- (severity, confidence, description, ai_triage). No había forma de responder
-- las tres preguntas que un analista hace al abrir el panel de Intelligence:
-- ¿quién lo tiene? ¿en qué estado está? ¿cuánto tiempo lleva esperando?
-- `ai_triage` clasifica el hallazgo pero no registra la decisión humana.
--
-- Todo lo que sigue es ADITIVO: columnas con DEFAULT, una tabla nueva y tres
-- índices. Las filas existentes pasan a status 'open', que es exactamente el
-- estado que describe un hallazgo recién detectado sin triage humano, así que
-- no hay backfill que ejecutar y el UPDATE no es necesario.
--
-- El reloj de SLA arranca al ACUSAR (acknowledged), no al detectar: exigir
-- reactivity antes de que nadie haya visto el hallazgo produce ruido de SLA y
-- castiga al equipo por trabajo ajeno. Por eso `due_at` se calcula en el
-- servidor, en la transición, y no por DEFAULT.
--> statement-breakpoint

ALTER TABLE "intelligence_findings"
  ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'open';
--> statement-breakpoint

ALTER TABLE "intelligence_findings"
  ADD COLUMN IF NOT EXISTS "assignee_id" UUID REFERENCES "users"("id") ON DELETE SET NULL;
--> statement-breakpoint

ALTER TABLE "intelligence_findings"
  ADD COLUMN IF NOT EXISTS "sla_hours" INTEGER;
--> statement-breakpoint

ALTER TABLE "intelligence_findings"
  ADD COLUMN IF NOT EXISTS "due_at" TIMESTAMPTZ;
--> statement-breakpoint

ALTER TABLE "intelligence_findings"
  ADD COLUMN IF NOT EXISTS "acknowledged_at" TIMESTAMPTZ;
--> statement-breakpoint

ALTER TABLE "intelligence_findings"
  ADD COLUMN IF NOT EXISTS "resolved_at" TIMESTAMPTZ;
--> statement-breakpoint

ALTER TABLE "intelligence_findings"
  ADD COLUMN IF NOT EXISTS "suppressed_until" TIMESTAMPTZ;
--> statement-breakpoint

ALTER TABLE "intelligence_findings"
  ADD COLUMN IF NOT EXISTS "suppressed_reason" TEXT;
--> statement-breakpoint

-- Un hallazgo resuelto no vuelve a 'open' por un escaneo posterior: el
-- escáner no debe reabrir tickets ya cerrados. La lista de estados válidos la
-- vive el servidor (src/server/intelligence/findings/workflow.ts); aquí solo se
-- acota el dominio para que un valor corrupto no entre por la puerta de atrás.
ALTER TABLE "intelligence_findings"
  DROP CONSTRAINT IF EXISTS "intelligence_findings_status_check";
--> statement-breakpoint

ALTER TABLE "intelligence_findings"
  ADD CONSTRAINT "intelligence_findings_status_check"
  CHECK ("status" IN (
    'open', 'acknowledged', 'in_progress', 'resolved',
    'false_positive', 'accepted_risk'
  ));
--> statement-breakpoint

-- Tablero Kanban: se listan por proyecto y estado, ordenados del más reciente.
CREATE INDEX IF NOT EXISTS "idx_findings_status"
  ON "intelligence_findings" ("project_id", "status", "created_at" DESC);
--> statement-breakpoint

-- Reloj de SLA: la tarea programada busca solo lo vencido y aún abierto.
-- Es un índice PARCIAL a propósito — los hallazgos cerrados no interesan al
-- barrido de escalado y, en una base con millones de filas, filtrarlos aquí
-- evita recorrerlos en cada pasada.
CREATE INDEX IF NOT EXISTS "idx_findings_due"
  ON "intelligence_findings" ("due_at")
  WHERE "due_at" IS NOT NULL
    AND "status" NOT IN ('resolved', 'false_positive', 'accepted_risk');
--> statement-breakpoint

-- Historial. Cada transición escribe una fila: sin este log el tablero muestra
-- el estado actual pero no quién lo movió ni por qué, que es lo que se audita
-- cuando un hallazgo crítico se cerró sin arreglar.
CREATE TABLE IF NOT EXISTS "finding_activity" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "finding_id" UUID NOT NULL REFERENCES "intelligence_findings"("id") ON DELETE CASCADE,
  "from_status" TEXT,
  "to_status" TEXT NOT NULL,
  "actor_id" UUID REFERENCES "users"("id") ON DELETE SET NULL,
  "note" TEXT,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now()
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "idx_finding_activity_finding_created"
  ON "finding_activity" ("finding_id", "created_at" DESC);
--> statement-breakpoint

-- Las políticas de RLS que governaban `intelligence_findings` siguen siendo
-- válidas: las columnas nuevas heredan las del CHECK de la tabla. Lo que sí
-- hace falta es dar a `authenticated` lo mismo sobre la tabla del historial.
-- Sin esto el tablero, que lee vía withRLS(), falla con 42501.
ALTER TABLE "finding_activity" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

-- Los grants son la otra mitad del contrato: sin GRANT SELECT la policy existe
-- pero el rol authenticated ni siquiera llega a evaluarla y Postgres responde
-- 42501 (ver src/shared/db/rls.ts). Mismo patrón que 0023/0032.
GRANT SELECT, INSERT ON "finding_activity" TO authenticated;
--> statement-breakpoint

DROP POLICY IF EXISTS "finding_activity_select_authenticated" ON "finding_activity";
--> statement-breakpoint

CREATE POLICY "finding_activity_select_authenticated"
  ON "finding_activity"
  FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM "intelligence_findings" f
    WHERE f.id = "finding_activity".finding_id
  ));
--> statement-breakpoint

-- El INSERT también pasa por RLS cuando el servidor actúa como `authenticated`.
-- Sin esta política, la escritura del historial revienta con 42501 y toda
-- transición de estado se pierde.
DROP POLICY IF EXISTS "finding_activity_insert_authenticated" ON "finding_activity";
--> statement-breakpoint

CREATE POLICY "finding_activity_insert_authenticated"
  ON "finding_activity"
  FOR INSERT
  TO authenticated
  WITH CHECK (actor_id = public.current_auth_uid() OR actor_id IS NULL);
--> statement-breakpoint

COMMENT ON COLUMN "intelligence_findings"."status" IS
  'Estado del ciclo de vida del hallazgo. Texto (no enum) para poder añadir estados sin migración.';
--> statement-breakpoint
COMMENT ON COLUMN "intelligence_findings"."due_at" IS
  'Vencimiento del SLA. Se calcula al acusar recibo (acknowledged), no al detectar.';
--> statement-breakpoint
COMMENT ON COLUMN "intelligence_findings"."suppressed_until" IS
  'Hasta esta fecha el hallazgo se oculta de los tableros por ruido conocido (falso positivo recurrente).';