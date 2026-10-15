// @vitest-environment node
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import {
  RETENTION_TARGETS,
  RETENTION_MIGRATION,
  RETENTION_DAYS,
  predicateFor,
  buildAnalyzeSql,
  buildExplainSql,
  classifyPlan,
  verdictFor,
  median,
} from "../../scripts/lib/retention-plans.mjs";

/**
 * Regresión de P2-14 (retención de tablas de inteligencia). Protege tres
 * acoplamientos que ningún guard cubría y que fallan en silencio:
 *
 *   1. el índice declarado en la migración 0051 y el DELETE que corre de verdad
 *      en `cleanup.trigger.ts` tienen que seguir siendo la MISMA tabla y la
 *      misma columna — un índice huérfano no acelera nada y no pone nada en rojo;
 *   2. la verificación no puede borrar datos: `EXPLAIN ANALYZE` sobre un DELETE
 *      *ejecuta* el DELETE, así que va obligado en BEGIN/ROLLBACK;
 *   3. la matriz de veredictos no puede confundir «tabla pequeña, el índice aún
 *      no compensa» con «el índice no cubre el predicado» — la primera es
 *      normal y la segunda es una regresión.
 */

const ROOT = process.cwd();
const MIGRATIONS_DIR = path.join(ROOT, "drizzle");
const JOURNAL = path.join(MIGRATIONS_DIR, "meta", "_journal.json");
const CLI = path.join(ROOT, "scripts/db/retention-index-check.mjs");
const CLEANUP = path.join(ROOT, "src/trigger/cleanup.trigger.ts");

const migrationSql = fs.readFileSync(
  path.join(MIGRATIONS_DIR, `${RETENTION_MIGRATION}.sql`),
  "utf8"
);
const cliSrc = fs.readFileSync(CLI, "utf8");
const cleanupSrc = fs.readFileSync(CLEANUP, "utf8");

/** Quita comentarios SQL/TS: una mención en prosa no es una sentencia. */
const sinComentariosSql = (sql: string) =>
  sql.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/--[^\n]*/g, " ");
const sinComentariosTs = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\n]*/g, " ");

/** Tabla Postgres → constante de Drizzle usada por `cleanup.trigger.ts`. */
const DRIZZLE_CONST = {
  app_logs: "appLogs",
  intelligence_run_events: "intelligenceRunEvents",
  intelligence_tool_runs: "intelligenceToolRuns",
  intelligence_usage_events: "intelligenceUsageEvents",
};

describe("P2-14 — migración 0051: índices declarados", () => {
  it("declara los 4 índices de retención, idempotentes, btree sobre created_at", () => {
    const limpio = sinComentariosSql(migrationSql);

    for (const { table, index } of RETENTION_TARGETS) {
      // IF NOT EXISTS es lo que hace la migración re-ejecutable sobre una BD que
      // ya tiene el índice (el repo ya pagó una vez el coste de no serlo).
      const declarado = new RegExp(
        `CREATE INDEX IF NOT EXISTS ${index}\\s+ON public\\.${table} USING btree \\(created_at\\)`,
        "i"
      );
      expect(limpio, `${index} no declarado sobre ${table}(created_at)`).toMatch(declarado);
      expect(limpio.match(new RegExp(index, "g"))).toHaveLength(1);
    }
  });

  it("está registrada en el journal de drizzle", () => {
    const journal = JSON.parse(fs.readFileSync(JOURNAL, "utf8")) as {
      entries: { tag: string }[];
    };
    expect(journal.entries.map((e) => e.tag)).toContain(RETENTION_MIGRATION);
  });

  it("el SQL que imprime la verificación cubre las 4 tablas y la ventana de 30 días", () => {
    const analyze = buildAnalyzeSql();
    const explain = buildExplainSql();

    for (const { table } of RETENTION_TARGETS) {
      expect(analyze).toContain(`ANALYZE ${table};`);
      expect(explain).toContain(`DELETE FROM ${table}`);
    }
    // EXPLAIN (ANALYZE, ...) sobre un DELETE sin ventana borraría la tabla entera.
    expect(explain.match(/DELETE FROM/g)).toHaveLength(RETENTION_TARGETS.length);
    expect(predicateFor()).toBe("created_at < now() - interval '30 days'");
  });
});

