/**
 * tests/integration/setup.ts — Vitest setup for integration tests (runs against real Postgres)
 */

import { directDb } from '@/shared/db';
import { sql } from 'drizzle-orm';
import { projects, users } from '@/shared/db/schemas/index';

// ---------------------------------------------------------------------------
// Setup: Connect to Postgres
// ---------------------------------------------------------------------------
export async function setupIntegrationDb() {
  console.log('🔗 Connecting to Postgres for integration tests...\n');
  try {
    await directDb.select({ count: sql`count*` }).from(users);
    console.log('   ✅ Database connection verified\n');
  } catch (error) {
    console.error('   ❌ Database connection failed:', error);
    throw new Error('Could not connect to Postgres for integration tests');
  }
}

// ---------------------------------------------------------------------------
// Seed: Create test fixtures
// ---------------------------------------------------------------------------
export async function seedIntegrationFixtures() {
  console.log('🌱 Seeding integration test fixtures...\n');
  console.log('   (Fixture creation handled by individual test files)\n');
}

// ---------------------------------------------------------------------------
// Cleanup: Remove test fixtures
// ---------------------------------------------------------------------------
export async function cleanupIntegrationFixtures() {
  console.log('🧹 Cleaning up integration test fixtures...\n');
  console.log('   (Cleanup handled by individual test files)\n');
}

// ---------------------------------------------------------------------------
// Helper: Execute direct query bypassing RLS
// ---------------------------------------------------------------------------
export function directDbIntegration() {
  // placeholder - test files use directDb directly
  return null;
}

console.log('📋 Integration test setup loaded.');
console.log('   Use: setupIntegrationDb(), seedIntegrationFixtures(), cleanupIntegrationFixtures()');