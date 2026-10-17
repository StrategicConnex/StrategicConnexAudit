---
title: Criterio de autorización para datos de proyecto (rescinded)
status: SUPERSEDED
superseded-by: ADR-0XX-owner-only-authorization.md
superseded-date: 2026-10-16
reason: "El proyecto es gratuito sin membresías. El criterio canónico de autorización es ahora ownership puro."
---

# ADR-010: Criterio de autorización para datos de proyecto

> ⚠️ **SUPERSEDIDO (2026-10-16):** Este ADR ha sido revocado porque el proyecto es
> gratuito y no utiliza membresías. El criterio canónico de autorización es ahora
> ownership puro (`projects.owner_id`).
> Ver [ADR-0XX-owner-only-authorization.md](ADR-0XX-owner-only-authorization.md) para la decisión vigente.

## Estado

SUPERSEDED (2026-10-16). Ver [ADR-0XX-owner-only-authorization.md](ADR-0XX-owner-only-authorization.md).


## Contexto

> ⚠️ Este ADR fue rescindido. La decisión vigente es ownership puro y la tabla
> `project_members` fue eliminada en la migración 0052.

Las rutas L1/L3 que acceden a datos de proyecto (audits, findings, adversary assessments)
necesitan un criterio de autorización claro y consistente. La auditoría de P0.2 encontró
dos sitios que filtraban por **propiedad** (`eq(projects.ownerId, userId)`) mientras que
las políticas RLS ya aplican **membresía**: un miembro del proyecto quedaba fuera aunque
la base de datos le diera acceso.

## Decisión
(Rescatado históricamente. En la aceptación original, la decisión era usar
**membresía** (`user_has_project_access(project_id)`) en lugar de **propiedad**
(`eq(ownerId, userId)`) como criterio canónico en rutas L1/L3 que acceden a datos de
proyecto. Esa decisión ya no es vigente.)

## Justificación
*(Rescatado históricamente.)*

1. En ese momento el schema tenía `project_members` con roles.
2. La función `user_has_project_access(project_id)` verificaba owner **O** membresía.
3. Era el patrón usado en `intelligence_findings`, `intelligence_assets` y `uptime_logs`.

## Consecuencias
*(Rescatado históricamente. En la práctica actual, las consecuencias son las del ADR
sucesor.)*

## Verificación
*(Rescatado históricamente. Para el estado actual, ver ADR sucesor y migración 0052.)*

## Relacionados
- ADR-006 — RLS con `SET LOCAL ROLE`.
- Plan P0.2 (`docs/superpowers/plans/2026-10-12-P0.2-rls-opcion-b.md`, §4 y §6).
- Migración 0052 — eliminación de `project_members` y simplificación a ownership puro.

> **Nota del implementador (2026-10-16):** el inventario RLS (`scripts/db/rls-inventory.mjs`) reporta aún la
> migración obsoleta de `project_members` como aviso (“migraciones declaran RLS/policies para …,
> ausente del schema de Drizzle”). A corto plazo, convertir ese aviso en un aviso explícito de “schema
> eliminado, migraciones pendientes de recalificación” es preferible a silenciarlo: el aviso sigue
> siendo el canal de datos más fiable para detectar procedimientos almacenados o policies huérfanos que
> aún mencionan la tabla.
