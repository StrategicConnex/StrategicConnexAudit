-- 0042 — REVOKE TRUNCATE de los roles expuestos (authenticated, anon).
--
-- Hallazgo #6 de la auditoría de base de datos (2026-10-11):
-- `TRUNCATE` estaba concedido a `authenticated` en 33 tablas de `public`
-- (projects, users, audits, subscriptions, audits, ...). **TRUNCATE no está
-- sujeto a RLS**: un usuario autenticado comprometido (o cualquier bug que
-- ejecutase SQL con ese rol vía PostgREST) podía vaciar tablas de TODOS los
-- tenants sin pasar por ninguna policy.
--
-- No hay ningún `GRANT TRUNCATE` explícito en el historial: el privilegio está
-- en `information_schema.role_table_grants` (33 tablas) pero no procede de
-- ninguna migración del repo. Se verificó con `scripts/db/grant-audit.mjs` que
-- los *default privileges* de `public` NO conceden TRUNCATE a esos roles, así
-- que el origen es un grant puntual heredado. Aun así se revoca también la
-- default para que las tablas futuras no puedan volver a heredarlo.
--
-- El rol de la aplicación (`postgres`) conserva TRUNCATE; sólo se retira de los
-- roles que expone PostgREST. Es un cambio puramente restrictivo.

REVOKE TRUNCATE ON ALL TABLES IN SCHEMA public FROM authenticated;
--> statement-breakpoint
REVOKE TRUNCATE ON ALL TABLES IN SCHEMA public FROM anon;
--> statement-breakpoint
-- Defensivo: hoy la default no lo concede (verificado 2026-10-11), pero si
-- Supabase u otra migración la cambiase, las tablas nuevas lo heredarían.
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE TRUNCATE ON TABLES FROM authenticated;
--> statement-breakpoint
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE TRUNCATE ON TABLES FROM anon;
