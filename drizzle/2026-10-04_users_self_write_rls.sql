-- ── users: permiso de escritura sobre la PROPIA fila ────────────────────────
--
-- Contexto: `withRLS()` (src/shared/db/rls.ts) abre una transacción y hace
-- `SET LOCAL ROLE authenticated` para que las políticas RLS apliquen de verdad.
-- Como `authenticated` no es el dueño de la tabla y `FORCE ROW LEVEL SECURITY`
-- está apagado, el cambio de rol SÍ activa RLS.
--
-- `users` solo declaraba `users_select_self` (SELECT). Eso hacía que el sync de
-- perfil —`INSERT ... ON CONFLICT DO UPDATE` sobre la fila del propio usuario—
-- fallara con 42501 (insufficient_privilege). Al abortarse la transacción, la
-- creación de proyecto caía en cascada con 25P02
-- (in_failed_sql_transaction) y el usuario se quedaba sin poder crear su primer
-- proyecto desde la UI.
--
-- Dos piezas, porque la política sola no basta:
--
--   1. Políticas INSERT/UPDATE limitadas a la propia fila (id = sub del JWT).
--      No hay política de DELETE: borrar la cuenta sigue siendo de servidor.
--
--   2. Un trigger que congela `role` mientras se actúa como `authenticated`.
--      Sin él, el permiso de escritura sobre la fila propia permitiría
--      auto-ascensión de privilegios (`UPDATE users SET role='admin'` vía
--      PostgREST con el JWT del propio usuario). El guard se limita al rol no
--      privilegiado: el servidor conecta como `postgres` y sigue gestionando
--      roles con normalidad.
---> statement-breakpoint

DROP POLICY IF EXISTS "users_insert_self" ON "users";
---> statement-breakpoint
DROP POLICY IF EXISTS "users_update_self" ON "users";
---> statement-breakpoint

-- Alta del perfil: solo la propia fila.
CREATE POLICY "users_insert_self"
  ON "users"
  FOR INSERT
  TO authenticated
  WITH CHECK (id = public.current_auth_uid());
---> statement-breakpoint

-- Actualización del perfil: la fila debe ser propia tanto antes (USING) como
-- después (WITH CHECK) del UPDATE, para impedir que un usuario se reescriba el
-- `id` y quede fuera del alcance de la propia política.
CREATE POLICY "users_update_self"
  ON "users"
  FOR UPDATE
  TO authenticated
  USING (id = public.current_auth_uid())
  WITH CHECK (id = public.current_auth_uid());
---> statement-breakpoint

-- Guard de privilegio: desde el rol `authenticated`, `role` no es escribible.
-- En INSERT se fuerza el default de la tabla ('client'); en UPDATE se conserva
-- el valor previo. Para cualquier otro rol (servidor, migraciones, drizzle-kit)
-- la función no interviene, así que la gestión de roles desde el backoffice
-- sigue funcionando sin cambios.
CREATE OR REPLACE FUNCTION public.users_freeze_role_for_authenticated()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF current_user = 'authenticated' THEN
    IF TG_OP = 'INSERT' THEN
      NEW.role := 'client';
    ELSE
      NEW.role := OLD.role;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
---> statement-breakpoint

DROP TRIGGER IF EXISTS users_freeze_role_for_authenticated ON "users";
---> statement-breakpoint
CREATE TRIGGER users_freeze_role_for_authenticated
  BEFORE INSERT OR UPDATE ON "users"
  FOR EACH ROW
  EXECUTE FUNCTION public.users_freeze_role_for_authenticated();
