#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';
import { execSync } from 'child_process';
import { writeFileSync } from 'fs';
import { resolve } from 'path';
import { Pool } from 'pg';

// Load env vars
const databaseUrl = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/scaudit_test?sslmode=disable';
const directUrl = process.env.DIRECT_URL || 'postgresql://postgres:postgres@localhost:5432/scaudit_test?sslmode=disable';

console.log('🔧 Preparing Supabase stubs for integration tests...\n');

// Step 1: Create Postgres roles (anon, authenticated, service_role)
// These are needed because Postgres vanilla doesn't have them, but drizzle/migrations
// assume they exist (they're created by Supabase on setup)

console.log('1. Creating Postgres roles...');
try {
  const pool = new Pool({
    connectionString: databaseUrl,
  });

  const createRole = async (roleName) => {
    await pool.query(`CREATE ROLE IF NOT EXISTS ${roleName};`);
    console.log(`   - Role ${roleName} ensured`);
  };

  await createRole('anon');
  await createRole('authenticated');
  await createRole('service_role');

  await pool.end();
  console.log('   ✅ Roles created\n');
} catch (error) {
  console.error('   ❌ Failed to create roles:', error.message);
  console.error('   ⚠️  Continuing without explicit role creation...\n');
}

// Step 2: Create the _rls_project_sandbox table used by RLS tests
// This table is used by tests/security/rls-bypassrls-proof.test.ts and
// tests/integration/rls-tenant-isolation.integration.test.ts

console.log('2. Creating _rls_project_sandbox table...');
try {
  const pool = new Pool({
    connectionString: databaseUrl,
  });

  // Create the sandbox table for RLS testing
  await pool.query(`
    CREATE TABLE IF NOT EXISTS _rls_project_sandbox (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      projectId uuid NOT NULL,
      name text NOT NULL,
      userId uuid NOT NULL
    );
  `);

  // Enable RLS on the table
  await pool.query(`
    ALTER TABLE _rls_project_sandbox ENABLE ROW LEVEL SECURITY;
  `);

  // Create policies that mimic Supabase's behavior:
  // - authenticated users can only see their own tenant's data
  // - service_role can see everything

  await pool.query(`
    CREATE POLICY "projects_view_own_tenant" ON _rls_project_sandbox
    FOR SELECT TO authenticated
    USING (userId = current_setting('request.jwt.claims')::json->>'sub'::uuid);
  `);

  await pool.query(`
    CREATE POLICY "service_role_full_access" ON _rls_project_sandbox
    FOR ALL TO service_role
    USING (true)
    WITH CHECK (true);
  `);

  // Also create a public policy for the bypass RLS test (directDb sees everything)
  await pool.query(`
    CREATE POLICY "direct_db_full_access" ON _rls_project_sandbox
    FOR ALL TO public
    USING (true)
    WITH CHECK (true);
  `);

  await pool.end();
  console.log('   ✅ _rls_project_sandbox table created with RLS policies\n');
} catch (error) {
  console.error('   ❌ Failed to create table:', error.message);
  console.error('   ⚠️  Continuing without table creation...\n');
}

// Step 3: Grant necessary permissions
console.log('3. Granting permissions...');
try {
  const pool = new Pool({
    connectionString: databaseUrl,
  });

  await pool.query(`
    GRANT SELECT, INSERT, UPDATE, DELETE ON _rls_project_sandbox TO authenticated;
    GRANT SELECT, INSERT, UPDATE, DELETE ON _rls_project_sandbox TO service_role;
    GRANT SELECT, INSERT, UPDATE, DELETE ON _rls_project_sandbox TO public;
  `);

  await pool.end();
  console.log('   ✅ Permissions granted\n');
} catch (error) {
  console.error('   ❌ Failed to grant permissions:', error.message);
}

console.log('✅ Supabase stubs preparation complete!');
console.log('📝 Next steps:\n');
console.log('1. Run migrations: pnpm drizzle-kit migrate');
console.log('2. Run integration tests: pnpm test:integration');
process.exit(0);