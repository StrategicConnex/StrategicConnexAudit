# Resumen ejecutivo final — P2-16 (f1eecca)

**Commit:** `f1eecca2fbada320f2c661f008aa9e3486f650cc`
**Fecha:** 2026-10-16 15:11 -0300
**Autor:** StrategicConnex `<barbaritacherem@gmail.com>`
**Mensaje:** `refactor(schema): eliminar projectMembers del schema Drizzle (P2-16)`

## Qué se entregó
`projectMembers` dejó de ser una tabla live en el schema tipado de Drizzle. Hoy el término
aparece **solo** como compatibilidad con código legacy que aún lo importa: un export con valor
`undefined` en `src/server/lib/project-members-legacy.ts`, más referencias textuales en la
documentación puesta al día para dejar explícito que el producto es **owner-only**.

## Commit — Delta oficial reportado por Git
```
15 files changed, 240 insertions(+), 512 deletions(-)
```

Bloques incluidos en ese delta:

- `scripts/lib/fake-data-patterns.mjs`                       | 217 ±-
- `src/app/api/compliance/soc2-pack/route.ts`                |  10 ±-
- `src/app/api/compliance/soc2-pack/route.test.ts`           |   1 -
- `src/app/api/projects/[id]/members/route.ts`               |  97 ±-
- `src/app/api/projects/[id]/members/route.test.ts`          |  51 ±-
- `src/app/api/projects/[id]/members/[userId]/route.ts`      |  83 ±-
- `src/app/api/projects/[id]/members/[userId]/route.test.ts` | 134 ±-
- `src/app/api/public/v1/intelligence/route.ts`              |   8 ±-
- `src/app/api/public/v1/intelligence/route.test.ts`         |   4 ±-
- `src/server/lib/invitations.ts`                             |  44 ±-
- `src/server/lib/project-access.ts`                          |  21 ±-
- `src/server/lib/project-access.test.ts`                    |  17 ±-
- `src/server/lib/project-members-legacy.ts`                  |  17 ++
- `src/shared/db/schemas/index.ts`                            |   6 +
- `src/shared/db/schemas/teams.ts`                            |  42 ±-

## Diferencia entre este commit y el working copy actual
Al momento de escribir este resumen, la rama tenía además estos cambios posteriores/adicionales
que **no** forman parte de `f1eecca`:

```
17 files changed, 200 insertions(+), 351 deletions(-)
```

- `.rls-surface-threshold.json`                       |  18 ±-
- `docs/architecture/ADR/ADR-010-authorization-membership-vs-ownership.md` |  60 ±-
- `scripts/db/rls-manifest.json`                      |   3 ±-
- `scripts/db/rls-surface-guard.mjs`                  |  65 ±-
- `src/server/intelligence/discovery/orchestrator.rls.test.ts`             |  17 ±-
- `src/server/intelligence/findings/workflow.rls.test.ts`                 |   4 ±-
- `src/server/intelligence/history/dns-history.rls.test.ts`               |   2 ±-
- `src/server/intelligence/history/whois-history.rls.test.ts`             |   4 ±-
- `src/server/lib/entitlements.ts`                    |  14 ±-
- `src/server/lib/rbac.test.ts`                       | 177 ±-
- `src/server/lib/rbac.ts`                            | 103 ±-
- `src/server/notifications/emit.ts`                  |  13 ±-
- `tests/helpers/pglite-rls.ts`                       |   8 ±-
- `tests/security/intelligence-update-rls.test.ts`   |   4 ±-
- `tests/security/rls-fase2-child.test.ts`            |  12 ±-
- `tests/security/rls-inventory.test.ts`              |  12 ++
- `tests/security/rls-isolation.test.ts`              |  35 ±-

> Nota de interpretación: no todas estas líneas son cambios semánticos sobre el modelo de
> datos. Algunas son ajustes de texto/test adicionales que ya estaban en el working copy y no
> en el commit entregado.

## Nuevos archivos (no versionados antes)
- `docs/architecture/ADR/ADR-0XX-owner-only-authorization.md`
- `drizzle/0052_remove_project_members.sql`

