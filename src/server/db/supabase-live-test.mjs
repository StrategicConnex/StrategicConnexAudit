/**
 * supabase-live-test.mjs — Prueba de integración REAL contra Supabase PostgreSQL.
 *
 * Conecta directamente a la base de datos Supabase via DIRECT_URL y ejecuta:
 * 1. Conexión SSL
 * 2. Consultas SELECT en TODAS las tablas del esquema público
 * 3. Verificación de RLS (Row Level Security) — qué tablas lo tienen
 * 4. Consultas JOIN entre tablas relacionadas
 * 5. Pruebas de INSERT/ROLLBACK para verificar permisos de escritura
 *
 * USO:
 *   node src/server/db/supabase-live-test.mjs
 *
 * Requiere DIRECT_URL en .env.local o variable de entorno
 */

import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';

const { Pool } = pg;
const __dirname = dirname(fileURLToPath(import.meta.url));

// ─── Cargar .env manualmente ───────────────────────────────────────
function loadEnv() {
  // Try multiple paths since __dirname resolution can vary on different systems
  const candidates = [
    resolve(__dirname, '../../.env.local'),
    resolve(__dirname, '../.env.local'),
    resolve(process.cwd(), '.env.local'),
  ];
  
  for (const envPath of candidates) {
    try {
      const content = readFileSync(envPath, 'utf-8');
      for (const line of content.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const eqIdx = trimmed.indexOf('=');
        if (eqIdx === -1) continue;
        const key = trimmed.slice(0, eqIdx).trim();
        const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '');
        if (!process.env[key]) {
          process.env[key] = val;
        }
      }
      return; // Successfully loaded
    } catch {
      // Try next path
    }
  }
  console.warn('[DB Test] No .env.local found in any candidate path');
}

loadEnv();

const DIRECT_URL = process.env.DIRECT_URL;
const DATABASE_URL = process.env.DATABASE_URL;

// Debug info if DIRECT_URL not found
if (!DIRECT_URL) {
  console.log(`[DB Test] __dirname: ${__dirname}`);
  console.log(`[DB Test] cwd: ${process.cwd()}`);
}

// ─── Helpers ────────────────────────────────────────────────────────

const PASS = '✅';
const FAIL = '❌';
const SKIP = '⏭️';
const WARN = '⚠️';

let passed = 0;
let failed = 0;
let skipped = 0;

function report(label, ok, detail = '') {
  const icon = ok ? PASS : FAIL;
  if (ok) passed++;
  else failed++;
  const detailStr = detail ? `  ${detail}` : '';
  console.log(`  ${icon} ${label}${detailStr}`);
}

function reportSkip(label, reason) {
  skipped++;
  console.log(`  ${SKIP} ${label}  (${reason})`);
}

// ─── Tablas a testear ───────────────────────────────────────────────
// Ordenadas por nivel de dependencia (sin FK primero)

const CORE_TABLES = [
  'users',
  'subscription_plans',
  'audit_rules',
];

const DEPENDENT_TABLES = [
  'projects',
  'subscriptions',
];

const JOIN_TABLES = [
  'integrations',
  'audits',
  'keyword_targets',
  'competitors',
  'ab_tests',
  'reports',
  'backlinks',
  'heatmap_sessions',
  'schema_validations',
  'integration_data_gsc',
  'integration_data_ga4',
  'integration_data_bing',
];

const DETAIL_TABLES = [
  'integration_sync_logs',
  'crawl_results',
  'internal_links',
  'performance_results',
  'issues',
  'project_audit_rules',
  'rank_history',
  'competitor_keywords',
  'backlink_history',
  'ab_test_results',
  'report_exports',
  'audit_logs',
];

const INTELLIGENCE_TABLES = [
  'intelligence_investigations',
  'intelligence_tool_runs',
  'intelligence_findings',
  'intelligence_assets',
  'intelligence_run_events',
  'intelligence_usage_events',
];

const MONITORING_TABLES = [
  'monitoring_schedules',
  'monitoring_alerts',
  'developer_api_keys',
  'webhook_configs',
];

const SECURITY_TABLES = [
  'security_audit_logs',
  'siem_alert_logs',
];

const ALL_TABLES = [
  ...CORE_TABLES,
  ...DEPENDENT_TABLES,
  ...JOIN_TABLES,
  ...DETAIL_TABLES,
  ...INTELLIGENCE_TABLES,
  ...MONITORING_TABLES,
  ...SECURITY_TABLES,
];

// ─── Main ───────────────────────────────────────────────────────────

