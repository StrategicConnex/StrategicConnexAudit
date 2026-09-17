import { describe, it, expect } from "vitest";
import { linearForecast } from "./forecast-math";

describe("forecast-math — regresión lineal (C-1)", () => {
  it("serie creciente predice por encima del actual", () => {
    const f = linearForecast({ dailyAverages: [100, 110, 120, 130, 140], horizonDays: 14 });
    expect(f.slopePerDay).toBeCloseTo(10, 5);
    expect(f.predicted).toBeCloseTo(140 + 10 * 14, 0);
    expect(f.trend).toBe("up");
    expect(f.rSquared).toBeCloseTo(1, 5);
  });

  it("serie plana → tendencia flat y R² 0", () => {
    const f = linearForecast({ dailyAverages: [50, 50, 50, 50] });
    expect(f.trend).toBe("flat");
    expect(f.rSquared).toBe(0);
    expect(f.predicted).toBe(50);
  });

  it("menos de 3 puntos → confianza 0 y predicción = actual", () => {
    const f = linearForecast({ dailyAverages: [10, 20] });
    expect(f.rSquared).toBe(0);
    expect(f.predicted).toBe(20);
    expect(f.sampleDays).toBe(2);
  });

  it("serie decreciente → down", () => {
    const f = linearForecast({ dailyAverages: [200, 180, 160, 140] });
    expect(f.trend).toBe("down");
    expect(f.predicted).toBeLessThan(140);
  });

  it("ignora valores no finitos", () => {
    const f = linearForecast({ dailyAverages: [100, NaN, 120, Infinity, 140] });
    expect(f.sampleDays).toBe(3);
    expect(f.trend).toBe("up");
  });
});
