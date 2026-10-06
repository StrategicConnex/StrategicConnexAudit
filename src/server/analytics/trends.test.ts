import { describe, it, expect } from "vitest";
import {
  buildTrends,
  bucketStart,
  clampToWindow,
  isTrendBucket,
  mttrSeries,
  scoreSeries,
  uptimeSeries,
  windowRange,
  type ScorePointRow,
} from "./trends";

const audit = (completedAt: string, criticalIssues = 0, warningIssues = 0): ScorePointRow => ({
  auditId: `a-${completedAt}`,
  projectId: "p1",
  completedAt,
  criticalIssues,
  warningIssues,
});

describe("isTrendBucket", () => {
  it("acepta los tres buckets del framework y rechaza el resto", () => {
    expect(isTrendBucket("day")).toBe(true);
    expect(isTrendBucket("week")).toBe(true);
    expect(isTrendBucket("month")).toBe(true);
    expect(isTrendBucket("hour")).toBe(false);
    expect(isTrendBucket("")).toBe(false);
  });
});

describe("bucketStart", () => {
  it("day trunca a medianoche UTC", () => {
    expect(new Date(bucketStart("2026-10-05T17:43:12.000Z", "day")).toISOString()).toBe(
      "2026-10-05T00:00:00.000Z",
    );
  });

  it("week trunca al lunes de esa semana ISO", () => {
    // 2026-10-07 es miércoles; su lunes es 2026-10-05.
    expect(new Date(bucketStart("2026-10-07T09:00:00.000Z", "week")).toISOString()).toBe(
      "2026-10-05T00:00:00.000Z",
    );
    // Domingo 2026-10-11 sigue en la semana que empieza el lunes 05.
    expect(new Date(bucketStart("2026-10-11T23:00:00.000Z", "week")).toISOString()).toBe(
      "2026-10-05T00:00:00.000Z",
    );
    // Lunes 12 abre una semana nueva.
    expect(new Date(bucketStart("2026-10-12T00:00:01.000Z", "week")).toISOString()).toBe(
      "2026-10-12T00:00:00.000Z",
    );
  });

  it("month trunca al día 1 del mes", () => {
    expect(new Date(bucketStart("2026-10-31T23:59:59.000Z", "month")).toISOString()).toBe(
      "2026-10-01T00:00:00.000Z",
    );
  });
});

describe("scoreSeries", () => {
  it("promedia el score de salud de las auditorías del bucket", () => {
    const points = scoreSeries(
      [
        audit("2026-10-01T10:00:00.000Z", 0, 0), // 100
        audit("2026-10-01T18:00:00.000Z", 2, 0), // 70
        audit("2026-10-03T10:00:00.000Z", 1, 0), // 85
      ],
      "day",
    );
    expect(points).toHaveLength(2);
    expect(points[0]!.score).toBe(85);
    expect(points[0]!.audits).toBe(2);
    expect(points[1]!.score).toBe(85);
  });

  it("devuelve vacío (no un 0) sin auditorías", () => {
    expect(scoreSeries([], "day")).toEqual([]);
  });

  it("descarta auditorías con fecha inválida", () => {
    expect(scoreSeries([audit("no-es-fecha")], "day")).toEqual([]);
  });

  it("ordena los buckets cronológicamente", () => {
    const points = scoreSeries(
      [audit("2026-10-03T10:00:00.000Z"), audit("2026-10-01T10:00:00.000Z")],
      "day",
    );
    expect(points.map((p) => new Date(p.bucketStart).toISOString().slice(0, 10))).toEqual([
      "2026-10-01",
      "2026-10-03",
    ]);
  });
});

describe("mttrSeries", () => {
  it("promedia las horas de cierre por bucket", () => {
    const points = mttrSeries(
      [
        { createdAt: "2026-10-01T00:00:00.000Z", resolvedAt: "2026-10-01T02:00:00.000Z" },
        { createdAt: "2026-10-01T00:00:00.000Z", resolvedAt: "2026-10-01T04:00:00.000Z" },
        { createdAt: "2026-10-02T00:00:00.000Z", resolvedAt: "2026-10-03T00:00:00.000Z" },
      ],
      "day",
    );
    expect(points[0]!.mttrHours).toBe(3);
    expect(points[0]!.resolved).toBe(2);
    expect(points[1]!.mttrHours).toBe(24);
  });

  it("descarta cierres imposibles (resuelto antes de crearse)", () => {
    expect(
      mttrSeries([{ createdAt: "2026-10-02T00:00:00.000Z", resolvedAt: "2026-10-01T00:00:00.000Z" }], "day"),
    ).toEqual([]);
  });
});