async function main() {
  console.log('\n══════════════════════════════════════════════════════════');
  console.log('  🗄️  Supabase — Live Database Integration Test');
  console.log('══════════════════════════════════════════════════════════\n');

  if (!DIRECT_URL) {
    console.error('❌ DIRECT_URL no está configurada.');
    process.exit(1);
  }

  // ── 1. Conexión SSL ──────────────────────────────────────────────
  console.log('📡 1. Conexión SSL a Supabase\n');

  let pool;
  try {
    const parsedUrl = new URL(DIRECT_URL);
    parsedUrl.searchParams.delete('sslmode');
    const cleanUrl = parsedUrl.toString();

    pool = new Pool({
      connectionString: cleanUrl,
      ssl: { rejectUnauthorized: false },
      connectionTimeoutMillis: 10000,
    });

    const client = await pool.connect();
    await client.query('SELECT 1');
    client.release();
    report('Conexión SSL establecida', true, `host: ${parsedUrl.hostname}`);
  } catch (err) {
    report('Conexión SSL', false, err.message);
    console.log('\n  ❌ No se puede continuar sin conexión a la BD.');
    process.exit(1);
  }

  // ── 2. Versión de PostgreSQL ──────────────────────────────────────
  console.log('\n🔧 2. Información del servidor\n');
  try {
    const versionResult = await pool.query('SELECT version()');
    report('Versión PostgreSQL', true, versionResult.rows[0].version.split(',')[0]);

    const extResult = await pool.query(
      "SELECT COUNT(*) as count FROM pg_extension WHERE extname IN ('pgcrypto', 'uuid-ossp')"
    );
    report('Extensiones UUID/pgcrypto disponibles', parseInt(extResult.rows[0].count) > 0);
  } catch (err) {
    report('Información del servidor', false, err.message);
  }

  // ── 3. Tablas existentes en el esquema público ────────────────────
  console.log('\n📋 3. Verificación de tablas\n');
  try {
    const tablesResult = await pool.query(
      `SELECT table_name, table_type FROM information_schema.tables 
       WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
       ORDER BY table_name`
    );
    
    report(`Tablas encontradas en esquema public`, true, `${tablesResult.rows.length} tablas`);

    const existingTables = new Set(tablesResult.rows.map(r => r.table_name));
    const missingTables = ALL_TABLES.filter(t => !existingTables.has(t));
    
    if (missingTables.length === 0) {
      report('Todas las tablas del schema existen', true);
    } else {
      report(`Tablas faltantes (${missingTables.length})`, false, missingTables.join(', '));
    }
  } catch (err) {
    report('Listado de tablas', false, err.message);
  }

  // ── 4. Enumeraciones ─────────────────────────────────────────────
  console.log('\n🏷️  4. Verificación de enumeraciones\n');
  try {
    const enumsResult = await pool.query(
      `SELECT typname FROM pg_type 
       JOIN pg_enum ON pg_type.oid = pg_enum.enumtypid 
       GROUP BY typname ORDER BY typname`
    );
    report(`Enumeraciones encontradas`, true, `${enumsResult.rows.length} tipos enum`);

    const expectedEnums = [
      'ab_test_status', 'audit_status', 'audit_type', 'device',
      'export_format', 'export_status', 'finding_severity',
      'integration_status', 'integration_type',
      'investigation_status', 'role', 'rule_category', 'severity',
      'sub_status', 'sync_status', 'target_type', 'tool_run_status',
    ];
    const existingEnums = new Set(enumsResult.rows.map(r => r.typname));
    const missingEnums = expectedEnums.filter(e => !existingEnums.has(e));
    
    if (missingEnums.length === 0) {
      report('Todas las enumeraciones existen', true);
    } else {
      report(`Enums faltantes (${missingEnums.length})`, false, missingEnums.join(', '));
    }
  } catch (err) {
    report('Enumeraciones', false, err.message);
  }

  // ── 5. SELECT en tablas core ─────────────────────────────────────
  console.log('\n📊 5. Consultas SELECT en tablas core\n');
  
  for (const table of CORE_TABLES) {
    try {
      const result = await pool.query(`SELECT COUNT(*) as count FROM "${table}"`);
      const count = parseInt(result.rows[0].count);
      report(`SELECT COUNT(*) FROM ${table}`, true, `${count} registros`);
    } catch (err) {
      report(`SELECT COUNT(*) FROM ${table}`, false, err.message);
    }
  }

  // ── 6. SELECT en tablas dependientes ─────────────────────────────
  console.log('\n🔗 6. Consultas SELECT en tablas dependientes\n');
  
  for (const table of DEPENDENT_TABLES) {
    try {
      const result = await pool.query(`SELECT COUNT(*) as count FROM "${table}"`);
      const count = parseInt(result.rows[0].count);
      report(`SELECT COUNT(*) FROM ${table}`, true, `${count} registros`);
    } catch (err) {
      report(`SELECT COUNT(*) FROM ${table}`, false, err.message);
    }
  }

  // ── 7. SELECT en tablas JOIN (con FK) ────────────────────────────
  console.log('\n🧩 7. Consultas SELECT en tablas con FK\n');
  
  for (const table of JOIN_TABLES) {
    try {
      const result = await pool.query(`SELECT COUNT(*) as count FROM "${table}"`);
      const count = parseInt(result.rows[0].count);
      report(`SELECT COUNT(*) FROM ${table}`, true, `${count} registros`);
    } catch (err) {
      report(`SELECT COUNT(*) FROM ${table}`, false, err.message);
    }
  }

  // ── 8. SELECT en tablas de detalle ───────────────────────────────
  console.log('\n📎 8. Consultas SELECT en tablas de detalle\n');
  
  for (const table of DETAIL_TABLES) {
    try {
      const result = await pool.query(`SELECT COUNT(*) as count FROM "${table}"`);
      const count = parseInt(result.rows[0].count);
      report(`SELECT COUNT(*) FROM ${table}`, true, `${count} registros`);
    } catch (err) {
      report(`SELECT COUNT(*) FROM ${table}`, false, err.message);
    }
  }

  // ── 9. SELECT en tablas de inteligencia ──────────────────────────
  console.log('\n🕵️  9. Consultas SELECT en tablas de inteligencia\n');
  
  for (const table of INTELLIGENCE_TABLES) {
    try {
      const result = await pool.query(`SELECT COUNT(*) as count FROM "${table}"`);
      const count = parseInt(result.rows[0].count);
      report(`SELECT COUNT(*) FROM ${table}`, true, `${count} registros`);
    } catch (err) {
      report(`SELECT COUNT(*) FROM ${table}`, false, err.message);
    }
  }

  // ── 10. SELECT en tablas de monitoreo ────────────────────────────
  console.log('\n📡 10. Consultas SELECT en tablas de monitoreo\n');
  
  for (const table of MONITORING_TABLES) {
    try {
      const result = await pool.query(`SELECT COUNT(*) as count FROM "${table}"`);
      const count = parseInt(result.rows[0].count);
      report(`SELECT COUNT(*) FROM ${table}`, true, `${count} registros`);
    } catch (err) {
      report(`SELECT COUNT(*) FROM ${table}`, false, err.message);
    }
  }

  // ── 11. SELECT en tablas de seguridad ────────────────────────────
  console.log('\n🔒 11. Consultas SELECT en tablas de seguridad\n');
  
  for (const table of SECURITY_TABLES) {
    try {
      const result = await pool.query(`SELECT COUNT(*) as count FROM "${table}"`);
      const count = parseInt(result.rows[0].count);
      report(`SELECT COUNT(*) FROM ${table}`, true, `${count} registros`);
    } catch (err) {
      report(`SELECT COUNT(*) FROM ${table}`, false, err.message);
    }
  }

  // ── 12. Consultas JOIN entre tablas ──────────────────────────────
  console.log('\n🔄 12. Consultas JOIN entre tablas relacionadas\n');
  
  // Projects + Users
  try {
    const result = await pool.query(`
      SELECT p.name, u.email 
      FROM projects p 
      JOIN users u ON p.owner_id = u.id 
      LIMIT 5
    `);
    report('JOIN projects → users', true, `${result.rows.length} resultados`);
  } catch (err) {
    report('JOIN projects → users', false, err.message);
  }

  // Audits + Projects
  try {
    const result = await pool.query(`
      SELECT a.type, a.status, p.name 
      FROM audits a 
      JOIN projects p ON a.project_id = p.id 
      LIMIT 5
    `);
    report('JOIN audits → projects', true, `${result.rows.length} resultados`);
  } catch (err) {
    report('JOIN audits → projects', false, err.message);
  }

  // Integration Data + Projects
  try {
    const result = await pool.query(`
      SELECT g.url, g.clicks, g.impressions, p.name 
      FROM integration_data_gsc g 
      JOIN projects p ON g.project_id = p.id 
      LIMIT 5
    `);
    report('JOIN integration_data_gsc → projects', true, `${result.rows.length} resultados`);
  } catch (err) {
    report('JOIN integration_data_gsc → projects', false, err.message);
  }

  // ── 13. RLS — qué tablas tienen Row Level Security ───────────────
  console.log('\n🛡️  13. Verificación de Row Level Security (RLS)\n');
  
  try {
    const rlsResult = await pool.query(`
      SELECT relname as table_name, relrowsecurity as has_rls
      FROM pg_class
      WHERE relnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
        AND relkind = 'r'
        AND relrowsecurity = true
      ORDER BY relname
    `);
    
    if (rlsResult.rows.length > 0) {
      report('Tablas con RLS habilitado', true, `${rlsResult.rows.length} tablas: ${rlsResult.rows.map(r => r.table_name).join(', ')}`);
    } else {
      report('Tablas con RLS habilitado', false, '0 tablas — todas sin protección RLS');
    }
  } catch (err) {
    report('RLS check', false, err.message);
  }

  // ── 14. Prueba INSERT/ROLLBACK (permisos de escritura) ──────────
  console.log('\n✍️  14. Prueba de escritura (INSERT + ROLLBACK)\n');

  async function insertWithRollback(label, query, params) {
    // Each INSERT test uses its OWN client to avoid transaction state leaks
    const ownClient = await pool.connect();
    try {
      await ownClient.query('BEGIN');
      const result = await ownClient.query(query, params || []);
      await ownClient.query('ROLLBACK');
      report(label, true);
    } catch (err) {
      // Ensure ROLLBACK even on error to avoid aborted transactions
      try { await ownClient.query('ROLLBACK'); } catch (_) {}
      report(label, false, err.message);
    } finally {
      ownClient.release();
    }
  }
  
  // Test INSERT en security_audit_logs (no tiene FK obligatorias complejas)
  await insertWithRollback('INSERT en security_audit_logs (ROLLBACK)',
    `INSERT INTO security_audit_logs (event_type, ip, path, method, metadata)
     VALUES ('db_live_test', '127.0.0.1', '/test', 'TEST', '{"test": true}'::jsonb)`
  );

  // Test INSERT en uptime_logs (primero buscar un project_id válido)
  try {
    const projectResult = await pool.query('SELECT id FROM projects LIMIT 1');
    if (projectResult.rows.length > 0) {
      const projectId = projectResult.rows[0].id;
      await insertWithRollback('INSERT en uptime_logs (ROLLBACK)',
        `INSERT INTO uptime_logs (project_id, is_up, status_code, response_time_ms)
         VALUES ($1, true, 200, 100)`,
        [projectId]
      );
    } else {
      reportSkip('INSERT en uptime_logs', 'no hay projects en la BD');
    }
  } catch (err) {
    report('INSERT en uptime_logs', false, err.message);
  }

  // ── 15. Performance de consultas ─────────────────────────────────
  console.log('\n⚡ 15. Performance de consultas\n');
  
  const perfTests = [
    { label: 'SELECT 1', query: 'SELECT 1' },
    { label: 'COUNT(projects)', query: 'SELECT COUNT(*) FROM projects' },
    { label: 'COUNT(audits)', query: 'SELECT COUNT(*) FROM audits' },
    { label: 'COUNT(integration_data_gsc)', query: 'SELECT COUNT(*) FROM integration_data_gsc' },
  ];

  for (const { label, query } of perfTests) {
    try {
      const start = Date.now();
      await pool.query(query);
      const ms = Date.now() - start;
      const ok = ms < 500;
      report(`${label} (${ms}ms)`, ok, ok ? 'rápido (<500ms)' : 'lento (>=500ms)');
    } catch (err) {
      report(label, false, err.message);
    }
  }

  // ── 16. Sequential scan check ────────────────────────────────────
  console.log('\n🔍 16. Índices y sequential scans\n');
  
  try {
    const indexResult = await pool.query(`
      SELECT tablename, indexname, indexdef 
      FROM pg_indexes 
      WHERE schemaname = 'public'
      ORDER BY tablename, indexname
    `);
    report('Índices encontrados', true, `${indexResult.rows.length} índices en ${new Set(indexResult.rows.map(r => r.tablename)).size} tablas`);
  } catch (err) {
    report('Índices', false, err.message);
  }

  // ── Summary ──────────────────────────────────────────────────────
  const total = passed + failed + skipped;
  const totalTables = ALL_TABLES.length;

  console.log('\n══════════════════════════════════════════════════════════');
  console.log('  📊  Resumen Final');
  console.log('══════════════════════════════════════════════════════════\n');

  console.log(`  ✅  ${passed} pruebas pasaron`);
  console.log(`  ❌  ${failed} pruebas fallaron`);
  console.log(`  ⏭️  ${skipped} pruebas saltadas`);
  console.log(`  📋  ${totalTables} tablas verificadas`);
  console.log(`  ⏱️   Test completado: ${new Date().toISOString()}`);

  // Cerrar pool
  await pool.end();

  // Exit code: 0 si todo OK, 1 si hay fallos
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(err => {
  console.error('\n💥 Error fatal:', err);
  process.exit(1);
});
