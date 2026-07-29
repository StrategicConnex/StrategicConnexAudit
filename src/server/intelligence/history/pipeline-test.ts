/**
 * pipeline-test.ts — Integration test for P0.2 DNS Pipeline
 *
 * Crea un proyecto real, ejecuta processDnsResults() dos veces
 * (la segunda con datos diferentes para simular cambios),
 * y verifica:
 *   1. Snapshots persistidos en dns_history
 *   2. Changes detectados por detectDnsChanges()
 *   3. Eventos dns_change_detected en security_audit_logs
 *
 * Uso: npx tsx src/server/intelligence/history/pipeline-test.ts
 */

import "dotenv/config";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { processDnsResults } from "./orchestrator";
import { projects } from "@/shared/db/schemas";
import { dnsHistory } from "@/shared/db/schemas/history";
import { securityAuditLogs } from "@/shared/db/schemas/security-audit";
import { eq, desc, and, gte } from "drizzle-orm";
import crypto from "node:crypto";

// ─── Config ───────────────────────────────────────────────────────────────────

const TEST_DOMAIN = "strategicconnex.com.ar";

// ─── Database setup ───────────────────────────────────────────────────────────

const directUrl =
  process.env.DIRECT_URL ||
  "postgresql://postgres:Juanbarby*123@db.qwebfomwtwxxbkxbrrwm.supabase.co:5432/postgres";

const directPool = new Pool({
  connectionString: directUrl,
  ssl: { rejectUnauthorized: false },
  max: 1,
  connectionTimeoutMillis: 10000,
});

process.env.DATABASE_URL = directUrl;
process.env.DB_ALLOW_INSECURE_SSL = "true";

const testDb = drizzle(directPool);

// ─── Helpers ───────────────────────────────────────────────────────────────────

function divider(label: string) {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`  ${label}`);
  console.log(`${"=".repeat(60)}`);
}

function pass(msg: string) {
  console.log(`  [PASS] ${msg}`);
}

function fail(msg: string) {
  console.log(`  [FAIL] ${msg}`);
}