describe("uptimeSeries", () => {
  it("calcula el porcentaje de checks con isUp", () => {
    const points = uptimeSeries(
      [
        { isUp: true, checkedAt: "2026-10-01T00:00:00.000Z" },
        { isUp: false, checkedAt: "2026-10-01T00:30:00.000Z" },
        { isUp: true, checkedAt: "2026-10-01T01:00:00.000Z" },
      ],
      "day",
    );
    expect(points[0]).toMatchObject({ checks: 3, up: 2, uptimePct: 66.7 });
  });

  it("un bucket sin checks reporta null, no 0%", () => {
    expect(uptimeSeries([], "day")).toEqual([]);
  });
});

describe("buildTrends", () => {
  const input = {
    audits: [audit("2026-10-01T10:00:00.000Z", 0, 0), audit("2026-10-03T10:00:00.000Z", 2, 0)],
    resolvedFindings: [{ createdAt: "2026-10-01T00:00:00.000Z", resolvedAt: "2026-10-01T06:00:00.000Z" }],
    stillOpen: 7,
    uptimeSamples: [{ isUp: true, checkedAt: "2026-10-01T00:00:00.000Z" }],
    bucket: "day" as const,
  };

  it("sin nada medido devuelve una serie vacía con las métricas en null", () => {
    const report = buildTrends({
      audits: [],
      resolvedFindings: [],
      stillOpen: 0,
      uptimeSamples: [],
      bucket: "day",
    });
    expect(report.points).toEqual([]);
    expect(report.latestScore).toBeNull();
    expect(report.scoreDelta).toBeNull();
    expect(report.direction).toBe("unknown");
    expect(report.uptimePct).toBeNull();
    expect(report.resolvedInWindow).toBe(0);
  });

  it("alinea las tres series en los mismos buckets", () => {
    const report = buildTrends(input);
    const dates = report.points.map((p) => p.bucketStart.slice(0, 10));
    expect(dates).toEqual(["2026-10-01", "2026-10-03"]);
    expect(report.points[0]!.mttrHours).toBe(6);
    // El bucket del 03 tiene auditoría pero ninguna resolución: mttr null.
    expect(report.points[1]!.score).toBe(70);
    expect(report.points[1]!.mttrHours).toBeNull();
    expect(report.points[1]!.resolved).toBe(0);
  });

  it("detecta la dirección del score contra el punto anterior", () => {
    expect(buildTrends(input).direction).toBe("down");
    expect(buildTrends(input).scoreDelta).toBe(-30);
    expect(buildTrends(input).latestScore).toBe(70);
  });

  it("con un solo punto con score no hay delta (no 0)", () => {
    const report = buildTrends({ ...input, audits: [input.audits[0]!] });
    expect(report.latestScore).toBe(100);
    expect(report.scoreDelta).toBeNull();
    expect(report.direction).toBe("unknown");
  });

  it("un bucket con solo uptime no inventa score 0", () => {
    const report = buildTrends({
      audits: [],
      resolvedFindings: [],
      stillOpen: 3,
      uptimeSamples: [{ isUp: false, checkedAt: "2026-10-05T00:00:00.000Z" }],
      bucket: "day",
    });
    expect(report.points[0]!.score).toBeNull();
    expect(report.points[0]!.audits).toBe(0);
    expect(report.latestScore).toBeNull();
    expect(report.uptimePct).toBe(0);
  });

  it("reporta cobertura de la serie (cuántos buckets tienen cada medida)", () => {
    const report = buildTrends(input);
    expect(report.coverage.buckets).toBe(2);
    expect(report.coverage.withScore).toBe(2);
    expect(report.coverage.withUptime).toBe(1);
  });

  it("acumula los resueltos y los que siguen abiertos", () => {
    const report = buildTrends(input);
    expect(report.resolvedInWindow).toBe(1);
    expect(report.stillOpen).toBe(7);
  });
});

describe("clampToWindow / windowRange", () => {
  const series = [
    { bucketStart: "2026-10-01T00:00:00.000Z" },
    { bucketStart: "2026-10-02T00:00:00.000Z" },
    { bucketStart: "2026-10-03T00:00:00.000Z" },
  ];

  it("recorta a los últimos N puntos", () => {
    expect(clampToWindow(series, "day", 2)).toHaveLength(2);
    expect(clampToWindow(series, "day", 2)[1]!.bucketStart).toBe("2026-10-03T00:00:00.000Z");
  });

  it("respeta el mínimo de puntos aunque la ventana sea 0", () => {
    expect(clampToWindow(series, "day", 0, 2)).toHaveLength(2);
  });

  it("no inventa puntos si la serie es más corta que la ventana", () => {
    expect(clampToWindow([series[0]!], "day", 30)).toHaveLength(1);
  });

  it("windowRange devuelve el rango en ISO", () => {
    const now = new Date("2026-10-10T00:00:00.000Z").getTime();
    const range = windowRange("day", 7, now);
    expect(range.to).toBe("2026-10-10T00:00:00.000Z");
    expect(new Date(range.from).getTime()).toBe(now - 7 * 86_400_000);
  });
});