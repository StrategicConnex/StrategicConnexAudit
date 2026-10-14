-- 0047 — GRANT SELECT para `security_audit_logs` y `siem_alert_logs`
-- (readiness de soc2-pack tras la migración a withRLS de P0.2).
--
-- CONTEXTO (hallazgo 2026-10-13): `src/app/api/compliance/soc2-pack/route.ts`
-- se migró a `withRLS(user.id, tx)` (commit bf3203d) y lee estas dos tablas
-- dentro de la transacción RLS. Pero 0027 las dejó **sin grants a
-- `authenticated`** a propósito («Logs/admin → solo platform admin: sin grants;
-- el service role de directDb no se ve afectado»). Al pasar la lectura por
-- `withRLS` la sesión es `authenticated`, así que sin grant cada lectura falla
-- cerrada con 42501 → el paquete SOC 2 devolvería 500. Verificado contra la
-- base real (2026-10-13): `information_schema.role_table_grants` no listaba
-- ningún grant de `authenticated`/`anon` sobre estas dos tablas.
--
-- QUÉ HACE Y QUÉ NO: solo añade `GRANT SELECT`. **No** crea policies nuevas: la
-- restricción de filas ya la da la policy existente de 0027
-- (`security_audit_logs_admin` / `siem_alert_logs_admin`,
-- `FOR ALL TO authenticated USING (public.current_user_is_platform_admin())`),
-- que es la semántica correcta para estos logs de plataforma. Como soc2-pack ya
-- exige rol admin de plataforma, el grant habilita la lectura y la policy la
-- acota a admins: un usuario normal sigue viendo 0 filas.
--
-- NOTA: una policy `USING (public.user_has_project_access(project_id))` —como
-- proponía el lote— es **inválida**: ninguna de estas tablas tiene columna
-- `project_id` (son logs de plataforma con `ip`/`user_id`/`target`, sin scope de
-- proyecto). No se añade.
--
-- Idempotente: `GRANT` lo es por naturaleza.

GRANT SELECT ON public.security_audit_logs TO authenticated;
GRANT SELECT ON public.siem_alert_logs TO authenticated;
