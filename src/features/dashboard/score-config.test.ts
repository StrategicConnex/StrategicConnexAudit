import { describe, expect, it } from "vitest";
import { getScoreConfig, type TierColors } from "./score-config";

const TIERS: TierColors = { success: "#22c55e", warning: "#eab308", danger: "#ef4444" };

describe("getScoreConfig", () => {
  it(">=85 -> Excelente con color success", () => {
    const cfg = getScoreConfig(90, TIERS);
    expect(cfg.label).toBe("Excelente");
    expect(cfg.color).toBe("#22c55e");
    expect(cfg.textColor).toBe("text-chart-success");
  });

  it("70-84 -> Bueno con color success", () => {
    const cfg = getScoreConfig(75, TIERS);
    expect(cfg.label).toBe("Bueno");
    expect(cfg.color).toBe("#22c55e");
  });

  it("50-69 -> Advertencia con color warning (ámbar semántico)", () => {
    const cfg = getScoreConfig(60, TIERS);
    expect(cfg.label).toBe("Advertencia");
    expect(cfg.color).toBe("#eab308");
    expect(cfg.textColor).toBe("text-chart-warning");
  });

  it("30-49 -> Crítico con color danger", () => {
    const cfg = getScoreConfig(40, TIERS);
    expect(cfg.label).toBe("Crítico");
    expect(cfg.color).toBe("#ef4444");
    expect(cfg.textColor).toBe("text-destructive");
  });

  it("<30 -> Peligro con color danger", () => {
    const cfg = getScoreConfig(10, TIERS);
    expect(cfg.label).toBe("Peligro");
    expect(cfg.color).toBe("#ef4444");
  });

  it("el glow usa color-mix (válido para oklch y hex)", () => {
    const cfg = getScoreConfig(90, { success: "oklch(65% 0.13 150)", warning: "#eab308", danger: "#ef4444" });
    expect(cfg.glow).toBe("color-mix(in srgb, oklch(65% 0.13 150) 50%, transparent)");
    expect(cfg.glowSoft).toBe("color-mix(in srgb, oklch(65% 0.13 150) 12%, transparent)");
  });
});
