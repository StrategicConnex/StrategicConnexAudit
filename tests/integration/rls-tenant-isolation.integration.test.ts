/**
 * tests/integration/rls-tenant-isolation.integration.test.ts — PRUEBA NEGATIVA del agujero BYPASSRLS
 *
 * La prueba más valiosa de P1-8: demuestra que el aislamiento multi-tenant
 * funciona contra Postgres REAL (no solo en PGlite).
 *
 * Escenarios:
 * 1. Usuario A crea proyecto → Usuario B intenta leerlo → 0 filas (RLS funciona)
 * 2. Usuario B intenta UPDATE/DELETE en proyecto de A → 0 filas afectadas (RLS funciona)
 * 3. Con directDb (rol con BYPASSRLS) → sí ve las filas (demuestra el agujero de seguridad)
 *
 * TD-29 (2026-11-01): la versión anterior fallaba ANTES de llegar a Postgres
 * (ids 'user-a-id' sin FK, exports inexistentes, `.rowCount` de driver). Ahora
 * los fixtures son reales (seedIntegrationFixtures) y lo que se cuenta son las
 * filas devueltas por `.returning()` (drizzle-orm, driver-agnóstico).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { eq } from 'drizzle-orm';
import { projects } from '@/shared/db/schemas';
import {
  directDb,
  withRLSIntegration,
  cleanupIntegrationFixtures,
  seedIntegrationFixtures,
  type IntegrationFixtures,
} from './setup';

let fixtures: IntegrationFixtures;

beforeEach(async () => {
  fixtures = await seedIntegrationFixtures();
});

afterEach(async () => {
  await cleanupIntegrationFixtures();
});

describe('P1-8: Aislamiento RLS multi-tenant contra Postgres real', () => {
  it('Usuario A tiene su proyecto; Usuario B intenta leerlo → 0 filas (RLS aísla)', async () => {
    const rows = await withRLSIntegration(fixtures.userBId, async (tx) =>
      tx
        .select({ id: projects.id, name: projects.name })
        .from(projects)
        .where(eq(projects.ownerId, fixtures.userAId)),
    );

    // ESENCIAL: RLS debe aislar — userB ve 0 proyectos de userA
    expect(rows.length).toBe(0);
  });

  it('Usuario B intenta UPDATE en proyecto de A → 0 filas afectadas (RLS bloquea)', async () => {
    const updated = await withRLSIntegration(fixtures.userBId, async (tx) =>
      tx
        .update(projects)
        .set({ name: 'Nombre Modificado Por B' })
        .where(eq(projects.id, fixtures.userAProjectId))
        .returning({ id: projects.id }),
    );

    // RLS debe bloquear el update — 0 filas afectadas
    expect(updated.length).toBe(0);
  });

  it('Usuario B intenta DELETE en proyecto de A → 0 filas afectadas (RLS bloquea)', async () => {
    const deleted = await withRLSIntegration(fixtures.userBId, async (tx) =>
      tx.delete(projects).where(eq(projects.id, fixtures.userAProjectId)).returning({ id: projects.id }),
    );

    // RLS debe bloquear el delete — 0 filas afectadas
    expect(deleted.length).toBe(0);
  });

  it('Con directDb (rol BYPASSRLS) sí se lee el proyecto de A (demuestra el agujero)', async () => {
    // directDb SIN withRLS ve TODAS las filas, incluida la de userA
    const rows = await directDb
      .select({ id: projects.id, ownerId: projects.ownerId })
      .from(projects)
      .where(eq(projects.id, fixtures.userAProjectId));

    expect(rows.length).toBe(1);
    expect(rows[0].ownerId).toBe(fixtures.userAId);
  });

  it('Usuario A puede leer/actualizar/borrar sus propios proyectos (withRLS correcto)', async () => {
    // userA puede leer su propio proyecto
    const userARead = await withRLSIntegration(fixtures.userAId, async (tx) =>
      tx
        .select({ id: projects.id, name: projects.name })
        .from(projects)
        .where(eq(projects.id, fixtures.userAProjectId)),
    );

    expect(userARead.length).toBe(1);
    expect(userARead[0].name).toBeDefined();

    // userA puede actualizar su propio proyecto
    const userAUpdate = await withRLSIntegration(fixtures.userAId, async (tx) =>
      tx
        .update(projects)
        .set({ name: 'Nombre Actualizado' })
        .where(eq(projects.id, fixtures.userAProjectId))
        .returning({ id: projects.id }),
    );

    expect(userAUpdate.length).toBe(1);

    // userA puede borrar su propio proyecto
    const userADelete = await withRLSIntegration(fixtures.userAId, async (tx) =>
      tx.delete(projects).where(eq(projects.id, fixtures.userAProjectId)).returning({ id: projects.id }),
    );

    expect(userADelete.length).toBe(1);
  });
});
