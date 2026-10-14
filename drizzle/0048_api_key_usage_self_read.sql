-- 0048 — Policy de lectura propia en `security_audit_logs` (uso de API keys).
--
-- CONTEXTO (Oleada 3 · P0.2 + ADR-010): `GET /api/api-keys/[id]/usage` reporta
-- el uso de una API key del propio usuario. Ese uso vive en
-- `security_audit_logs` (eventos `event_type = 'api_key_usage'`, con
-- `user_id` = dueño de la key, escrito por `public-router.ts`). Al migrar la
-- ruta a `withRLS(user.id, tx)`, la única policy que existía era
-- `security_audit_logs_admin` (`current_user_is_platform_admin()`), de modo que
-- un usuario normal veía 0 filas y el endpoint habría reportado 0 requests.
--
-- DECISIÓN (operador, 2026-10-13): añadir una policy de SELECT **delimitada**
-- que deja a cada usuario leer SOLO sus propias filas de uso de API key, y
-- migrar la ruta a `withRLS`. Es consistente con ADR-010 (el usuario accede a
-- sus propios datos) y con `developer_api_keys_select_own` (misma función).
-- Alcance mínimo: `event_type = 'api_key_usage'` — NO se exponen los demás
-- eventos de seguridad del usuario (rate-limit, CSP, auth) por esta vía.
--
-- Las policies se combinan con OR: admins siguen viendo todo (policy admin),
-- cada usuario ve sus filas de uso. Idempotente (DROP IF EXISTS).

DROP POLICY IF EXISTS security_audit_logs_self_api_key_usage ON public.security_audit_logs;
CREATE POLICY security_audit_logs_self_api_key_usage
  ON public.security_audit_logs
  FOR SELECT
  TO authenticated
  USING (
    event_type = 'api_key_usage'
    AND user_id = public.current_auth_uid()
  );
