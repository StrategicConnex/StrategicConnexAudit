-- ── Bandeja de notificaciones por usuario (Tanda 2 / B3) ─────────────────────
--
-- Hasta ahora la app avisaba por push (push_subscriptions) pero no guardaba
-- nada: si el usuario no tenía el navegador abierto, el aviso se perdía. Esta
-- tabla es el registro persistente — lo que el usuario ve en la campana al
-- volver, con leído/no leído.
--
-- Multi-tenant: cada fila pertenece a UN usuario y, opcionalmente, a un
-- proyecto (para poder enlazar al hallazgo o al informe que la motivó). La RLS
-- es la más estricta del esquema: `user_id = current_auth_uid()` y nada más —
-- un usuario jamás ve notificaciones de otro, ni siquiera de sus proyectos.
--
-- Retención: la tarea `notifications-maintenance` purga a los 90 días (el
-- histórico largo ya vive en los hallazgos y los audit logs; la bandeja es
-- para lo reciente).
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "notifications" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" UUID NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "project_id" UUID REFERENCES "projects"("id") ON DELETE CASCADE,
  "kind" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "link" TEXT,
  "metadata" JSONB NOT NULL DEFAULT '{}',
  "read_at" TIMESTAMPTZ,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now()
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "idx_notifications_user_created"
  ON "notifications" ("user_id", "created_at" DESC);
--> statement-breakpoint

-- Índice PARCIAL del contador de la campana: el badge solo cuenta las no
-- leídas, y en una bandeja con miles de filas leídas filtrarlas aquí evita
-- recorrerlas en cada carga.
CREATE INDEX IF NOT EXISTS "idx_notifications_user_unread"
  ON "notifications" ("user_id", "created_at" DESC)
  WHERE "read_at" IS NULL;
--> statement-breakpoint

ALTER TABLE "notifications" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

-- Grants sin los que el rol authenticated falla con 42501 antes de evaluar la
-- policy (mismo patrón que 0022/0023/0032). INSERT no se concede: solo el
-- servicio (directDb) crea notificaciones.
GRANT SELECT, UPDATE ON "notifications" TO authenticated;
--> statement-breakpoint

DROP POLICY IF EXISTS "notifications_owner_select" ON "notifications";
--> statement-breakpoint

CREATE POLICY "notifications_owner_select"
  ON "notifications"
  FOR SELECT
  TO authenticated
  USING (user_id = public.current_auth_uid());
--> statement-breakpoint

DROP POLICY IF EXISTS "notifications_owner_update" ON "notifications";
--> statement-breakpoint

CREATE POLICY "notifications_owner_update"
  ON "notifications"
  FOR UPDATE
  TO authenticated
  USING (user_id = public.current_auth_uid())
  WITH CHECK (user_id = public.current_auth_uid());
--> statement-breakpoint

COMMENT ON TABLE "notifications" IS
  'Bandeja por usuario. La RLS es estricta por user_id: nunca se cruzan usuarios.';
--> statement-breakpoint
COMMENT ON COLUMN "notifications"."read_at" IS
  'Null = no leída. El índice parcial idx_notifications_user_unread sirve el badge.';
