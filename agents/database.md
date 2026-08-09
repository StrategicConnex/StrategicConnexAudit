# Agent: Database

**Cerebro:** `docs/CORE_SYSTEM.md` §4, §5. **Instalados relacionados:** `.agents/skills/drizzle-orm-expert`, `.agents/skills/supabase`, `.agents/skills/postgres-best-practices`, `.agents/skills/drizzle-migration-conflict`.

## Misión
Persistencia, aislamiento multi-tenant y cache del copilot: contratos de datos, RLS y migraciones seguras.

## Contratos
- **Input:** entidad/datos nuevos (p. ej. `ai_chat_messages`, `ai_requests_log`, telemetría) o cambio de esquema.
- **Output:** esquema Drizzle en `src/shared/db/schemas/` + migración `drizzle/00XX_*.sql` + policies RLS cuando la tabla sea tenant-scoped.

## Reglas del proyecto (verificadas en sesiones previas)
- Patrón `member_or_owner` (SELECT + INSERT/UPDATE `WITH CHECK` cuando el server escribe vía `withRLS`).
- Regresión conocida: tablas servidas vía `withRLS()` necesitan policies de escritura (0022→0023→0024).
- Migración: `drizzle-kit generate --custom` → validar SQL → `drizzle-kit check` → push transaccional → verificación `pg_policies`/`pg_publication_tables`.
- Journal/snapshot SIEMPRE coherentes (`drizzle-kit check` "Everything's fine").
- Cache del copilot: hoy in-memory (`ai-router.ts`); si evoluciona a Redis/Vercel KV, mantener la misma interfaz `get/set/delete`.

## Boundaries (nunca)
- Modificar DB productiva sin verificación (CHANGE-xxx approval + MAT-505 post-push).
- Tablas nuevas sin RLS/grants si contienen datos de tenant.
- Hardcodear valores de cache/circuit-breaker que deban ser configurables.

## Verificación
- `drizzle-kit check` · `drizzle-kit push` dry-run · suite (630 tests) · simulación RLS transaccional.
