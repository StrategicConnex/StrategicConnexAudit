import { describe, it, expect } from "vitest";
import { computeVitalStatuses, computePerfScore, uptimeBadge } from "./project-scores";

const ZERO = { LCP: 0, CLS: 0, FCP: 0, INP: 0, errorCount: 0, TTFB: 0 };

describe("computeVitalStatuses — sin telemetría no se presume 'good'", () => {
  it("con cero eventos RUM, errStatus es 'none' (bug: RENDIMIENTO 100%)", () => {
    expect(computeVitalStatuses(ZERO, 0).errStatus).toBe("none");
  });

  it("con eventos reales y sin errores, errStatus es 'good'", () => {
    expect(computeVitalStatuses(ZERO, 10).errStatus).toBe("good");
  });

  it("con errores aplica los umbrales needs-improvement/poor", () => {
    expect(computeVitalStatuses({ ...ZERO, errorCount: 3 }, 10).errStatus).toBe(
      "needs-improvement"
    );
    expect(computeVitalStatuses({ ...ZERO, errorCount: 7 }, 10).errStatus).toBe("poor");
  });

  it("sin datos, todas las señales son 'none'", () => {
    const statuses = computeVitalStatuses(ZERO, 0);
    expect(statuses.lcpStatus).toBe("none");
    expect(statuses.clsStatus).toBe("none");
    expect(statuses.fcpStatus).toBe("none");
    expect(statuses.inpStatus).toBe("none");
    expect(statuses.errStatus).toBe("none");
    expect(statuses.memStatus).toBe("none");
  });
});

describe("computePerfScore", () => {
  it("solo señales sin dato → null, jamás 100%", () => {
    expect(computePerfScore(["none", "none", "none"])).toBeNull();
  });

  it("proyecto sin telemetría → null vía computeVitalStatuses (regresión del 100%)", () => {
    const statuses = computeVitalStatuses(ZERO, 0);
    expect(computePerfScore(Object.values(statuses))).toBeNull();
  });

  it("media ponderada: good=1, needs-improvement=0.5, poor=0", () => {
    expect(computePerfScore(["good", "good"])).toBe(100);
    expect(computePerfScore(["good", "needs-improvement"])).toBe(75);
    expect(computePerfScore(["good", "poor"])).toBe(50);
    expect(computePerfScore(["good", "none"])).toBe(100);
  });
});

describe("uptimeBadge — 'unknown' no es 'Servidor Offline'", () => {
  it("sin chequeos de uptime → 'Sin datos' en neutro", () => {
    const badge = uptimeBadge("unknown");
    expect(badge.label).toBe("Sin datos");
    expect(badge.dotClassName).not.toContain("danger");
    expect(badge.dotClassName).not.toContain("success");
  });

  it("'up' → 'Servidor Online' en verde", () => {
    const badge = uptimeBadge("up");
    expect(badge.label).toBe("Servidor Online");
    expect(badge.dotClassName).toContain("success");
  });

  it("'down' → 'Servidor Offline' en rojo", () => {
    const badge = uptimeBadge("down");
    expect(badge.label).toBe("Servidor Offline");
    expect(badge.dotClassName).toContain("danger");
  });
});
