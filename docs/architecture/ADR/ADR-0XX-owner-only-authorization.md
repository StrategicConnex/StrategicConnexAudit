---
title: Autorización basada en ownership puro
status: ACEPTADO
date: 2026-10-16
related-to: ADR-010
replaces: ADR-010
---

# ADR-0XX: Autorización basada en ownership puro

## Estado

ACEPTADO (2026-10-16)

## Contexto

El proyecto StrategicAudit Pro es gratuito y no utiliza sistema de membresías ni roles.
La tabla `project_members` existía como modelo huérfano pero nunca se pobló ni se
implementó su flujo de gestión.

Cuando P2-16 decidió eliminar `project_members`, el criterio de autorización más simple,
correcto y mantenible era la propiedad pura: cada recurso de proyecto pertenece a un único
propietario (`projects.owner_id`), y el acceso debe verificarse contra ese campo.

## Decisión

Eliminar `project_members` y simplificar toda la autorización a verificación de ownership
puro:

- `user_has_project_access(project_id)` devuelve `true` solo si
  `projects.owner_id = current_auth_uid()`.
- Las políticas RLS y el código de ruta usan `projects.owner_id` como criterio canónico.
- Si en el futuro se necesita membresía real, se diseñará desde cero con un ADR nuevo;
  no se reconstruye nada sobre un modelo abandonado.

## Consecuencias

- Positivas:
  - Menos código, menos mock en tests, menosestado huérfano.
  - La regla de acceso es única y fácil de auditar.
- Negativas:
  - No hay forma de otorgar acceso temporal o compartido sin reabrir el tema en un ADR nuevo.
- Operativas:
  - Migración 0052 elimina la tabla `project_members`.
  - `user_has_project_access` queda redefinida en SQL para verificar solo ownership.
  - Se actualizan los tests que mockeaban membresía.

## Migración

1. `drizzle/0052_remove_project_members.sql`:
   - Reemplaza `user_has_project_access` por versión owner-only.
   - **Reescribe las 21 policies de 0016/0017/0022/0023/0024 que hacían subquery
     contra `project_members`** (mismo nombre y comando, predicado owner-only).
     Sin esto, `DROP TABLE ... CASCADE` las habría borrado en silencio dejando sus
     tablas fail-closed: RLS activa, ninguna policy, y los roles con BYPASSRLS
     como únicos capaces de leer.
   - Guard `DO $$` que aborta la migración si queda alguna policy referenciando
     `project_members`, con el listado de lo que falta reescribir.
   - Elimina `project_members` (`DROP TABLE ... CASCADE`).
2. Schema Drizzle:
   - Elimina `projectMembers` de los archivos del schema.
   - Documenta que `project_members` fue eliminado en 0052.
3. `src/`:
   - Quita referencias a `project_members` / `projectMembers`.
   - Ajusta tests que mockeen membresía.

## Verificación

1. `pnpm typecheck` → exit 0
2. `pnpm lint` → exit 0
3. `node scripts/db/rls-inventory.mjs` → exit 0
4. `node scripts/db/rls-surface-guard.mjs` → exit 0
5. `vitest run tests/` y los `*.rls.test.ts` de `src/` → todas verdes
   (`tests/security/rls-owner-only-migration.test.ts` aplica la 0052 entera sobre
   las policies viejas y comprueba que ninguna tabla queda fail-closed).
6. Aplicar migración contra BD real y verificar:
   - `SELECT * FROM project_members` → ERROR (tabla no existe)
   - `SELECT user_has_project_access('<project-id>')` → funciona
   - `SELECT count(*) FROM pg_policies WHERE qual LIKE '%project_members%'` → 0

   **Aplicada el 2026-10-17** en la BD de Supabase, en una transacción con verificación
   previa al `COMMIT`: `pg_tables`/`pg_indexes`/`pg_policies` con `project_members` → 0,
   ídem para índices, 99 → 98 policies (la única perdida es la de la propia tabla),
   `projects` intacta y `user_has_project_access` → `true` para el dueño, `false` para un
   tercero. El gate que impide repetir el patrón es `pnpm check:cascade-drop`.

## Relacionados

- ADR-010 (SUPERSEDED): Criterio de autorización para datos de proyecto (membresía vs propiedad).
- Migración 0052 — eliminación de `project_members` y simplificación a ownership puro.
