# ADR-010: Criterio de autorización para datos de proyecto

## Estado
ACEPTADO (2026-10-13)

## Contexto
Las rutas L1/L3 que acceden a datos de proyecto (audits, findings, adversary assessments)
necesitan un criterio de autorización claro y consistente. La auditoría de P0.2 encontró
dos sitios que filtraban por **propiedad** (`eq(projects.ownerId, userId)`) mientras que
las políticas RLS ya aplican **membresía**: un miembro del proyecto quedaba fuera aunque
la base de datos le diera acceso.

## Decisión
Usar **membresía** (`user_has_project_access(project_id)`) en lugar de **propiedad**
(`eq(ownerId, userId)`) como criterio canónico en las rutas L1/L3 que acceden a datos de
proyecto.

## Justificación
1. El schema ya tiene `project_members` con roles (owner, admin, editor, viewer, guest).
2. La función `user_has_project_access(project_id)` ya existe y verifica owner **O** membresía.
3. Es el patrón ya usado en `intelligence_findings`, `intelligence_assets` y `uptime_logs`.
4. Restringir a solo owner rompería la colaboración en equipo y contradiría las políticas
   RLS, creando una divergencia silenciosa entre la app y la base de datos.

## Consecuencias
- Todas las rutas L1/L3 deben usar `user_has_project_access(project_id)` dentro de `withRLS`.
- Las políticas RLS de tablas hijas (audits, findings, etc.) deben usar
  `user_has_project_access`.
- El owner tiene acceso implícito: `user_has_project_access` verifica owner **O** membresía.
- Migrar un sitio de propiedad a membresía es un **cambio de comportamiento** (amplía el
  acceso a miembros legítimos) y debe anotarse por lote, nunca descubrirse.

## Verificación
- `user_has_project_access` verifica owner vía OR (existencia en `project_members` o
  igualdad de `ownerId` según la implementación vigente).
- El patrón es consistente con el usado en `intelligence_findings`, `intelligence_assets`
  y `uptime_logs`.
- Referencia de implementación RLS: ADR-006 (`SET LOCAL ROLE`).

## Relacionados
- ADR-006 — RLS con `SET LOCAL ROLE`.
- Plan P0.2 (`docs/superpowers/plans/2026-10-12-P0.2-rls-opcion-b.md`, §4 y §6).
