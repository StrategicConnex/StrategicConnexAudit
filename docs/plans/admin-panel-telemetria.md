# Plan — Panel de Administración + Telemetría de Acceso

**Fecha**: 2026-08-25 · **Rama**: `feat/admin-panel` · **Estado**: en ejecución

## Decisiones de diseño (adaptadas al codebase real)

1. **Admin gate en dos capas**: email `palacios_juan@hotmail.com` (constante `ADMIN_EMAIL`,
   ya presente en `EMAIL_ALLOWLIST` de ratelimit.ts) **+** rol `admin` de `users.role`
   (sistema existente: `requireAdmin`). Capa 1 en proxy.ts (redirect), capa 2 en la page.
2. **Telemetría**: el proxy de Next 16 (`src/proxy.ts` → `updateSession`) ya llama
   `getUser()` en cada request. Ahí se hace fire-and-forget a un Route Handler interno
   (`/api/internal/track-access`, runtime Node) que hace upsert en `user_logs` con
   `directDb`. Throttle por cookie (`sl_track`, 5 min) para no duplicar carga.
   IP: `x-forwarded-for`/`x-real-ip`. País: `x-vercel-ip-country` (sin APIs externas).
3. **Soft delete**: `projects.deleted_at` ya existe y se usa. Se añaden `is_deleted`
   (default false, NOT NULL) e `is_hidden` (default false, NOT NULL). `deleted_at`
   se conserva. La app filtra `is_deleted = false AND is_hidden = false`; el admin
   ve todo con filtros y acciones (ocultar/restaurar/eliminar).
4. **Login**: la app usa magic link. Se añade pestaña "Contraseña" en `/login` con
   `signInWithPassword` (sin hardcodear credenciales; el gate valida email+rol de la
   sesión activa).

## Tareas

- [x] 1. SQL: `user_logs` + `is_deleted`/`is_hidden` + RLS + backfill — **aplicado a prod y verificado**
       (cols ✅ · política `admin_read_user_logs` ✅ · 17 filas backfill ✅ · 0 soft-deletes sin marcar ✅ · índices ✅)
- [x] 2. Drizzle: schemas `userLogs` + `projects.isDeleted/isHidden`
- [x] 3. Telemetría: proxy → `/api/internal/track-access` (upsert user_logs) — verificado: 401 anónimo, upsert por `user_id`
- [x] 4. Gate `/admin` en proxy + pestaña contraseña en /login — gate en `updateSession`; bypass dev explica 200 anónimo local; page re-valida con `requireAdmin`
- [x] 5. `/admin`: usuarios + proyectos + eliminados/ocultos + acciones soft-delete
- [x] 6. Filtrar `is_deleted`/`is_hidden` en dashboard, intelligence, cron/uptime, discovery,
       looker-studio, telemetry/vitals y los 4 triggers — verificado por grep (31 matches)
- [x] 7. Validación: tsc ✅ · vitest ✅ (72 files / 653 tests) · /login ✅ (sin error intl, tab password) ·
       SQL prod aplicado y verificado ✅ · commit/push ✅

### Nota de sesión 2026-08-25 (PM)
- Error `NextIntlClientProvider was not found` en dev-audit.log era residual: `/login` responde 200 sin el error.
- Turbopack servía 404 para TODAS las rutas `/api/*` por caché `.next` corrupta → fix: borrar `.next` y reiniciar.
  Si vuelve a pasar: `Remove-Item -Recurse -Force .next && npm run dev`.

## RLS (resumen)

- `user_logs`: ENABLE RLS. SELECT solo para `authenticated` cuyo `users.email = ADMIN_EMAIL`
  (subquery por `auth.uid()`; nunca `user_metadata`). INSERT/UPDATE solo vía service_role
  (el endpoint interno usa `directDb` = conexión de servicio, bypassa RLS).
- `projects`: las políticas existentes se mantienen; el admin lee todo vía conexión de
  servicio en las server actions del panel (no se exponen borrados al cliente).

## Entregables

1. `drizzle/2026-08-25_admin_telemetry.sql` (estructura + enum + políticas)
2. `src/proxy.ts` + `/api/internal/track-access/route.ts` (telemetría + redirect)
3. `src/app/admin/page.tsx` + `actions.ts` + componentes cliente
4. Filtros de visibilidad en queries de la app
