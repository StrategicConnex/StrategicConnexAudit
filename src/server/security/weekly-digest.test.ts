import { describe, it, expect } from "vitest";
import { digestSeverity } from "./weekly-digest";

describe("weekly-digest — severidad (P2-5)", () => {
  it("crítica con issues críticas aunque el uptime sea 100", () => {
    expect(digestSeverity(100, 2)).toBe("critical");
  });

  it("crítica con uptime bajo 95 sin issues", () => {
    expect(digestSeverity(94.9, 0)).toBe("critical");
  });

  it("info con uptime alto y sin issues", () => {
    expect(digestSeverity(99.5, 0)).toBe("info");
  });

  it("info sin datos de uptime ni issues", () => {
    expect(digestSeverity(null, 0)).toBe("info");
  });
});
