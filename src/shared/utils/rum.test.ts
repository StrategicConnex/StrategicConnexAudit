import { describe, it, expect } from "vitest";
import { computeVitalsAverages, WebVitalLog } from "./rum";

describe("computeVitalsAverages", () => {
  it("should return baseline/empty defaults when logs array is empty", () => {
    const averages = computeVitalsAverages([]);
    expect(averages.LCP).toBe(0);
    expect(averages.CLS).toBe(0);
    expect(averages.FCP).toBe(0);
    expect(averages.INP).toBe(0);
    expect(averages.FID).toBe(0);
    expect(averages.TTFB).toBe(0);
    expect(averages.errorCount).toBe(0);
    expect(averages.totalPagesViews).toBe(0);
    expect(averages.avgTimeOnPage).toBe(0);
    expect(averages.avgSessionDuration).toBe(0);
    expect(averages.avgMemoryMB).toBe("--");
    expect(averages.topSlowResources).toEqual([]);
    expect(averages.browsersMap).toEqual({});
    expect(averages.countriesMap).toEqual({});
  });

  it("should correctly compute averages for perfect/valid log inputs", () => {
    const logs: WebVitalLog[] = [
      {
        lcp: 2000,
        cls: 0.05,
        fcp: 1000,
        inp: 150,
        fid: 50,
        ttfb: 200,
        pageViews: 1,
        timeOnPage: 5000,
        sessionDuration: 10000,
        browser: "Chrome",
        country: "AR",
        errors: ["ReferenceError: x is not defined"],
        resources: [
          { name: "main.js", duration: 150 },
          { name: "logo.png", duration: 50 }
        ],
        memory: { usedJSHeapSize: 20 * 1024 * 1024 } // 20 MB
      },
      {
        lcp: 3000,
        cls: 0.15,
        fcp: 2000,
        inp: 250,
        fid: 150,
        ttfb: 400,
        pageViews: 2,
        timeOnPage: 15000,
        sessionDuration: 30000,
        browser: "Chrome",
        country: "UY",
        errors: [],
        resources: [
          { name: "hero.jpg", duration: 400 },
          { name: "styles.css", duration: 100 }
        ],
        memory: { usedJSHeapSize: 40 * 1024 * 1024 } // 40 MB
      }
    ];

    const averages = computeVitalsAverages(logs);
    expect(averages.LCP).toBe(2500);
    expect(averages.CLS).toBe(0.1);
    expect(averages.FCP).toBe(1500);
    expect(averages.INP).toBe(200);
    expect(averages.FID).toBe(100);
    expect(averages.TTFB).toBe(300);
    expect(averages.errorCount).toBe(1);
    expect(averages.totalPagesViews).toBe(3);
    expect(averages.avgTimeOnPage).toBe(10); // (5000 + 15000) / 2 = 10000ms = 10s
    expect(averages.avgSessionDuration).toBe(20); // (10000 + 30000) / 2 = 20000ms = 20s
    expect(averages.avgMemoryMB).toBe("30.0"); // (20 + 40) / 2 = 30 MB
    expect(averages.topSlowResources).toHaveLength(4);
    expect(averages.topSlowResources[0]).toEqual({ name: "hero.jpg", duration: 400 });
    expect(averages.browsersMap).toEqual({ Chrome: 2 });
    expect(averages.countriesMap).toEqual({ AR: 1, UY: 1 });
  });

  it("should process null, undefined and empty objects resiliently", () => {
    const logs: WebVitalLog[] = [
      {
        lcp: null,
        cls: undefined,
        fcp: "",
        inp: 0,
        fid: null,
        ttfb: undefined,
        browser: null,
        country: undefined,
        errors: null,
        resources: null,
        memory: null
      }
    ];

    const averages = computeVitalsAverages(logs);
    expect(averages.LCP).toBe(0);
    expect(averages.CLS).toBe(0);
    expect(averages.FCP).toBe(0); // parse of "" gives 0
    expect(averages.INP).toBe(0);
    expect(averages.FID).toBe(0);
    expect(averages.TTFB).toBe(0);
    expect(averages.avgMemoryMB).toBe("--");
  });
});
