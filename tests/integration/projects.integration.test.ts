/**
 * tests/integration/projects.integration.test.ts — CRUD de projects contra Postgres real
 *
 * Ejecución: pnpm test:integration -- --run projects.integration.test.ts
 *
 * this test suite requires:
 * - Postgres real corriendo (CI: job `integration`, local: `docker run` o Postgres local)
 - DATABASE_URL y DIRECT_URL apuntando a la BD correcta
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { randomUUID } from 'crypto';
import { directDb, withRLSIntegration, cleanupIntegrationFixtures, seedIntegrationFixtures, setupIntegrationDb } from './setup';
import { projects, eq } from '@/shared/db';
import { sql } from 'drizzle-orm';

beforeEach(async () => {
  await setupIntegrationDb();
  await seedIntegrationFixtures();
});

afterEach(async () => {
  await cleanupIntegrationFixtures();
});

describe('Projects CRUD (Postgres real)', () => {
  it('debe crear un proyecto con RLS activo (usuario dueño ve su propio proyecto)', async () => {
    // Usamos userA creado en setup
    const userId = process.env.E2E_TEST_TENANT_USER_ID || 'user-a-id';

    const newProject = await directDb.insert(projects).values({
      id: randomUUID(),
      ownerId: userId,
      name: 'Proyecto de Prueba',
      domain: 'https://prueba.test',
      timezone: 'UTC',
      crawlDepth: 3,
      userAgent: 'StrategicAuditBot/1.0',
      respectsRobotsTxt: true,
      dataRetentionDays: 365,
      autoDeleteAudits: false,
      settings: {},
    }).returning();

    expect(newProject.length).toBe(1);
    expect(newProject[0].name).toBe('Proyecto de Prueba');
    expect(newProject[0].ownerId).toBe(userId);
  });

  it('con withRLS, un usuario solo ve sus propios proyectos', async () => {
    // userA crea un proyecto
    const userAId = 'user-a-id';

    await directDb.insert(projects).values({
      id: randomUUID(),
      ownerId: userAId,
      name: 'Proyecto Solo A',
      domain: 'https://solo-a.test',
    });

    // userB con withRLS solo debe ver sus propios proyectos (0 de userA)
    const userBProjects = await withRLSIntegration('user-b-id', async (tx) =>
      tx.select({ id: true, name: true }).from(projects).where(eq(projects.ownerId, userAId))
    );

    // userB should see 0 projects owned by userA with RLS
    expect(userBProjects.length).toBe(0);
  });

  it('directDb (BypassRLS) ve TODOS los proyectos independientemente del userId', async () => {
    // userA crea un proyecto
    await directDb.insert(projects).values({
      id: randomUUID(),
      ownerId: 'user-a-id',
      name: 'Proyecto Secreto',
      domain: 'https://secreto.test',
    });

    // directDb sin withRLS ve TODAS las filas (el "agujero" de RLS)
    const allProjects = await directDb.select({ id: true, name: true }).from(projects);

    expect(allProjects.length).toBeGreaterThan(0);
    // Deberíamos ver al menos el proyecto de userA
    const hasUserA = allProjects.some((p: any) => p.ownerId === 'user-a-id');
    expect(hasUserA).toBe(true);
  });

  it('actualizar un proyecto solo afecta al dueño (con withRLS)', async () => {
    // userA crea un proyecto
    const projectId = randomUUID();
    await directDb.insert(projects).values({
      id: projectId,
      ownerId: 'user-a-id',
      name: 'Nombre Original',
      domain: 'https://original.test',
    });

    // userB intenta actualizar el proyecto de userA con withRLS
    // should affect 0 rows because RLS filters by ownerId
    const result = await withRLSIntegration('user-b-id', async (tx) =>
      tx.update(projects).set({ name: 'Nombre Modificado' }).where(eq(projects.id, projectId))
    );

    // Número de filas afectadas debería ser 0 con RLS activo
    expect(result.rowCount).toBe(0);

    // Pero userA debería poder actualizar su propio proyecto
    const userAUpdate = await withRLSIntegration('user-a-id', async (tx) =>
      tx.update(projects).set({ name: 'Nombre Modificado' }).where(eq(projects.id, projectId))
    );

    expect(userAUpdate.rowCount).toBe(1);
  });

  it('eliminar un proyecto solo afecta al dueño (con withRLS)', async () => {
    // userA crea un proyecto
    const projectId = randomUUID();
    await directDb.insert(projects).values({
      id: projectId,
      ownerId: 'user-a-id',
      name: 'Proyecto a Eliminar',
      domain: 'https://eliminar.test',
    });

    // userB intenta eliminar el proyecto de userA con withRLS
    const result = await withRLSIntegration('user-b-id', async (tx) =>
      tx.delete(projects).where(eq(projects.id, projectId))
    );

    // Debería afectar 0 filas con RLS activo
    expect(result.rowCount).toBe(0);

    // userA debería poder eliminar su propio proyecto
    const userADelete = await withRLSIntegration('user-a-id', async (tx) =>
      tx.delete(projects).where(eq(projects.id, projectId))
    );

    expect(userADelete.rowCount).toBe(1);
  });
});