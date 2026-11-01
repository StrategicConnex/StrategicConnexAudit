#!/usr/bin/env node
import { Pool } from 'pg';

// Load env vars
const databaseUrl = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/scaudit_test?sslmode=disable';

// Roles que Supabase crea al aprovisionar y que las migraciones 0016+ asumen.
const SUPABASE_ROLES = ['anon', 'authenticated', 'service_role'];

console.log('🔧 Preparing Supabase stubs for integration tests...\n');

const pool = new Pool({ connectionString: databaseUrl });

try {
  // Step 1: Create Postgres roles (anon, authenticated, service_role)
  // These are needed because Postgres vanilla doesn't have them, but drizzle/migrations
  // assume they exist (they're created by Supabase on setup).
  //
  // TD-19: aquí vivía `CREATE ROLE IF NOT EXISTS <role>`, que NO es sintaxis de
  // Postgres (el `IF NOT EXISTS` de CREATE ROLE no existe). Fallaba con
  // `syntax error at or near "NOT" at character 16`, el try/catch lo tragaba y el
  // script seguía adelante SIN roles — de ahí los `role "authenticated" does not
  // exist` de 0016+ al migrar desde cero. La forma idempotente real es consultar
  // pg_roles dentro de un bloque DO.
  console.log('1. Creating Postgres roles...');
  for (const role of SUPABASE_ROLES) {
    // Los nombres vienen de una lista fija en el código: no hay entrada externa.
    await pool.query(
      `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${role}') THEN CREATE ROLE ${role} NOLOGIN; END IF; END $$;`,
    );
    console.log(`   - Role ${role} ensured`);
  }
  console.log('   ✅ Roles created\n');

  // Step 1b: Stubs de plataforma que Supabase aprovisiona y que las migraciones
  // dan por hechos. Sin ellos la migración desde cero falla por motivos que no
  // tienen que ver con el schema de la app:
  //   - `auth.uid()` lo usan las policies de 2026-08-25_admin_telemetry y
  //     2026-09-27_pdf_progress.
  //   - `supabase_realtime` lo usa 0022 para publicar las tablas de intelligence.
  console.log('1b. Creating Supabase platform stubs (auth schema, realtime publication)...');
  await pool.query(`CREATE SCHEMA IF NOT EXISTS auth;`);
  await pool.query(`
    CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid
    LANGUAGE sql STABLE
    AS $$ SELECT (nullif(current_setting('request.jwt.claims', true), '')::json->>'sub')::uuid $$;
  `);
  await pool.query(`
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
        CREATE PUBLICATION supabase_realtime;
      END IF;
    END $$;
  `);
  console.log('   ✅ auth.uid() + supabase_realtime ready\n');

  // Step 2: Create the _rls_project_sandbox table used by RLS tests
  // This table is used by tests/security/rls-bypassrls-proof.test.ts
  console.log('2. Creating _rls_project_sandbox table...');
  await pool.query(`
    CREATE TABLE IF NOT EXISTS _rls_project_sandbox (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      projectId uuid NOT NULL,
      name text NOT NULL,
      userId uuid NOT NULL
    );
  `);
  await pool.query(`ALTER TABLE _rls_project_sandbox ENABLE ROW LEVEL SECURITY;`);

  // Policies: DROP + CREATE porque `CREATE POLICY` tampoco admite IF NOT EXISTS
  // (re-ejecutar el script fallaba con "policy already exists").
  // El claim puede no estar definido en la conexión: current_setting(…, true)
  // devuelve NULL en vez de lanzar, y el cast a uuid se aplica al valor 'sub'
  // completo — `…->>'sub'::uuid` se parseaba como `->> ('sub'::uuid)`.
  const claimsSub = `(current_setting('request.jwt.claims', true)::json->>'sub')::uuid`;
  await pool.query(`DROP POLICY IF EXISTS "projects_view_own_tenant" ON _rls_project_sandbox;`);
  await pool.query(`
    CREATE POLICY "projects_view_own_tenant" ON _rls_project_sandbox
    FOR SELECT TO authenticated
    USING (userId = ${claimsSub});
  `);
  await pool.query(`DROP POLICY IF EXISTS "service_role_full_access" ON _rls_project_sandbox;`);
  await pool.query(`
    CREATE POLICY "service_role_full_access" ON _rls_project_sandbox
    FOR ALL TO service_role
    USING (true)
    WITH CHECK (true);
  `);
  await pool.query(`DROP POLICY IF EXISTS "direct_db_full_access" ON _rls_project_sandbox;`);
  await pool.query(`
    CREATE POLICY "direct_db_full_access" ON _rls_project_sandbox
    FOR ALL TO public
    USING (true)
    WITH CHECK (true);
  `);
  console.log('   ✅ _rls_project_sandbox table created with RLS policies\n');

  // Step 3: Grant necessary permissions
  console.log('3. Granting permissions...');
  await pool.query(`
    GRANT SELECT, INSERT, UPDATE, DELETE ON _rls_project_sandbox TO authenticated;
    GRANT SELECT, INSERT, UPDATE, DELETE ON _rls_project_sandbox TO service_role;
    GRANT SELECT, INSERT, UPDATE, DELETE ON _rls_project_sandbox TO public;
  `);
  console.log('   ✅ Permissions granted\n');
} catch (error) {
  // Fail-closed: sin roles, `drizzle-kit migrate` falla en 0016+ con un error
  // que no señala la causa. Mejor romper aquí, donde el mensaje es el correcto.
  console.error(`\n   ❌ Supabase stubs preparation failed: ${error.message}\n`);
  console.error('   Sin estos stubs las migraciones desde cero no pueden aplicarse.');
  await pool.end().catch(() => {});
  process.exit(1);
}

await pool.end();

console.log('✅ Supabase stubs preparation complete!');
console.log('📝 Next steps:\n');
console.log('1. Run migrations: pnpm drizzle-kit migrate');
console.log('2. Run integration tests: pnpm test:integration');
