import { describe, it, expect } from "vitest";
import { mapLimit } from "./map-limit";

describe("mapLimit — concurrencia acotada (P2-3)", () => {
  it("preserva el orden con workers concurrentes", async () => {
    const delays = [30, 5, 20, 1, 15];
    const out = await mapLimit(delays, 3, async (ms, i) => {
      await new Promise((r) => setTimeout(r, ms));
      return i * 10;
    });
    expect(out).toEqual([0, 10, 20, 30, 40]);
  });

  it("respeta el límite de concurrencia", async () => {
    let live = 0;
    let peak = 0;
    await mapLimit(Array.from({ length: 10 }, (_, i) => i), 3, async (i) => {
      live++;
      peak = Math.max(peak, live);
      await new Promise((r) => setTimeout(r, 5));
      live--;
      return i;
    });
    expect(peak).toBeLessThanOrEqual(3);
  });

  it("lista vacía no falla", async () => {
    expect(await mapLimit([], 5, async (x: number) => x)).toEqual([]);
  });
});
