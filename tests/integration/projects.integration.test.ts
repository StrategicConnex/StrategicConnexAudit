/**
 * tests/integration/projects.integration.test.ts — CRUD de projects contra Postgres real
 *
 * Ejecución: pnpm test:integration
 *
 * Este suite requiere:
 * - Postgres real corriendo (CI: job `integration`; local: Postgres con DATABASE_URL/DIRECT_URL)
 * - Stub de Supabase ya preparado (pnpm db:prepare-test) + drizzle-kit migrate
 *
 * TD-29 (2026-11-01): fixtures reales (seedIntegrationFixtures devuelve ids con
 * FK válida) y conteo de filas con `.returning()` en vez de `.rowCount`.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { randomUUID } from 'crypto';
import { eq } from 'drizzle-orm';
import { projects } from '@/shared/db/schemas';
import {
  directDb,
  withRLSIntegration,
  cleanupIntegrationFixtures,
  seedIntegrationFixtures,
  setupIntegrationDb,
  type IntegrationFixtures,
} from './setup';

let fixtures: IntegrationFixtures;

beforeEach(async () => {
  await setupIntegrationDb();
  fixtures = await seedIntegrationFixtures();
});

afterEach(async () => {
  await cleanupIntegrationFixtures();
});

describe('Projects CRUD (Postgres real)', () => {
  it('debe crear un proyecto con FK válida (directDb, rol con BYPASSRLS)', async () => {
    const newProject = await directDb
      .insert(projects)
      .values({
        id: randomUUID(),
        ownerId: fixtures.userAId,
        name: 'Proyecto de Prueba',
        domain: 'https://prueba.test',
      })
      .returning({ id: projects.id, name: projects.name, ownerId: projects.ownerId });

    expect(newProject.length).toBe(1);
    expect(newProject[0].name).toBe('Proyecto de Prueba');
    expect(newProject[0].ownerId).toBe(fixtures.userAId);
  });

  it('con withRLS, un usuario solo ve sus propios proyectos', async () => {
    // userA crea UN proyecto extra (además del fixture)
    const extraProjectId = randomUUID();
    await directDb.insert(projects).values({
      id: extraProjectId,
      ownerId: fixtures.userAId,
      name: 'Proyecto Solo A',
      domain: 'https://solo-a.test',
    });

    // userB con withRLS solo debe ver sus propios proyectos (0 de userA)
    const userBProjects = await withRLSIntegration(fixtures.userBId, async (tx) =>
      tx
        .select({ id: projects.id, name: projects.name })
        .from(projects)
        .where(eq(projects.ownerId, fixtures.userAId)),
    );

    expect(userBProjects.length).toBe(0);
  });

  it('directDb (rol BYPASSRLS) ve TODOS los proyectos independientemente del userId', async () => {
    // userA crea un proyecto
    await directDb.insert(projects).values({
      id: randomUUID(),
      ownerId: fixtures.userAId,
      name: 'Proyecto Secreto',
      domain: 'https://secreto.test',
    });

    // directDb sin withRLS ve TODAS las filas (el "agujero" de RLS)
    const allProjects = await directDb.select({ id: projects.id }).from(projects);

    expect(allProjects.length).toBeGreaterThan(0);
    // Deberíamos ver al menos los proyectos de userA del run
    const userARows = await directDb
      .select({ id: projects.id })
      .from(projects)
      .where(eq(projects.ownerId, fixtures.userAId));
    expect(userARows.length).toBeGreaterThanOrEqual(2);
  });

  it('actualizar un proyecto solo afecta al dueño (con withRLS)', async () => {
    // userA crea un proyecto
    const projectId = randomUUID();
    await directDb.insert(projects).values({
      id: projectId,
      ownerId: fixtures.userAId,
      name: 'Nombre Original',
      domain: 'https://original.test',
    });

    // userB intenta actualizar el proyecto de userA con withRLS
    // → 0 filas porque la policy RLS filtra por dueño
    const userBUpdate = await withRLSIntegration(fixtures.userBId, async (tx) =>
      tx
        .update(projects)
        .set({ name: 'Nombre Modificado por B' })
        .where(eq(projects.id, projectId))
        .returning({ id: projects.id }),
    );

    expect(userBUpdate.length).toBe(0);

    // Pero userA sí puede actualizar su propio proyecto
    const userAUpdate = await withRLSIntegration(fixtures.userAId, async (tx) =>
      tx
        .update(projects)
        .set({ name: 'Nombre Modificado' })
        .where(eq(projects.id, projectId))
        .returning({ id: projects.id }),
    );

    expect(userAUpdate.length).toBe(1);
  });

  it('eliminar un proyecto solo afecta al dueño (con withRLS)', async () => {
    // userA crea un proyecto
    const projectId = randomUUID();
    await directDb.insert(projects).values({
      id: projectId,
      ownerId: fixtures.userAId,
      name: 'Proyecto a Eliminar',
      domain: 'https://eliminar.test',
    });

    // userB intenta eliminar el proyecto de userA con withRLS
    const userBDelete = await withRLSIntegration(fixtures.userBId, async (tx) =>
      tx.delete(projects).where(eq(projects.id, projectId)).returning({ id: projects.id }),
    );

    // Debería afectar 0 filas con RLS activo
    expect(userBDelete.length).toBe(0);

    // userA debería poder eliminar su propio proyecto
    const userADelete = await withRLSIntegration(fixtures.userAId, async (tx) =>
      tx.delete(projects).where(eq(projects.id, projectId)).returning({ id: projects.id }),
    );

    expect(userADelete.length).toBe(1);
  });
});
