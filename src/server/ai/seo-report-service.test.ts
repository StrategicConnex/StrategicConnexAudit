import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Regresión del dato fabricado en el reporte SEO.
 *
 * El servicio usaba constantes inventadas (`healthScore` 85/45 y
 * `crawledCount` 142) en lugar de leer los conteos reales, de modo que el
 * informe afirmaba un score y un número de URLs rastreadas que nunca se
 * habían medido. Estos tests fijan que el reporte sale de la base.
 */

// ─── Mocks ──────────────────────────────────────────────────────────────────

/** Filas que el mock de `withRLS` devuelve para cada tabla consultada. */
const rows = {
  projects: [] as unknown[],
  gsc: [] as unknown[],
  ga4: [] as unknown[],
  audits: [] as unknown[],
  keywordsCount: [] as unknown[],
  crawlCount: [] as unknown[],
  issues: [] as unknown[],
};

vi.mock("@/lib/logger", () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

/**
 * Drizzle real no acepta las columnas string del mock de schemas: `eq()`
 * recibiría un string donde espera una Column y lanzaría. Se sustituye por
 * funciones de identidad — el test no ejercita el SQL, solo la aritmética del
 * reporte.
 */
vi.mock("drizzle-orm", () => ({
  eq: (col: unknown, val: unknown) => ({ col, val }),
  and: (...conds: unknown[]) => conds,
  or: (...conds: unknown[]) => conds,
  desc: (col: unknown) => ({ col, dir: "desc" }),
  asc: (col: unknown) => ({ col, dir: "asc" }),
  sql: (strings: TemplateStringsArray, ...values: unknown[]) => ({
    text: strings.join("?"),
    values,
  }),
}));

/**
 * `withRLS` entrega el callback un tx encadenable. Cada `.select()` encadenado
 * corresponde, en orden, a las consultas del servicio: proyecto, GSC, GA4,
 * auditoría, keywords, crawl_results e issues.
 */
function makeTx() {
  const queue = [
    rows.projects,
    rows.gsc,
    rows.ga4,
    rows.audits,
    rows.keywordsCount,
    rows.crawlCount,
    rows.issues,
  ];
  let call = 0;
  const builder: Record<string, unknown> = {};
  for (const method of ["where", "orderBy", "limit", "groupBy", "from"]) {
    builder[method] = () => builder;
  }
  builder.then = (resolve: (v: unknown[]) => unknown, reject?: (e: unknown) => unknown) =>
    Promise.resolve(queue[call++] ?? []).then(resolve, reject);
  // El servicio llama `tx.select()`; cada llamada entrega el siguiente
  // resultado de la cola.
  return { select: () => builder };
}

vi.mock("@/shared/db/rls", () => ({
  withRLS: async (_userId: string, cb: (tx: unknown) => Promise<unknown>) =>
    cb(makeTx()),
}));

// El router siempre falla: así se ejercita el reporte de respaldo, que es
// donde se imprimían las constantes inventadas.
const mockCallAI = vi.fn();
vi.mock("@/server/ai/ai-router", () => ({
  callAIWithFallback: (...args: unknown[]) => mockCallAI(...args),
}));

vi.mock("@/shared/db/schemas", () => ({
  projects: { id: "id", ownerId: "owner_id", name: "name", domain: "domain" },
  audits: { id: "id", projectId: "project_id", status: "status", createdAt: "created_at" },
  integrationDataGsc: { projectId: "project_id", date: "date" },
  integrationDataGa4: { projectId: "project_id", date: "date" },
  keywordTargets: { projectId: "project_id" },
  crawlResults: { auditId: "audit_id" },
  issues: { auditId: "audit_id", severity: "severity" },
}));

// ─── Tests ──────────────────────────────────────────────────────────────────

describe("generateSeoReport — datos reales, no inventados", () => {
  let generateSeoReport: typeof import("./seo-report-service").generateSeoReport;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockCallAI.mockResolvedValue({ success: false });
    generateSeoReport = (await import("./seo-report-service")).generateSeoReport;
  });

  it("usa el conteo real de URLs rastreadas y el score derivado de los issues", async () => {
    rows.projects = [{ id: "p1", ownerId: "u1", name: "Cliente Acme", domain: "acme.test" }];
    rows.gsc = [];
    rows.ga4 = [];
    rows.audits = [{ id: "a1", projectId: "p1", status: "completed" }];
    rows.keywordsCount = [{ count: 0 }];
    rows.crawlCount = [{ count: 37 }];
    rows.issues = [
      { severity: "critical", count: 2 },
      { severity: "warning", count: 1 },
    ];

    const outcome = await generateSeoReport("p1", "u1");

    expect(outcome.ok).toBe(true);
    const report = outcome.ok ? outcome.report : "";

    // 37 URLs reales, no las 142 inventadas.
    expect(report).toContain("37");
    expect(report).not.toContain("142");
    // 100 - 2 criticos*15 - 1 warning*5 = 65, no el 85 inventado.
    expect(report).toContain("65");
    expect(report).not.toContain("85");
  });

  it("no inventa un score cuando no hay auditoría completada", async () => {
    rows.projects = [{ id: "p1", ownerId: "u1", name: "Cliente Acme", domain: "acme.test" }];
    rows.gsc = [];
    rows.ga4 = [];
    rows.audits = [{ id: "a1", projectId: "p1", status: "running" }];
    rows.keywordsCount = [{ count: 0 }];
    rows.crawlCount = [{ count: 0 }];
    rows.issues = [];

    const outcome = await generateSeoReport("p1", "u1");

    expect(outcome.ok).toBe(true);
    const report = outcome.ok ? outcome.report : "";

    // Sin auditoría completada no se publica puntuación alguna.
    expect(report).not.toContain("/ 100");
    expect(report).not.toContain("# 🏆 45");
  });

  it("un proyecto sin auditorías no muestra score ni URLs rastreadas inventadas", async () => {
    rows.projects = [{ id: "p1", ownerId: "u1", name: "Nuevo", domain: "nuevo.test" }];
    rows.gsc = [];
    rows.ga4 = [];
    rows.audits = [];
    rows.keywordsCount = [{ count: 0 }];
    rows.crawlCount = [{ count: 0 }];
    rows.issues = [];

    const outcome = await generateSeoReport("p1", "u1");

    expect(outcome.ok).toBe(true);
    const report = outcome.ok ? outcome.report : "";

    expect(report).not.toContain("142");
    expect(report).not.toContain("/ 100");
  });
});
