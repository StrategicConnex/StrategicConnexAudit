import { describe, it, expect } from "vitest";
import { getSeverityBadge, getScoreRating } from "./severity";

describe("getSeverityBadge", () => {
  it("mapea critical con colores destructivos", () => {
    expect(getSeverityBadge("critical")).toContain("text-destructive");
  });

  it("mapea high con destructive/80", () => {
    expect(getSeverityBadge("high")).toContain("text-destructive/80");
  });

  it("mapea medium con el color ámbar oklch", () => {
    expect(getSeverityBadge("medium")).toContain("oklch(75% 0.13 80)");
  });

  it("mapea low con primary", () => {
    expect(getSeverityBadge("low")).toContain("text-primary");
  });

  it("usa el estilo default para severidades desconocidas (info)", () => {
    const badge = getSeverityBadge("info");
    expect(badge).toContain("text-muted-fg");
    expect(badge).toContain("bg-muted/10");
  });

  it("es defensivo contra valores inesperados", () => {
    expect(getSeverityBadge("")).toContain("text-muted-fg");
    expect(getSeverityBadge("critical; DROP TABLE")).toContain("text-muted-fg");
  });
});

describe("getScoreRating", () => {
  it("clasifica 95 como A - Excelente", () => {
    const r = getScoreRating(95);
    expect(r.label).toBe("A - Excelente");
    expect(r.color).toContain("text-chartreuse");
  });

  it("clasifica 85 como B - Bueno", () => {
    expect(getScoreRating(85).label).toBe("B - Bueno");
  });

  it("clasifica 75 como C - Advertencia", () => {
    expect(getScoreRating(75).label).toBe("C - Advertencia");
  });

  it("clasifica 55 como D - Alto Riesgo", () => {
    expect(getScoreRating(55).label).toBe("D - Alto Riesgo");
  });

  it("clasifica 30 como F - Crítico", () => {
    expect(getScoreRating(30).label).toBe("F - Crítico");
  });

  it("respeta los límites exactos de cada banda", () => {
    expect(getScoreRating(90).label).toBe("A - Excelente");
    expect(getScoreRating(80).label).toBe("B - Bueno");
    expect(getScoreRating(70).label).toBe("C - Advertencia");
    expect(getScoreRating(50).label).toBe("D - Alto Riesgo");
    expect(getScoreRating(49).label).toBe("F - Crítico");
  });

  it("maneja score en los extremos", () => {
    expect(getScoreRating(0).label).toBe("F - Crítico");
    expect(getScoreRating(100).label).toBe("A - Excelente");
  });
});
