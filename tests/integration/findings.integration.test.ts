/**
 * tests/integration/findings.integration.test.ts — CRUD de inteligencia_findings contra Postgres real
 *
 * Relación: findings pertenece a projects (FK projectId) y toolRuns (FK toolRunId).
 * Prueba CRUD básico y aislamiento RLS multi-tenant.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { randomUUID } from 'crypto';
import { directDb, withRLSIntegration, cleanupIntegrationFixtures, seedIntegrationFixtures } from './setup';
import { intelligenceFindings, projects, eq } from '@/shared/db';
import { sql } from 'drizzle-orm';

beforeEach(async () => {
  await seedIntegrationFixtures();
});

afterEach(async () => {
  await cleanupIntegrationFixtures();
});

describe('Findings CRUD (Postgres real)', () => {
  it('debe crear un finding asociado a un proyecto existente', async () => {
    const projectId = sql`(SELECT id FROM projects WHERE ownerId = 'user-a-id' LIMIT 1)`;

    const newFinding = await directDb.insert(intelligenceFindings).values({
      id: randomUUID(),
      projectId: projectId,
      severity: 'high' as any,
      title: 'Finding de Prueba',
      description: 'Automatically generated finding for test',
      evidence: {},
      status: 'open' as any,
      confidence: 0.700,
    }).returning();

    expect(newFinding.length).toBe(1);
    expect(newFinding[0].title).toBe('Finding de Prueba');
  });

  it('con withRLS, un usuario solo ve findings de sus propios proyectos', async () => {
    const projectId = sql`(SELECT id FROM projects WHERE ownerId = 'user-a-id' LIMIT 1)`;

    await directDb.insert(intelligenceFindings).values({
      id: randomUUID(),
      projectId: projectId,
      severity: 'high' as any,
      title: 'Finding Secreto A',
      description: 'Finding sensible de la tenant A',
      evidence: {},
      status: 'open' as any,
      confidence: 0.800,
    });

    // userB con withRLS no debe ver findings de proyectos de userA
    const userBFindings = await withRLSIntegration('user-b-id', async (tx) =>
      tx.select({ id: true, title: true }).from(intelligenceFindings).where(
        eq(intelligenceFindings.projectId, projectId)
      )
    );

    expect(userBFindings.length).toBe(0);
  });

  it('directDb ve todos los findings (agujero RLS)', async () => {
    const projectId = sql`(SELECT id FROM projects WHERE ownerId = 'user-a-id' LIMIT 1)`;

    await directDb.insert(intelligenceFindings).values({
      id: randomUUID(),
      projectId: projectId,
      severity: 'medium' as any,
      title: 'Finding visible a todos',
      description: 'Este finding debería ser visible via directDb',
      evidence: {},
      status: 'open' as any,
      confidence: 0.500,
    });

    const allFindings = await directDb.select({ id: true, title: true }).from(intelligenceFindings);

    expect(allFindings.length).toBeGreaterThan(0);
    // Deberíamos finding creado arriba
    const hasFinding = allFindings.some((f: any) => f.title === 'Finding visible a todos');
    expect(hasFinding).toBe(true);
  });

  it('actualizar finding afecta solo al proyecto dueño (con withRLS)', async () => {
    const projectId = sql`(SELECT id FROM projects WHERE ownerId = 'user-a-id' LIMIT 1)`;

    const findingId = randomUUID();
    await directDb.insert(intelligenceFindings).values({
      id: findingId,
      projectId,
      severity: 'low' as any,
      title: 'Finding a Actualizar',
      description: 'Finding para testing de update',
      evidence: {},
      status: 'open' as any,
      confidence: 0.500,
    });

    // userB intenta actualizar finding de userA con withRLS
    const result = await withRLSIntegration('user-b-id', async (tx) =>
      tx.update(intelligenceFindings).set({ title: 'Title Modificado' }).where(
        eq(intelligenceFindings.id, findingId)
      )
    );

    // Debería afectar 0 filas con RLS activo
    expect(result.rowCount).toBe(0);

    // userA debería poder actualizar su propio finding
    const userAResult = await withRLSIntegration('user-a-id', async (tx) =>
      tx.update(intelligenceFindings).set({ title: 'Title Modificado' }).where(
        eq(intelligenceFindings.id, findingId)
      )
    );

    expect(userAResult.rowCount).toBe(1);
  });

  it('eliminar finding afecta solo al proyecto dueño (con withRLS)', async () => {
    const projectId = sql`(SELECT id FROM projects WHERE ownerId = 'user-a-id' LIMIT 1)`;

    const findingId = randomUUID();
    await directDb.insert(intelligenceFindings).values({
      id: findingId,
      projectId,
      severity: 'info' as any,
      title: 'Finding a Eliminar',
      description: 'Finding de prueba de delete',
      evidence: {},
      status: 'open' as any,
      confidence: 0.300,
    });

    // userB intenta eliminar finding de userA con withRLS
    const result = await withRLSIntegration('user-b-id', async (tx) =>
      tx.delete(intelligenceFindings).where(eq(intelligenceFindings.id, findingId))
    );

    // Debería afectar 0 filas con RLS activo
    expect(result.rowCount).toBe(0);

    // userA debería poder eliminar su propio finding
    const userAResult = await withRLSIntegration('user-a-id', async (tx) =>
      tx.delete(intelligenceFindings).where(eq(intelligenceFindings.id, findingId))
    );

    expect(userAResult.rowCount).toBe(1);
  });
});