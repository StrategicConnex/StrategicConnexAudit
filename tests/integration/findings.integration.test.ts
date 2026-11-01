/**
 * tests/integration/findings.integration.test.ts — CRUD de intelligence_findings contra Postgres real
 *
 * Relación: findings pertenece a projects (FK projectId). El ciclo de vida del
 * hallazgo usa `status` text ('open' por defecto; drizzle/2026-10-05) y
 * `severity` es el enum finding_severity (info|low|medium|high|critical).
 *
 * TD-29 (2026-11-01): subconsultas pseudo-SQL sustituidas por el id real del
 * proyecto fixture; conteo de filas con `.returning()`.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { randomUUID } from 'crypto';
import { eq } from 'drizzle-orm';
import { intelligenceFindings } from '@/shared/db/schemas';
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

describe('Findings CRUD (Postgres real)', () => {
  it('debe crear un finding asociado a un proyecto existente', async () => {
    const newFinding = await directDb
      .insert(intelligenceFindings)
      .values({
        id: randomUUID(),
        projectId: fixtures.userAProjectId,
        severity: 'high',
        title: 'Finding de Prueba',
        description: 'Automatically generated finding for test',
        evidence: {},
        status: 'open',
        confidence: '0.700',
      })
      .returning({ id: intelligenceFindings.id, title: intelligenceFindings.title });

    expect(newFinding.length).toBe(1);
    expect(newFinding[0].title).toBe('Finding de Prueba');
  });

  it('con withRLS, un usuario solo ve findings de sus propios proyectos', async () => {
    await directDb.insert(intelligenceFindings).values({
      id: randomUUID(),
      projectId: fixtures.userAProjectId,
      severity: 'high',
      title: 'Finding Secreto A',
      description: 'Finding sensible de la tenant A',
      evidence: {},
      status: 'open',
      confidence: '0.800',
    });

    // userB con withRLS no debe ver findings de proyectos de userA
    const userBFindings = await withRLSIntegration(fixtures.userBId, async (tx) =>
      tx
        .select({ id: intelligenceFindings.id, title: intelligenceFindings.title })
        .from(intelligenceFindings)
        .where(eq(intelligenceFindings.projectId, fixtures.userAProjectId)),
    );

    expect(userBFindings.length).toBe(0);
  });

  it('directDb ve todos los findings (agujero RLS)', async () => {
    const secretFindingId = randomUUID();
    await directDb.insert(intelligenceFindings).values({
      id: secretFindingId,
      projectId: fixtures.userAProjectId,
      severity: 'medium',
      title: 'Finding visible a todos',
      description: 'Este finding debería ser visible via directDb',
      evidence: {},
      status: 'open',
      confidence: '0.500',
    });

    // directDb lee el finding recién insertado (sin RLS)
    const rows = await directDb
      .select({ id: intelligenceFindings.id })
      .from(intelligenceFindings)
      .where(eq(intelligenceFindings.id, secretFindingId));

    expect(rows.length).toBe(1);
  });

  it('actualizar finding afecta solo al proyecto dueño (con withRLS)', async () => {
    const findingId = randomUUID();
    await directDb.insert(intelligenceFindings).values({
      id: findingId,
      projectId: fixtures.userAProjectId,
      severity: 'low',
      title: 'Finding a Actualizar',
      description: 'Finding para testing de update',
      evidence: {},
      status: 'open',
      confidence: '0.500',
    });

    // userB intenta actualizar finding de userA con withRLS
    const userBUpdate = await withRLSIntegration(fixtures.userBId, async (tx) =>
      tx
        .update(intelligenceFindings)
        .set({ title: 'Título Modificado por B' })
        .where(eq(intelligenceFindings.id, findingId))
        .returning({ id: intelligenceFindings.id }),
    );

    // Debería afectar 0 filas con RLS activo
    expect(userBUpdate.length).toBe(0);

    // userA debería poder actualizar su propio finding
    const userAUpdate = await withRLSIntegration(fixtures.userAId, async (tx) =>
      tx
        .update(intelligenceFindings)
        .set({ title: 'Título Modificado' })
        .where(eq(intelligenceFindings.id, findingId))
        .returning({ id: intelligenceFindings.id }),
    );

    expect(userAUpdate.length).toBe(1);
  });

  it('eliminar finding afecta solo al proyecto dueño (con withRLS)', async () => {
    const findingId = randomUUID();
    await directDb.insert(intelligenceFindings).values({
      id: findingId,
      projectId: fixtures.userAProjectId,
      severity: 'info',
      title: 'Finding a Eliminar',
      description: 'Finding de prueba de delete',
      evidence: {},
      status: 'open',
      confidence: '0.300',
    });

    // userB intenta eliminar finding de userA con withRLS
    const userBDelete = await withRLSIntegration(fixtures.userBId, async (tx) =>
      tx.delete(intelligenceFindings).where(eq(intelligenceFindings.id, findingId)).returning({ id: intelligenceFindings.id }),
    );

    // Debería afectar 0 filas con RLS activo
    expect(userBDelete.length).toBe(0);

    // userA debería poder eliminar su propio finding
    const userADelete = await withRLSIntegration(fixtures.userAId, async (tx) =>
      tx.delete(intelligenceFindings).where(eq(intelligenceFindings.id, findingId)).returning({ id: intelligenceFindings.id }),
    );

    expect(userADelete.length).toBe(1);
  });
});
