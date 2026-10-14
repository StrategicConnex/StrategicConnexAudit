/**
 * tests/integration/rls-tenant-isolation.integration.test.ts — PRUEBA NEGATIVA del agujero BYPASSRLS
 *
 * Esta es la prueba más valiosa de P1-8: demuestra por primera vez que el aislamiento
 * multi-tenant funciona contra Postgres REAL (no solo en PGlite).
 *
 * Escenarios:
 * 1. Usuario A crea proyecto → Usuario B intenta leerlo → 0 filas (RLS funciona)
 * 2. Usuario B intenta UPDATE/DELETE en proyecto de A → 0 filas afectadas (RLS funciona)
 * 3. Con directDb (BYPASSRLS) → sí ve las filas (demuestra el agujero de seguridad)
 *
 * Esta prueba nunca pudo ejecutarse en sesiones anteriores porque fallaba con
 * ECONNREFUSED 127.0.0.1:5432 (Postgres no estaba en CI).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { randomUUID } from 'crypto';
import { directDb, withRLSIntegration, cleanupIntegrationFixtures, seedIntegrationFixtures } from './setup';
import { projects, intelligenceFindings, eq } from '@/shared/db';
import { sql } from 'drizzle-orm';

beforeEach(async () => {
  await seedIntegrationFixtures();
});

afterEach(async () => {
  await cleanupIntegrationFixtures();
});

describe('P1-8: Aislamiento RLS multi-tenant contra Postgres real', () => {
  const userAId = 'user-a-id';
  const userBId = 'user-b-id';

  beforeEach(async () => {
    // seedIntegrationFixtures ya crea userA y userB + proyectos propios
  });

  it('Usuario A crea proyecto, Usuario B intenta leerlo → 0 filas (RLS isola)', async () => {
    // El fixture ya creó un proyecto de userA. Verificamos que userB no lo vea.
    const userAProjectId = sql`(SELECT id FROM projects WHERE ownerId = ${userAId} LIMIT 1)`;

    const rows = await withRLSIntegration(userBId, async (tx) =>
      tx.select({ id: true, name: true }).from(projects).where(
        eq(projects.ownerId, userAId)
      )
    );

    // ESSENCIAL: RLS debe aislar — userB ve 0 proyectos de userA
    expect(rows.length).toBe(0);
  });

  it('Usuario B intenta UPDATE en proyecto de A → 0 filas afectadas (RLS bloquea)', async () => {
    // userA ya tiene un proyecto del fixture
    const userAProjectId = sql`(SELECT id FROM projects WHERE ownerId = ${userAId} LIMIT 1)`;

    const result = await withRLSIntegration(userBId, async (tx) =>
      tx.update(projects).set({ name: 'Nombre Modificado' }).where(
        eq(projects.id, userAProjectId)
      )
    );

    // RLS debe bloquear el update — 0 filas afectadas
    expect(result.rowCount).toBe(0);
  });

  it('Usuario B intenta DELETE en proyecto de A → 0 filas afectadas (RLS bloquea)', async () => {
    // userA ya tiene un proyecto del fixture
    const userAProjectId = sql`(SELECT id FROM projects WHERE ownerId = ${userAId} LIMIT 1)`;

    const result = await withRLSIntegration(userBId, async (tx) =>
      tx.delete(projects).where(eq(projects.id, userAProjectId))
    );

    // RLS debe bloquear el delete — 0 filas afectadas
    expect(result.rowCount).toBe(0);
  });

  it('Con directDb (BYPASSRLS), Usuario B SÍ ve las filas de proyecto de A (demuestra el agujero)', async () => {
    // userA ya tiene un proyecto del fixture

    // directDb SIN withRLS ve TODAS las filas, incluyendo las de userA
    const rows = await directDb.select({ id: true, name: true, ownerId: true }).from(projects);

    // Deberíamos ver proyectos de userA (demuestra que directDb bypassa RLS)
    const userAProjects = rows.filter((r: any) => r.ownerId === userAId);
    expect(userAProjects.length).toBeGreaterThanOrEqual(1);
  });

  it('Usuario A puede leer/actualizar/borrar sus propios proyectos (withRLS funciona correctamente)', async () => {
    // userA ya tiene un proyecto del fixture
    const userAProjectId = sql`(SELECT id FROM projects WHERE ownerId = ${userAId} LIMIT 1)`;

    // userA puede leer su propio proyecto
    const userARead = await withRLSIntegration(userAId, async (tx) =>
      tx.select({ id: true, name: true }).from(projects).where(
        eq(projects.id, userAProjectId)
      )
    );

    expect(userARead.length).toBe(1);
    expect(userARead[0].name).toBeDefined();

    // userA puede actualizar su propio proyecto
    const userAUpdate = await withRLSIntegration(userAId, async (tx) =>
      tx.update(projects).set({ name: 'Nombre Actualizado' }).where(
        eq(projects.id, userAProjectId)
      )
    );

    expect(userAUpdate.rowCount).toBe(1);

    // userA puede borrar su propio proyecto
    const userADelete = await withRLSIntegration(userAId, async (tx) =>
      tx.delete(projects).where(eq(projects.id, userAProjectId))
    );

    expect(userADelete.rowCount).toBe(1);
  });
});