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
| `check:cascade-drop` | exit 0 (y exit 1 en el escenario pre-0052 simulado) |
| `index-guard` | exit 0 contra la BD real (tras el fix de índices obsoletos) |
| `vitest run tests/` (tras el guard) | **251/251**, 22 archivos, exit 0 |

Punto de partida: 10 fallos de suite (`relation "project_members" does not exist`) más 12 en
los `*.rls.test.ts` de `src/` que nunca llegaban a ejecutarse por el mismo motivo.

`tests/security/rls-owner-only-migration.test.ts` es el test que faltaba: aplica las policies
**viejas reales** (con la tabla de membresías presente), encima la 0052 completa, y comprueba
que no se pierde ninguna policy, que el dueño ve sus filas, que un tercero ve 0 y que el guard
aborta cuando se le cuela una policy huérfana.

## Guard `DROP TABLE … CASCADE` (2026-10-17)

El hallazgo no era un caso aislado sino una clase: cualquier `DROP TABLE … CASCADE` borra en
silencio las policies de **otras** tablas que la subconsultan. La 0052 se salvaba por un guard
`DO $$` escrito a mano para ella; nada impedía repetir el patrón.

[check-cascade-drop.mjs](scripts/db/check-cascade-drop.mjs) reaplica el estado vivo de las
migraciones en **orden de journal** (no alfabético) y, en cada DROP CASCADE, comprueba policies
vivas, funciones (`SECURITY DEFINER`) y SQL dinámico (`EXECUTE format`) que seguirían leyendo la
tabla. Las policies recreadas antes del DROP —el patrón de la 0052— no cuentan: se modelan
`CREATE POLICY`, `ALTER POLICY`, `DROP POLICY` y `CREATE [OR REPLACE] FUNCTION`.

| Exit | Significado |
|---|---|
| 0 | ningún DROP CASCADE deja dependencias vivas |
| 1 | al menos una policy/función quedaría rota (lista migración, objeto y arreglo) |
| 2 | no se pudo analizar (migraciones ilegibles) o `--db` sin DSN |

Integrado en CI (`db-drift-check`, estático, corre siempre) y en `package.json`:

- `pnpm check:cascade-drop` — gate estático.
- `pnpm check:cascade-drop:db` — además verifica el estado REAL con `DIRECT_URL`/`DATABASE_URL`
  (policies y funciones que aún referencian la tabla, y si la tabla sigue existiendo).

[tests/security/cascade-drop-guard.test.ts](tests/security/cascade-drop-guard.test.ts) (16 casos)
incluye el control sobre **datos reales**: todas las migraciones hasta 0051 más un DROP CASCADE
sin recrear policies → detecta **las 21 policies** que el bug real habría borrado. Los tres
últimos casos ejecutan el **CLI real** (`--migrations-dir`) y fijan el contrato que consume CI:
exit 1 con el hallazgo, exit 0 con el patrón seguro y exit 2 si no puede analizar.

### Defecto colateral que apareció al aplicarla

`index-guard` fallaba contra la BD: `idx_project_members_user` (0016/0019) ya no existe porque la
tabla desapareció, y el guard lo contaba como regresión permanente. [index-patterns.mjs](scripts/db/index-patterns.mjs)
ahora descarta los índices cuya tabla una migración **posterior** elimina, y sigue exigiendo un
índice declarado después del DROP (eso sí sería DDL roto).

## Aplicación en la BD real (2026-10-17)

Aplicada contra la única BD configurada en `.env.local` (proyecto Supabase, pooler
`aws-1-sa-east-1`), dentro de **una transacción** con `lock_timeout=15s` y verificación previa al
`COMMIT`: si cualquier aserción fallaba, `ROLLBACK` (las migraciones son idempotentes, así que
no hubo estado intermedio).

| Verificación | Antes | Después |
|---|---|---|
| `project_members` existe | sí (0 filas) | **no** |
| policies que referencian `project_members` | 21 | **0** |
| índices `%project_members%` | ≥1 (`idx_project_members_user` + PK) | **0** |
| policies totales en `public` | 99 | 98 (se va la de la propia tabla) |
| policies del resto de tablas | 98 con la tabla aún presente | **ninguna perdida**; 69 predicados owner-only |
| filas de `projects` | 9 | 9 |
| `user_has_project_access()` | owner **o** miembro | owner → `true`; tercero → `false` |
| ledger `drizzle.__drizzle_migrations` | — | fila de 0052 (`when` del journal + sha256) |

Las 8 tablas que quedan con RLS y 0 policies (`app_logs`, `distributed_cache`, `scan_queue`,
`idempotency_keys`, `rate_limit_windows`, `exec_briefs`, `scan_queue_slots`, `ai_eval_results`)
son `failClosed` deliberadas del manifest: ya estaban así antes y la migración no las tocó.

## Deuda residual declarada

- La suite completa (`vitest run`, sin ruta) incluye archivos lentos que exceden los 10 min del
  entorno local; se verificó por conjuntos: `tests/` completo y todos los `*.rls.test.ts`.
- Las mutaciones de membresía (`addMember`, `updateMemberRole`, `removeProjectMember`) quedan
  como stubs legacy que responden `member-not-found`; el ADR-0XX deja escrito que la
  colaboración real se diseñará desde cero.
