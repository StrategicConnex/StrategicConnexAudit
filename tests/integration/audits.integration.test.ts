/**
 * tests/integration/audits.integration.test.ts — CRUD de audits contra Postgres real
 *
 * Relación: audits pertenece a projects (FK projectId). `type` es el enum
 * audit_type (crawl|performance|technical|full) y `status` audit_status
 * (pending|running|completed|failed|canceled).
 *
 * TD-29 (2026-11-01): valores de enum válidos ('security'→'crawl',
 * 'resolved'→'completed'), id real del proyecto fixture y conteo con
 * `.returning()` en vez de `.rowCount`.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { randomUUID } from 'crypto';
import { eq } from 'drizzle-orm';
import { audits } from '@/shared/db/schemas';
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

describe('Audits CRUD (Postgres real)', () => {
  it('debe crear un audit asociado a un proyecto existente', async () => {
    const newAudit = await directDb
      .insert(audits)
      .values({
        id: randomUUID(),
        projectId: fixtures.userAProjectId,
        type: 'technical',
        status: 'pending',
        config: {},
        createdBy: fixtures.userAId,
      })
      .returning({ id: audits.id, type: audits.type });

    expect(newAudit.length).toBe(1);
    expect(newAudit[0].type).toBe('technical');
  });

  it('con withRLS, un usuario solo ve audits de sus propios proyectos', async () => {
    // userA crea un audit en su proyecto
    const secretAuditId = randomUUID();
    await directDb.insert(audits).values({
      id: secretAuditId,
      projectId: fixtures.userAProjectId,
      type: 'crawl',
      status: 'pending',
      config: {},
      createdBy: fixtures.userAId,
    });

    // userB con withRLS no debe ver audits de proyectos de userA
    const userBAudits = await withRLSIntegration(fixtures.userBId, async (tx) =>
      tx
        .select({ id: audits.id, type: audits.type })
        .from(audits)
        .where(eq(audits.projectId, fixtures.userAProjectId)),
    );

    expect(userBAudits.length).toBe(0);
  });

  it('directDb ve todos los audits (agujero RLS)', async () => {
    const secretAuditId = randomUUID();
    await directDb.insert(audits).values({
      id: secretAuditId,
      projectId: fixtures.userAProjectId,
      type: 'technical',
      status: 'pending',
      config: {},
      createdBy: fixtures.userAId,
    });

    // directDb sin RLS ve el audit de userA
    const rows = await directDb
      .select({ id: audits.id })
      .from(audits)
      .where(eq(audits.id, secretAuditId));

    expect(rows.length).toBe(1);
  });

  it('actualizar audit afecta solo al proyecto dueño (con withRLS)', async () => {
    const auditId = randomUUID();
    await directDb.insert(audits).values({
      id: auditId,
      projectId: fixtures.userAProjectId,
      type: 'technical',
      status: 'pending',
      config: {},
      createdBy: fixtures.userAId,
    });

    // userB intenta actualizar audit de userA con withRLS
    const userBUpdate = await withRLSIntegration(fixtures.userBId, async (tx) =>
      tx
        .update(audits)
        .set({ status: 'completed' })
        .where(eq(audits.id, auditId))
        .returning({ id: audits.id }),
    );

    // Debería afectar 0 filas con RLS
    expect(userBUpdate.length).toBe(0);

    // userA debería poder actualizar su propio audit
    const userAUpdate = await withRLSIntegration(fixtures.userAId, async (tx) =>
      tx
        .update(audits)
        .set({ status: 'completed' })
        .where(eq(audits.id, auditId))
        .returning({ id: audits.id }),
    );

    expect(userAUpdate.length).toBe(1);
  });
});
