# Cierre de P2-16 — eliminación de `project_members` (owner-only)

**Fecha:** 2026-10-17
**Alcance:** cerrar la deuda de P2-16 (`f1eecca`) que dejaba la suite en rojo y, sobre
todo, la migración 0052 incompleta.

## El hallazgo que cambió el ticket

El ticket original pedía «commitear 0052 y arreglar los tests». Al revisar la migración
apareció un problema mayor que los tests: **21 policies de 0016/0017/0022/0023/0024 hacen
subquery contra `project_members`**. `DROP TABLE … CASCADE` las borra junto con la tabla, y
esas tablas quedan con RLS activa **sin ninguna policy**: fail-closed. Es decir, no un error
visible, sino «0 filas» para todo el mundo excepto los roles con `BYPASSRLS` (`directDb`).

La migración ahora hace, en este orden:

1. `CREATE OR REPLACE FUNCTION user_has_project_access` → owner-only.
2. Recrea las 21 policies con **el mismo nombre y comando** y predicado owner-only
   (`user_has_project_access(...)`, o `EXISTS` hacia el padre en las hijas sin `project_id`).
3. Un guard `DO $$` que **aborta la migración** si queda alguna policy referenciando
   `project_members`, listando lo que falta reescribir.
4. `DROP TABLE public.project_members CASCADE`.

## Evidencia

| Gate | Resultado |
|---|---|
| `vitest run tests/` + tests RLS/rbac/members de `src/` | **279/279**, 28 archivos, exit 0 |
| `tsc --noEmit` | exit 0 |
| `eslint` (archivos tocados) | exit 0, sin errores |
| `next build` | exit 0 |
| `rls-surface-guard` | exit 0 — 191/191 `directDb`, 272/272 total (mejora: −3) |
| `rls-inventory` | exit 0 (manifest sin `project_members`) |

Punto de partida: 10 fallos de suite (`relation "project_members" does not exist`) más 12 en
los `*.rls.test.ts` de `src/` que nunca llegaban a ejecutarse por el mismo motivo.

`tests/security/rls-owner-only-migration.test.ts` es el test que faltaba: aplica las policies
**viejas reales** (con la tabla de membresías presente), encima la 0052 completa, y comprueba
que no se pierde ninguna policy, que el dueño ve sus filas, que un tercero ve 0 y que el guard
aborta cuando se le cuela una policy huérfana.

## Deuda residual declarada

- **No se aplicó la migración contra la BD real**: la verificación es en PGlite + los gates de
  repo. Antes de desplegar, correr `SELECT count(*) FROM pg_policies WHERE qual LIKE '%project_members%'`
  → debe dar 0.
- La suite completa (`vitest run`, sin ruta) incluye archivos lentos que exceden los 10 min del
  entorno local; se verificó por conjuntos: `tests/` completo y todos los `*.rls.test.ts`.
- Las mutaciones de membresía (`addMember`, `updateMemberRole`, `removeProjectMember`) quedan
  como stubs legacy que responden `member-not-found`; el ADR-0XX deja escrito que la
  colaboración real se diseñará desde cero.