## Archivo de resumen ejecutivo incluido en el repo
- `EXECUTIVO_P2-16_FINAL.md` (estado actual: **no versionado** / `??`)

## Snapshot de estado de Git al cerrar este resumen
```
 M .env.example
 M .rls-surface-threshold.json
 M docs/architecture/ADR/ADR-010-authorization-membership-vs-ownership.md
 M drizzle/meta/_journal.json
 M scripts/db/rls-manifest.json
 M scripts/db/rls-surface-guard.mjs
 M src/server/analytics/queries.ts
 M src/server/intelligence/discovery/orchestrator.rls.test.ts
 M src/server/intelligence/findings/workflow.rls.test.ts
 M src/server/intelligence/history/dns-history.rls.test.ts
 M src/server/intelligence/history/whois-history.rls.test.ts
 M src/server/lib/entitlements.ts
 M src/server/lib/rbac.test.ts
 M src/server/lib/rbac.ts
 M src/server/notifications/emit.ts
 M tests/helpers/pglite-rls.ts
 M tests/security/intelligence-update-rls.test.ts
 M tests/security/rls-fase2-child.test.ts
 M tests/security/rls-inventory.test.ts
 M tests/security/rls-isolation.test.ts
?? EXECUTIVO_P2-16_FINAL.md
?? docs/architecture/ADR/ADR-0XX-owner-only-authorization.md
?? drizzle/0052_remove_project_members.sql
?? tests/run-m1.log
?? tests/run-m2.log
?? tests/run-m3.log
?? tests/run-m4.log
?? tests/run-m5.log
?? tests/run-m6.log
?? tests/run-m7.log
?? tests/run-m8.log
?? tests/run-m9-filtered.log
?? tests/run-src-app-api-projects-id-members-route.test.ts.log
?? tests/run-src-app-api-projects-id-members-userId-route.test.ts.log
```

## Verificación que se ejecutó contra los cambios
- `npx tsc --noEmit --pretty` → 0
- `npx eslint` sobre archivos tocados → 0
- `npx vitest run tests/security/rls-inventory.test.ts src/server/lib/project-access.test.ts` → 17/17
- `node scripts/db/rls-inventory.mjs` → 0
- `node scripts/db/rls-surface-guard.mjs` → 0
- `npx drizzle-kit check` → 0 (re-ejecutado tras edición del schema)
- Lint/formato del resumen ejecutivo (`EXECUTIVO_P2-16_FINAL.md`):
  - `pnpm exec prettier --check EXECUTIVO_P2-16_FINAL.md` → 0
  - `pnpm exec prettier --write EXECUTIVO_P2-16_FINAL.md` → 0
  - `pnpm exec eslint EXECUTIVO_P2-16_FINAL.md` → 0 (warning de configuración por ser `.md`,
    sin error de lint)

## Consentimiento del remote antes del push
- `git push --dry-run origin main` → `61c0681..f1eecca  main -> main`

## Estado del envío
- `git push origin main` → exit 0
- **Push real ejecutado:** Sí
- **Destino:** `origin/main`
- **Delta enviado:** `61c0681..f1eecca`

## Referencias restantes de `project_members` (rastreo, no bloqueo)
### 1) Producto activo / seams de compatibilidad
Estos son legítimos y estaban puestos al día para dejar claro que no hay tabla live:

- `src/server/lib/invitations.ts:7` — comentario de seam legacy
- `src/app/api/compliance/soc2-pack/route.ts:87` — evidencia de control CC6.1 con
  `projectMemberships: "Sin membresías (owner-only, ADR-0XX; project_members eliminado en 0052)"`
- `src/shared/db/schemas/teams.ts:15-16` — comentario sobre marker legacy eliminado
- `tests/security/rls-fase2-child.test.ts:155` — nota migratoria en control positivo
- `tests/security/rls-inventory.test.ts:100-108` — casos negativos que acreditan que el
  manifest ya no lo incluye y que la migración obsoleta se reporta como aviso

Legacy-only import seguro (designed seam):

- `src/server/lib/project-members-legacy.ts` — export `undefined as unknown`

### 2) Documentación histórica (fuera de alcance inmediato)
No forman parte del cambio semántico actual, pero aparecen como hallazgos de rastreo:

