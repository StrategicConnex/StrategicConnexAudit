/**
 * tests/integration/setup.ts — Arnés REAL para la suite de integración (TD-29).
 *
 * Historia: hasta 2026-11-01 este setup era un placeholder (seed/cleanup no-op,
 * helper `directDbIntegration` que devolvía null) y los tests fallaban en CI
 * con errores de JavaScript (exports inexistentes, ids falsos sin FK,
 * `.rowCount` de drivers), no con errores de SQL. TD-19 ya dejó la base lista:
 *   1. `pnpm db:prepare-test` (scripts/db/prepare-test.mjs) crea los stubs de
 *      Supabase — roles anon/authenticated/service_role, auth.uid(), publicación
 *      supabase_realtime — que las migraciones 0016+ dan por hechos.
 *   2. `pnpm db:migrate` aplica el esquema completo (67 migraciones).
 * TD-29 dota aquí la infraestructura que los tests esperaban.
 *
 * Exportaciones consumidas por los tests de esta carpeta:
 *   - setupIntegrationDb()        → verificación de conexión (fail-closed)
 *   - seedIntegrationFixtures()   → users + proyecto fixture con ids reales
 *   - cleanupIntegrationFixtures()→ borra toda la huella del run (cascade)
 *   - withRLSIntegration(uid, cb) → alias de src/shared/db/rls.ts `withRLS`
 *   - directDb                     → pool real (rol con BYPASSRLS, como en prod)
 *   - eq, sql                      → re-export de drizzle-orm
 */

import { randomUUID } from 'crypto';
import { sql, inArray } from 'drizzle-orm';
import { directDb } from '@/shared/db';
import { users, projects } from '@/shared/db/schemas';
import { withRLS } from '@/shared/db/rls';

// Re-exports que los tests esperaban de este módulo y no existían.
export { directDb } from '@/shared/db';
export { withRLS as withRLSIntegration } from '@/shared/db/rls';
export { eq, sql } from 'drizzle-orm';

/** Fixtures compartidos por toda la suite del proceso de test. */
export interface IntegrationFixtures {
  userAId: string;
  userBId: string;
  /** Proyecto único propiedad de userA; usado como ancla por todos los tests. */
  userAProjectId: string;
}

let fixtures: IntegrationFixtures | null = null;

/**
 * Verifica la conectividad contra Postgres real (DATABASE_URL del job `integration`
 * o de un Postgres local: los dos definen la misma variable).
 * Fail-closed: si no hay BD, el suite entero detiene antes de ejecutar tests.
 */
export async function setupIntegrationDb(): Promise<void> {
  try {
    await directDb.select({ count: sql<number>`count(*)` }).from(users);
  } catch (error) {
    throw new Error(
      `No se pudo conectar a Postgres para integración (¿DATABASE_URL/DIRECT_URL?): ${String(
        error instanceof Error ? error.message : error,
      )}`,
    );
  }
}

/**
 * Crea los fixtures del run (idempotente): dos usuarios reales y un proyecto
 * real propiedad de userA. Los tests adicionales insertan SUS filas sobre
 * estos ids (nunca ids "user-a-id" literal, que violan la FK a users).
 */
export async function seedIntegrationFixtures(): Promise<IntegrationFixtures> {
  if (!fixtures) {
    fixtures = {
      userAId: randomUUID(),
      userBId: randomUUID(),
      userAProjectId: randomUUID(),
    };
  }
  await directDb
    .insert(users)
    .values([
      {
        id: fixtures.userAId,
        email: `td29-a-${fixtures.userAId}@team.test`,
        fullName: 'TD-29 Fixture A',
      },
      {
        id: fixtures.userBId,
        email: `td29-b-${fixtures.userBId}@team.test`,
        fullName: 'TD-29 Fixture B',
      },
    ])
    .onConflictDoNothing();
  await directDb
    .insert(projects)
    .values({
      id: fixtures.userAProjectId,
      ownerId: fixtures.userAId,
      name: 'TD-29 Fixture Project A',
      domain: `https://td29-${fixtures.userAProjectId}.test`,
    })
    .onConflictDoNothing();
  return fixtures;
}

/**
 * Limpieza total: borrar el proyecto dispara ON DELETE CASCADE de audits,
 * findings y el resto de tablas colgantes; después se eliminan los usuarios
 * (cascade sobre lo restante). Solo toca ids del propio run del proceso.
 */
export async function cleanupIntegrationFixtures(): Promise<void> {
  if (!fixtures) return;
  await directDb
    .delete(projects)
    .where(inArray(projects.ownerId, [fixtures.userAId, fixtures.userBId]));
  await directDb
    .delete(users)
    .where(inArray(users.id, [fixtures.userAId, fixtures.userBId]));
}

console.log('📋 Integration arnés cargado (TD-29): fixtures reales + withRLS + directDb.');
