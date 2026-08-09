import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const fetchMock = vi.hoisted(() => vi.fn());
const resolve4Mock = vi.hoisted(() => vi.fn());

vi.mock("@/shared/lib/logger", () => ({
  logger: { security: vi.fn(async () => {}) },
}));
vi.mock("node:dns/promises", () => ({ resolve4: resolve4Mock }));

import { externalApiHealthChecker } from "./health-checker";
import { geoipCircuit } from "./circuit-breaker";

const okResponse = { ok: true, status: 200 } as Response;

describe("externalApiHealthChecker — monitoreo de APIs externas", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    resolve4Mock.mockReset();
    externalApiHealthChecker.clearDegradationHistory();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("getReport inicial: todo healthy, sin latencias, avg null", () => {
    const report = externalApiHealthChecker.getReport();
    expect(report.globalStatus).toBe("healthy");
    expect(report.apis.length).toBe(4);
    expect(report.summary.total).toBe(4);
    expect(report.summary.healthy).toBe(4);
    expect(report.summary.degraded).toBe(0);
    expect(report.summary.down).toBe(0);
    expect(report.summary.avgLatencyMs).toBeNull();
    expect(report.recentDegradations).toEqual([]);
  });

  it("runAllChecks con todas las APIs OK mantiene healthy y registra latencias", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => okResponse));
    resolve4Mock.mockResolvedValue(["8.8.8.8"]);

    await externalApiHealthChecker.runAllChecks();

    const report = externalApiHealthChecker.getReport();
    expect(report.globalStatus).toBe("healthy");
    expect(report.summary.healthy).toBe(4);
    expect(report.summary.avgLatencyMs).not.toBeNull();
    for (const api of report.apis) {
      expect(api.lastSuccessAt).not.toBeNull();
      expect(api.consecutiveFailures).toBe(0);
    }
  });

  it("marca degraded cuando una API falla sin alcanzar el umbral", async () => {
    // Todos los endpoints fallan → 1 fallo consecutivo por API (por debajo de thresholds)
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 503 })));
    resolve4Mock.mockRejectedValue(new Error("ENOTFOUND"));

    await externalApiHealthChecker.runAllChecks();

    const report = externalApiHealthChecker.getReport();
    expect(report.globalStatus).toBe("degraded");
    for (const api of report.apis) {
      expect(api.status).toBe("degraded");
      expect(api.consecutiveFailures).toBe(1);
    }
    expect(report.summary.down).toBe(0);
  });

  it("marca down cuando fallan todos los endpoints y se alcanza el umbral", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 503 })));
    resolve4Mock.mockRejectedValue(new Error("ENOTFOUND"));

    // 3 runs → geoip/whois/dns (threshold 3) y copilot (threshold 2) caen a down
    for (let i = 0; i < 3; i++) {
      await externalApiHealthChecker.runAllChecks();
    }

    const report = externalApiHealthChecker.getReport();
    expect(report.globalStatus).toBe("down");
    expect(report.apis.find((a) => a.id === "geoip")?.status).toBe("down");
    expect(report.apis.find((a) => a.id === "dns")?.status).toBe("down");
    expect(report.recentDegradations.length).toBeGreaterThan(0);
  });

  it("circuito OPEN marca la API como down con mensaje de circuit", async () => {
    // Abrir el circuito geoip de verdad (5 fallos)
    for (let i = 0; i < 5; i++) {
      await geoipCircuit.execute(async () => { throw new Error("x"); }).catch(() => {});
    }
    expect(geoipCircuit.currentState).toBe("OPEN");

    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 500 })));
    resolve4Mock.mockResolvedValue(["8.8.8.8"]);

    await externalApiHealthChecker.runAllChecks();
    const geoip = externalApiHealthChecker.getReport().apis.find((a) => a.id === "geoip");
    expect(geoip?.status).toBe("down");
    expect(geoip?.circuitState).toBe("OPEN");
    expect(geoip?.message).toContain("Circuit open");

    // Reset para no contaminar otros tests
    geoipCircuit.reset();
  });

  it("clearDegradationHistory vacía el historial", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 500 })));
    resolve4Mock.mockRejectedValue(new Error("ENOTFOUND"));
    await externalApiHealthChecker.runAllChecks();
    expect(externalApiHealthChecker.getReport().recentDegradations.length).toBeGreaterThan(0);

    externalApiHealthChecker.clearDegradationHistory();
    expect(externalApiHealthChecker.getReport().recentDegradations).toEqual([]);
  });

  it("dns saludable con resolve4 OK se mantiene healthy", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => okResponse));
    resolve4Mock.mockResolvedValue(["1.1.1.1"]);
    await externalApiHealthChecker.runAllChecks();
    const dns = externalApiHealthChecker.getReport().apis.find((a) => a.id === "dns");
    expect(dns?.status).toBe("healthy");
    expect(dns?.lastSuccessAt).not.toBeNull();
  });
});