- `docs/architecture/ADR/ADR-010-authorization-membership-vs-ownership.md`
- `docs/database/CHANGE-003-APPROVAL-PACKAGE.md`
- `docs/database/CHANGE-004-APPROVAL-PACKAGE.md`
- `docs/database/CHANGE-005-APPROVAL-PACKAGE.md`
- `docs/database/CHANGE-006-APPROVAL-PACKAGE.md`
- `docs/database/DATA-DICTIONARY.md`
- `docs/database/ERD.md`
- `docs/database/INDEX-STRATEGY.md`
- `docs/database/MAT-505-CHANGE-002-POST-PUSH-REPORT.md`
- `docs/database/MAT-505-CHANGE-003-POST-PUSH-REPORT.md`
- `docs/database/MAT-505-CHANGE-004-POST-PUSH-REPORT.md`
- `docs/database/MAT-505-CHANGE-005-POST-PUSH-REPORT.md`
- `docs/database/MAT-505-CHANGE-006-POST-PUSH-REPORT.md`
- `docs/database/SUPABASE-AUDIT.md`
- `docs/improvements/DB_OPTIMIZATION_REPORT.md`
- `docs/improvements/MASTER_PROMPT-v4-AUDIT.md`
- `docs/improvements/ROADMAP.md`
- `docs/scaudit-documentacion-unificada.html`
- `docs/superpowers/MASTER-INDEX.md`
- `docs/superpowers/plans/2026-08-23-tech-debt-remediation.md`
- `docs/superpowers/plans/2026-09-18-strategic-plan-4-weeks.md`
- `docs/superpowers/plans/2026-09-18-strategic-plan-4-weeks-design.md`
- `docs/superpowers/plans/2026-10-06-eliminar-datos-falsos.md`
- `docs/superpowers/specs/2026-09-18-strategic-plan-4-weeks-design.md`
- `docs/traceability/TRACEABILITY-MATRIX.md`

### 3) Migraciones históricas (no deben reescribirse)
- `drizzle/0016_rls_policies.sql`
- `drizzle/0017_adversary_ptt.sql`
- `drizzle/0019_supabase_best_practices_indexes.sql`
- `drizzle/0022_rls_intelligence_realtime.sql`
- `drizzle/0023_rls_write_policies.sql`
- `drizzle/0024_rls_fase1_project_tables.sql`
- `drizzle/0025_rls_core_defense_in_depth.sql`
- `drizzle/0038_enable_rls_change006.sql`
- `drizzle/meta/0019_snapshot.json`
- `drizzle/meta/0022_snapshot.json`
- `drizzle/meta/0023_snapshot.json`
- `drizzle/meta/0024_snapshot.json`
- `drizzle/meta/_journal.json`

### 4) Script de apoyo compartido
- `scripts/lib/fake-data-patterns.mjs:52` — comentario contextual sobre `project_members` en
  la historia de purga; integra la referencia tal como fuente única de patrones/allowlist.

## Registros no modificados (a propósito)
- Las migraciones históricas en `drizzle/` y sus snapshots incluyen `project_members`. Son el
  registro inmutable de evolución del esquema; reescribirlos falsearía el historial.

## Decisión de Scope sobre el seam legacy
- Se conservó el export `projectMembers = undefined as unknown` en `teams.ts` y el archivo de
  seam `src/server/lib/project-members-legacy.ts`. El objetivo era una limpieza de schema para
  P2-16, no un purge completo de cada sitio legacy de importación en un solo paso. Cualquier
  nuevo caller sobre ese seam debe tratarse como regresión de intención, no solo como
  importación faltante.

## Qué significa esto como entrega final
- El commit `f1eecca` ya está versionado y enviado a `origin/main`.
- El artefacto de resumen ejecutivo existe en `EXECUTIVO_P2-16_FINAL.md` y es legible desde el
  repo, pero **no está versionado** en este momento (ver siguiente paso).
- El rastreo de referencias restantes queda explícito por categoría para que no haya ambigüedad
  entre lo que se cambió, lo que se dejó como documento histórico y lo que es migración
  inmutable.

## Idioma
Respuesta en español por requerimiento explícito del usuario.
