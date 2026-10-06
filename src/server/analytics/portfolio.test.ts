import { describe, it, expect } from "vitest";
import { buildPortfolio, meanResolutionHours, type ProjectRollupRow } from "./portfolio";

const T0 = new Date("2026-10-01T00:00:00.000Z");

function row(over: Partial<ProjectRollupRow> = {}): ProjectRollupRow {
  return {
    id: "p1",
    name: "Proyecto 1",
    domain: "uno.test",
    latestAuditAt: T0,
    criticalIssues: 0,
    warningIssues: 0,
    openBySeverity: {},
    closedFindings: 0,
    resolvedDurationsHours: [],
    ...over,
  };
}

describe("meanResolutionHours", () => {
  it("sin cierres devuelve null (no 0 horas)", () => {
    expect(meanResolutionHours([])).toBeNull();
  });

  it("promedia las duraciones en horas con un decimal", () => {
    expect(
      meanResolutionHours([
        { createdAt: T0, resolvedAt: new Date("2026-10-01T04:00:00.000Z") },
        { createdAt: T0, resolvedAt: new Date("2026-10-02T00:00:00.000Z") },
      ]),
    ).toBe(14);
  });

  it("descarta duraciones cero, negativas e inválidas", () => {
    expect(
      meanResolutionHours([
        { createdAt: T0, resolvedAt: T0 },
        { createdAt: T0, resolvedAt: new Date("2026-09-30T00:00:00.000Z") },
        { createdAt: "no-es-fecha", resolvedAt: T0 },
        { createdAt: T0, resolvedAt: new Date("2026-10-01T02:00:00.000Z") },
      ]),
    ).toBe(2);
  });
});

describe("buildPortfolio — score corporativo", () => {
  it("sin proyectos no inventa un score", () => {
    const report = buildPortfolio([]);
    expect(report.corporateScore).toBeNull();
    expect(report.projectCount).toBe(0);
    expect(report.worstProjects).toEqual([]);
    expect(report.mttrHours).toBeNull();
  });

  it("promedia solo los proyectos con auditoría completada", () => {
    const report = buildPortfolio([
      row({ id: "a", name: "A", criticalIssues: 0, warningIssues: 0 }), // 100
      row({ id: "b", name: "B", criticalIssues: 2, warningIssues: 0 }), // 70
      row({ id: "c", name: "C", latestAuditAt: null }), // sin datos
    ]);
    // (100 + 70) / 2 = 85. Si "C" valiera 0, sería 56.
    expect(report.corporateScore).toBe(85);
    expect(report.projectsWithoutData).toBe(1);
    expect(report.projectCount).toBe(3);
  });

  it("todos sin datos → corporateScore null y 0 en worstProjects", () => {
    const report = buildPortfolio([
      row({ id: "a", name: "A", latestAuditAt: null }),
      row({ id: "b", name: "B", latestAuditAt: null }),
    ]);
    expect(report.corporateScore).toBeNull();
    expect(report.worstProjects).toEqual([]);
    expect(report.projects.every((p) => p.healthScore === null)).toBe(true);
  });

  it("aplica la fórmula de salud compartida (100 - c*15 - w*5)", () => {
    const report = buildPortfolio([row({ criticalIssues: 1, warningIssues: 2 })]);
    expect(report.projects[0]!.healthScore).toBe(75);
  });
});

describe("buildPortfolio — hallazgos abiertos", () => {
  it("suma las severidades conocidas e ignora las que no existen", () => {
    const report = buildPortfolio([
      row({ openBySeverity: { critical: 2, high: 3, medium: 1, low: 5, info: 4, bogus: 99 } }),
    ]);
    const p = report.projects[0]!;
    expect(p.openFindings).toBe(15);
    expect(p.openCritical).toBe(2);
    expect(report.totalOpenFindings).toBe(15);
    expect(report.totalOpenCritical).toBe(2);
    expect(report.openBySeverity).toEqual({ critical: 2, high: 3, medium: 1, low: 5, info: 4 });
  });

  it("ignora conteos negativos o no numéricos", () => {
    const report = buildPortfolio([
      row({ openBySeverity: { critical: -3, high: Number.NaN, medium: 2 } }),
    ]);
    expect(report.projects[0]!.openFindings).toBe(2);
  });
});

describe("buildPortfolio — top de peor postura", () => {
  it("ordena por score ascendente y deja los sin datos al final", () => {
    const report = buildPortfolio([
      row({ id: "a", name: "Sano", criticalIssues: 0, warningIssues: 0 }), // 100
      row({ id: "b", name: "Malo", criticalIssues: 5, warningIssues: 0 }), // 25
      row({ id: "c", name: "Medio", criticalIssues: 3, warningIssues: 4 }), // 35
      row({ id: "d", name: "Sin datos", latestAuditAt: null }),
    ]);
    expect(report.projects.map((p) => p.name)).toEqual(["Malo", "Medio", "Sano", "Sin datos"]);
    // worstProjects excluye el sin-datos: no es "el peor", es "el desconocido".
    expect(report.worstProjects.map((p) => p.name)).toEqual(["Malo", "Medio", "Sano"]);
  });

  it("corta a 5 proyectos", () => {
    const rows = Array.from({ length: 9 }, (_, i) =>
      row({ id: `p${i}`, name: `P${i}`, criticalIssues: i })
    );
    expect(buildPortfolio(rows).worstProjects).toHaveLength(5);
  });
});

describe("buildPortfolio — MTTR agregado", () => {
  it("pondera por número de cierres", () => {
    const report = buildPortfolio([
      row({
        id: "a",
        name: "A",
        closedFindings: 3,
        resolvedDurationsHours: Array.from({ length: 3 }, () => ({
          createdAt: T0,
          resolvedAt: new Date("2026-10-01T02:00:00.000Z"), // 2h
        })),
      }),
      row({
        id: "b",
        name: "B",
        closedFindings: 1,
        resolvedDurationsHours: [{ createdAt: T0, resolvedAt: new Date("2026-10-02T00:00:00.000Z") }], // 24h
      }),
    ]);
    // (2*3 + 24*1) / 4 = 7.5
    expect(report.mttrHours).toBe(7.5);
  });

  it("sin cierres en toda la cartera → null", () => {
    expect(buildPortfolio([row()]).mttrHours).toBeNull();
  });
});

describe("buildPortfolio — serialización", () => {
  it("expone lastAuditAt como ISO y null si no hay", () => {
    const report = buildPortfolio([
      row({ id: "a", latestAuditAt: T0 }),
      row({ id: "b", latestAuditAt: null }),
    ]);
    expect(report.projects.find((p) => p.id === "a")!.lastAuditAt).toBe(T0.toISOString());
    expect(report.projects.find((p) => p.id === "b")!.lastAuditAt).toBeNull();
  });

  it("acepta las fechas como string (lo que devuelve el driver)", () => {
    const report = buildPortfolio([row({ latestAuditAt: "2026-10-01T00:00:00.000Z" })]);
    expect(report.projects[0]!.lastAuditAt).toBe("2026-10-01T00:00:00.000Z");
  });
});