describe("P2-14 — índice ↔ DELETE de producción", () => {
  const limpio = sinComentariosTs(cleanupSrc);

  it("cada tabla indexada es una tabla que `cleanup.trigger.ts` borra de verdad", () => {
    for (const { table } of RETENTION_TARGETS) {
      const constante = DRIZZLE_CONST[table as keyof typeof DRIZZLE_CONST];
      expect(constante, `sin constante Drizzle mapeada para ${table}`).toBeDefined();
      // Un índice sobre una tabla que nadie purga es coste de escritura sin
      // beneficio: el par índice/task tiene que seguir siendo el mismo.
      expect(limpio).toContain(`db.delete(${constante})`);
      expect(limpio).toContain(`lt(${constante}.createdAt, thirtyDaysAgo)`);
    }
  });

  it("la ventana verificada (30 días) es la que aplica la task", () => {
    expect(RETENTION_DAYS).toBe(30);
    expect(limpio).toMatch(/thirtyDaysAgo\.setDate\(thirtyDaysAgo\.getDate\(\) - 30\)/);
  });
});

describe("P2-14 — la verificación no puede borrar filas", () => {
  // Los escaneos de sentencias van sobre el fuente SIN comentarios: el
  // encabezado del script menciona `CREATE INDEX` y `EXPLAIN ANALYZE DELETE`
  // en prosa, y una mención no es una sentencia.
  const cliCodigo = sinComentariosTs(cliSrc);

  it("envuelve el EXPLAIN ANALYZE DELETE en BEGIN/ROLLBACK", () => {
    expect(cliSrc).toContain('await client.query("begin")');
    expect(cliSrc).toContain('await client.query("rollback")');
    // Con un COMMIT el DELETE se confirmaría; el script no debe tener ninguno.
    expect(cliSrc).not.toMatch(/client\.query\("commit"/);
  });

  it("todo `delete from` del CLI va dentro de un EXPLAIN", () => {
    const lineas = cliCodigo.split("\n").filter((l) => /delete from/i.test(l));
    expect(lineas.length).toBeGreaterThan(0);
    for (const linea of lineas) {
      expect(linea, `DELETE sin EXPLAIN: ${linea.trim()}`).toMatch(/explain\s*\(/i);
    }
  });

  it("no repara ni altera el esquema: sólo lee pg_indexes/pg_stat y ejecuta ANALYZE", () => {
    expect(cliCodigo).not.toMatch(/\bdrop index\b/i);
    expect(cliCodigo).not.toMatch(/\btruncate\b/i);
    expect(cliCodigo).not.toMatch(/\balter table\b/i);

    // El benchmark SÍ crea un índice, pero sólo sobre tablas temporales con
    // `on commit drop`: no toca el esquema de ninguna tabla real. Un CREATE
    // INDEX que apuntara a `app_logs` o a `intelligence_*` sería el script
    // reparando producción por su cuenta, que es justo lo que no debe hacer.
    // El benchmark usa UNA plantilla parametrizada por nombre (de ahí una sola
    // aparición en el fuente) y toda tabla creada es `temp` con `on commit
    // drop`: nada sobrevive a la transacción, ni siquiera si el ROLLBACK
    // llegara a faltar.
    const creates = cliCodigo.match(/create (?:temp )?table/gi) ?? [];
    expect(creates).toHaveLength(1);
    expect(creates.every((c) => /create temp table/i.test(c))).toBe(true);
    expect(cliCodigo).toMatch(/create temp table[\s\S]{0,400}?on commit drop/i);
    for (const linea of cliCodigo.split("\n").filter((l) => /create index/i.test(l))) {
      expect(linea, `CREATE INDEX fuera de una tabla temporal: ${linea.trim()}`).toMatch(/bench_/);
    }
  });

  it("sale con 2 (no con 0) cuando no puede verificar, y con 1 ante una regresión", () => {
    // Un guard que devolviera 0 al no poder conectarse sería peor que ninguno:
    // CI lo leería como «los 4 índices están en producción».
    expect(cliSrc).toMatch(/process\.exit\(2\)/);
    // Y un veredicto en ❌ tiene que traducirse en rojo, no en verde.
    expect(cliSrc).toMatch(/process\.exit\(report\.ok \? 0 : 1\)/);
  });

  it("falla de verdad contra una base inalcanzable (exit 2, ni 0 ni 1)", () => {
    // El DSN del entorno gana sobre `.env.local`; el puerto 1 en loopback falla
    // al instante, así que la prueba no depende de la red ni de credenciales.
    let status = 0;
    try {
      execFileSync(process.execPath, ["scripts/db/retention-index-check.mjs"], {
        cwd: ROOT,
        env: { ...process.env, DIRECT_URL: "postgresql://x:x@127.0.0.1:1/x", DATABASE_URL: "" },
        stdio: "pipe",
        timeout: 15_000,
      });
    } catch (error) {
      status = (error as { status?: number }).status ?? -1;
    }
    expect(status).toBe(2);
  });
});

describe("P2-14 — parser de planes y veredictos", () => {
  const planIndex = [
    "Delete on app_logs  (cost=0.28..8.30 rows=1 width=6) (actual time=0.030..0.030 rows=0 loops=1)",
    "  Buffers: shared hit=3",
    "  ->  Index Scan using idx_app_logs_created_at on app_logs  (cost=0.28..8.30 rows=1 width=6) (actual time=0.015..0.015 rows=0 loops=1)",
    "        Index Cond: (created_at < (now() - '30 days'::interval))",
    "Planning Time: 0.365 ms",
    "Execution Time: 3.209 ms",
  ].join("\n");

  const planSeq = [
    "Delete on intelligence_tool_runs  (cost=0.00..12.40 rows=1 width=6)",
    "  Buffers: shared hit=1 read=2 written=3",
    "  ->  Seq Scan on intelligence_tool_runs",
    "Execution Time: 0.046 ms",
  ].join("\n");

  const planBitmap = [
    "Delete on bench_with_index",
    "  Buffers: local hit=6645",
    "  ->  Bitmap Heap Scan on bench_with_index",
    "        ->  Bitmap Index Scan on bench_with_index_created_at",
    "Execution Time: 9.363 ms",
  ].join("\n");

  it("distingue index scan, bitmap y seq scan, y suma los buffers", () => {
    expect(classifyPlan(planIndex)).toMatchObject({
      indexNames: ["idx_app_logs_created_at"],
      seqScan: false,
      bitmap: false,
      execTime: 3.209,
      buffers: 3,
    });
    expect(classifyPlan(planSeq)).toMatchObject({ indexNames: [], seqScan: true, buffers: 6 });
    // Un bitmap usa el índice y NO es un seq scan: confundirlos daría un falso
    // positivo de regresión en tablas grandes.
    expect(classifyPlan(planBitmap)).toMatchObject({
      indexNames: ["bench_with_index_created_at"],
      seqScan: false,
      bitmap: true,
      buffers: 6645,
    });
  });

  it("un plan sin la línea de buffers no inventa un número", () => {
    expect(classifyPlan("Seq Scan on x\nExecution Time: 1.5 ms").buffers).toBeUndefined();
  });

  it("matriz de veredictos: tabla pequeña ≠ índice que no sirve", () => {
    const seq = classifyPlan(planSeq);
    const idxScan = classifyPlan(planIndex);

    expect(verdictFor({ indexExists: false, plan: null })).toMatchObject({ status: "fail" });
    expect(verdictFor({ indexExists: true, plan: idxScan })).toMatchObject({ status: "ok" });
    // Seq scan con el índice forzado: el índice SÍ cubre el predicado.
    expect(verdictFor({ indexExists: true, plan: seq, forcedPlan: idxScan })).toMatchObject({
      status: "ok",
    });
    // Ni forzado: el predicado no está cubierto → regresión de P2-14.
    expect(verdictFor({ indexExists: true, plan: seq, forcedPlan: seq })).toMatchObject({
      status: "fail",
    });
    // Sin plan no se puede afirmar nada, y afirmar «ok» sería el fallo caro.
    expect(verdictFor({ indexExists: true, plan: null })).toMatchObject({ status: "warn" });
  });

  it("mediana impar y par sin mutar la entrada", () => {
    const entrada = [124.8, 120.8, 124.7];
    expect(median(entrada)).toBeCloseTo(124.7, 5);
    expect(entrada).toEqual([124.8, 120.8, 124.7]);
    expect(median([10, 20, 30, 40])).toBeCloseTo(25, 5);
    expect(median([9.363])).toBeCloseTo(9.363, 5);
  });
});
