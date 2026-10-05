import { describe, it, expect } from "vitest";
import { healthFromIssueCounts } from "./health-score";

describe("healthFromIssueCounts", () => {
  it("sin issues → 100", () => {
    expect(healthFromIssueCounts(0, 0)).toBe(100);
  });

  it("críticos restan 15 y advertencias 5", () => {
    expect(healthFromIssueCounts(1, 0)).toBe(85);
    expect(healthFromIssueCounts(0, 4)).toBe(80);
    expect(healthFromIssueCounts(1, 3)).toBe(70);
  });

  it("nunca baja de 0", () => {
    expect(healthFromIssueCounts(10, 10)).toBe(0);
  });
});