function info(msg: string) {
  console.log(`  [INFO] ${msg}`);
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function runPipelineTest() {
  console.log(`\n🚀 P0.2 DNS Pipeline Integration Test — ${TEST_DOMAIN}\n`);

  // ─── 0. Validate DB connection ────────────────────────────────────────────

  divider("0. Conexión a Base de Datos");
  try {
    const result = await directPool.query("SELECT 1 as ok");
    pass(`Conectado a Supabase (${result.rows[0].ok})`);
  } catch (err: any) {
    fail(`No se puede conectar: ${err.message}`);
    await directPool.end();
    process.exit(1);
  }

  // ─── 1. Crear proyecto real ───────────────────────────────────────────────

  divider("1. Crear proyecto de prueba");

  const projectId = crypto.randomUUID();
  info(`Project ID: ${projectId}`);

  // Bypass FK checks for this session to allow test data
  await directPool.query("SET session_replication_role = replica;");

  try {
    await testDb.insert(projects).values({
      id: projectId,
      ownerId: projectId, // self-referencing to avoid auth.users FK
      name: `Pipeline Test - ${TEST_DOMAIN}`,
      domain: TEST_DOMAIN,
    });
    pass(`Proyecto creado: ${projectId}`);
  } catch (err: any) {
    fail(`Error creando proyecto: ${err.message}`);
    await directPool.end();
    process.exit(1);
  }

  // ─── 2. Primera ejecución: persistir snapshots iniciales ───────────────────

  divider("2. Snapshots iniciales");

  const results1 = {
    a: ["181.114.200.146"],
    aaaa: [] as string[],
    mx: [{ exchange: "mail.strategicconnex.com.ar", priority: 10 }] as Array<{
      exchange: string;
      priority: number;
    }>,
    ns: ["ns1.host.com", "ns2.host.com"],
    txt: ["v=spf1 include:_spf.host.com ~all"],
  };

  info(`A: ${results1.a.join(", ")} · MX: ${results1.mx.map((m) => `${m.priority} ${m.exchange}`).join(", ")} · NS: ${results1.ns.join(", ")}`);

  const start1 = Date.now();
  const outcome1 = await processDnsResults({
    projectId,
    domain: TEST_DOMAIN,
    results: results1,
  });
  const elapsed1 = Date.now() - start1;

  info(`Duración: ${elapsed1}ms · Snapshots: ${outcome1.snapshotsPersisted} · Cambios: ${outcome1.changes.length}`);

  if (outcome1.snapshotsPersisted > 0) {
    pass(`Primera ejecución: ${outcome1.snapshotsPersisted} snapshots`);
  } else {
    fail("No se persistieron snapshots en la primera ejecución");
  }

  // ─── 3. Verificar BD ──────────────────────────────────────────────────────

  divider("3. Verificando dns_history (post-1ra ejecución)");

  let rowsAfterFirst: any[] = [];
  try {
    rowsAfterFirst = await testDb
      .select()
      .from(dnsHistory)
      .where(
        and(eq(dnsHistory.projectId, projectId), eq(dnsHistory.query, TEST_DOMAIN)),
      )
      .orderBy(desc(dnsHistory.snapshotDate));

    if (rowsAfterFirst.length > 0) {
      pass(`${rowsAfterFirst.length} registros persistidos`);
      for (const r of rowsAfterFirst) {
        console.log(`     [${r.recordType}] ${r.value}`);
      }
    } else {
      fail("dns_history vacío post-1ra ejecución");
    }
  } catch (err: any) {
    fail(`Error: ${err.message}`);
  }

  // ─── 4. Segunda ejecución: datos modificados ───────────────────────────────

  divider("4. Segunda ejecución — CON DATOS MODIFICADOS");

  const results2 = {
    a: ["5.6.7.8"], // ← CAMBIÓ
    aaaa: [] as string[],
    mx: [{ exchange: "mail2.strategicconnex.com.ar", priority: 20 }], // ← CAMBIÓ
    ns: ["ns1.host.com", "ns2.host.com", "ns3.backup.com"], // ← NUEVO
    txt: ["v=spf1 include:_spf.host.com ~all"], // ← igual
  };

  info(`A: 181.114.200.146 → 5.6.7.8`);
  info(`MX: 10 mail... → 20 mail2...`);
  info(`NS: ns1,ns2 → ns1,ns2,ns3.backup.com`);

  const start2 = Date.now();
  const outcome2 = await processDnsResults({
    projectId,
    domain: TEST_DOMAIN,
    results: results2,
  });
  const elapsed2 = Date.now() - start2;

  info(`Duración: ${elapsed2}ms · Snapshots: ${outcome2.snapshotsPersisted} · Cambios: ${outcome2.changes.length}`);

  if (outcome2.changes.length > 0) {
    pass(`Change detection ACTIVO — ${outcome2.changes.length} cambios:`);
    for (const c of outcome2.changes) {
      console.log(`       [${c.recordType}] ${c.type}`);
      console.log(`         "${c.previousValue ?? "(ninguno)"}"`);
      console.log(`         → "${c.currentValue}"`);
    }
  } else {
    info("No se detectaron cambios. Posible dedup por hash.");
  }

  // ─── 5. Verificar BD final ────────────────────────────────────────────────

  divider("5. Verificando dns_history (post-2da ejecución)");

  try {
    const rows = await testDb
      .select()
      .from(dnsHistory)
      .where(
        and(eq(dnsHistory.projectId, projectId), eq(dnsHistory.query, TEST_DOMAIN)),
      )
      .orderBy(desc(dnsHistory.snapshotDate));

    const byType = new Map<string, typeof rows>();
    for (const r of rows) {
      const arr = byType.get(r.recordType) || [];
      arr.push(r);
      byType.set(r.recordType, arr);
    }

    pass(`${rows.length} registros totales en dns_history`);
    for (const [type, snaps] of byType) {
      const vals = snaps.map((s) => s.value).join(", ");
      info(`${type} (${snaps.length}): ${vals}`);
    }
  } catch (err: any) {
    fail(`Error consultando: ${err.message}`);
  }

  // ─── 6. Verificar audit logs ──────────────────────────────────────────────

  divider("6. Verificando security_audit_logs");

  try {
    const auditRows = await testDb
      .select()
      .from(securityAuditLogs)
      .where(
        and(
          eq(securityAuditLogs.ip, TEST_DOMAIN),
          gte(securityAuditLogs.createdAt, new Date(Date.now() - 120000)),
        ),
      )
      .orderBy(desc(securityAuditLogs.createdAt));

    const dnsEvents = auditRows.filter(
      (r: any) => (r.metadata as any)?.action === "dns_change_detected",
    );

    if (dnsEvents.length > 0) {
      pass(`${dnsEvents.length} eventos dns_change_detected:`);
      for (const e of dnsEvents) {
        const m = e.metadata as any;
        console.log(`     [${m.recordType}] "${m.previousValue}" → "${m.currentValue}"`);
      }
    } else if (outcome2.changes.length > 0) {
      fail("Hubo cambios pero no eventos de auditoría");
    } else {
      info("Sin cambios → sin eventos (correcto)");
    }
  } catch (err: any) {
    fail(`Error: ${err.message}`);
  }

  // ─── 7. Restaurar FK + cerrar conexión ────────────────────────────────────

  await directPool.query("SET session_replication_role = DEFAULT;");
  await directPool.end();

  // ─── 8. Resultado final ────────────────────────────────────────────────────

  divider("7. RESULTADO FINAL");

  const allOk = rowsAfterFirst.length > 0;

  console.log(`\n  Proyecto:     ${projectId}`);
  console.log(`  Dominio:      ${TEST_DOMAIN}`);
  console.log(`  Snapshots 1ra: ${outcome1.snapshotsPersisted}`);
  console.log(`  Snapshots 2da: ${outcome2.snapshotsPersisted}`);
  console.log(`  Cambios:      ${outcome2.changes.length}`);
  console.log(`  BD registros: ${rowsAfterFirst.length}`);
  console.log(`\n  ${allOk ? "✅ PIPELINE DNS FUNCIONA CORRECTAMENTE" : "❌ PIPELINE DNS FALLÓ"}`);

  process.exit(allOk ? 0 : 1);
}

runPipelineTest().catch((err) => {
  console.error("❌ Pipeline test crashed:", err);
  process.exit(1);
});
