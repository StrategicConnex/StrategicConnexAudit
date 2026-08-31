/**
 * health-checker.ts - External API Health Check System.
 *
 * Periodically monitors availability, latency, and error rates
 * for external APIs the intelligence engine depends on.
 * Integrates with existing Circuit Breakers via async getState() calls.
 */

import { geoipCircuit, whoisCircuit, premiumApiCircuit, CircuitBreaker } from "./circuit-breaker";
import { logger } from "@/lib/logger";
import { getErrorMessage } from "@/shared/lib/errors";

export type HealthStatus = "healthy" | "degraded" | "down";
export type ExternalApiName = "geoip" | "whois" | "copilot" | "dns";

export interface ExternalApiHealth {
  name: string;
  id: ExternalApiName;
  status: HealthStatus;
  lastLatencyMs: number | null;
  lastSuccessAt: string | null;
  lastFailureAt: string | null;
  consecutiveFailures: number;
  successRate: number;
  circuitState?: string;
  endpoint: string;
  message: string;
}

export interface HealthReport {
  timestamp: string;
  globalStatus: HealthStatus;
  apis: ExternalApiHealth[];
  summary: { total: number; healthy: number; degraded: number; down: number; avgLatencyMs: number | null };
  recentDegradations: DegradationEvent[];
}

export interface DegradationEvent {
  api: ExternalApiName;
  previousStatus: HealthStatus;
  newStatus: HealthStatus;
  message: string;
  detectedAt: string;
}

interface HealthCheckEndpoint {
  id: ExternalApiName;
  name: string;
  endpoints: string[];
  method: "GET" | "HEAD";
  timeoutMs: number;
  degradedLatencyMs: number;
  failureThreshold: number;
  circuitBreaker?: CircuitBreaker;
  checkIntervalMs: number;
}

const cfg: HealthCheckEndpoint[] = [
  { id: "geoip", name: "GeoIP (freeipapi.com / ip-api.com)", endpoints: ["https://freeipapi.com/api/json/8.8.8.8", "http://ip-api.com/json/8.8.8.8"], method: "GET", timeoutMs: 8000, degradedLatencyMs: 2000, failureThreshold: 3, circuitBreaker: geoipCircuit, checkIntervalMs: 300000 },
  { id: "whois", name: "WHOIS/RDAP (rdap.org)", endpoints: ["https://rdap.org/domain/google.com"], method: "GET", timeoutMs: 10000, degradedLatencyMs: 3000, failureThreshold: 3, circuitBreaker: whoisCircuit, checkIntervalMs: 600000 },
  { id: "copilot", name: "AI Copilot (OpenRouter / OpenAI)", endpoints: ["https://openrouter.ai/api/v1/auth/key"], method: "GET", timeoutMs: 8000, degradedLatencyMs: 3000, failureThreshold: 2, circuitBreaker: premiumApiCircuit, checkIntervalMs: 900000 },
  { id: "dns", name: "DNS Resolver", endpoints: [], method: "GET", timeoutMs: 5000, degradedLatencyMs: 1500, failureThreshold: 3, checkIntervalMs: 300000 },
];

class ExternalApiHealthChecker {
  private hm = new Map<ExternalApiName, ExternalApiHealth>();
  private degs: DegradationEvent[] = [];
  private ids: NodeJS.Timeout[] = [];
  private running = false;

  constructor() {
    for (const c of cfg) {
      // Initialize circuitState as "CLOSED" — constructor can't be async
      // The actual circuit state is fetched during health checks via getState()
      this.hm.set(c.id, {
        name: c.name, id: c.id, status: "healthy",
        lastLatencyMs: null, lastSuccessAt: null, lastFailureAt: null,
        consecutiveFailures: 0, successRate: 1.0,
        circuitState: "CLOSED",
        endpoint: c.endpoints[0] || "n/a",
        message: "Awaiting first health check..."
      });
    }
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    logger.info("[HealthChecker] Starting...");
    this.runAllChecks();
    for (const c of cfg) {
      this.ids.push(setInterval(() => c.id === "dns" ? this.checkDns() : this.checkEP(c), c.checkIntervalMs));
    }
    logger.info("[HealthChecker] Active for " + cfg.length + " services.");
  }

  stop(): void {
    for (const i of this.ids) clearInterval(i);
    this.ids = [];
    this.running = false;
  }

  async runAllChecks(): Promise<void> {
    await Promise.allSettled(
      cfg.map((c) => c.id === "dns" ? this.checkDns() : this.checkEP(c))
    );
  }

  getReport(): HealthReport {
    const apis = Array.from(this.hm.values()).sort((a, b) => {
      const o: Record<string, number> = { healthy: 0, degraded: 1, down: 2 };
      return (o[b.status] ?? 0) - (o[a.status] ?? 0);
    });
    const lats = apis.map((a) => a.lastLatencyMs).filter((l): l is number => l !== null);
    let gs: HealthStatus = "healthy";
    if (apis.some((a) => a.status === "down")) gs = "down";
    else if (apis.some((a) => a.status === "degraded")) gs = "degraded";
    return {
      timestamp: new Date().toISOString(), globalStatus: gs, apis,
      summary: {
        total: apis.length,
        healthy: apis.filter((a) => a.status === "healthy").length,
        degraded: apis.filter((a) => a.status === "degraded").length,
        down: apis.filter((a) => a.status === "down").length,
        avgLatencyMs: lats.length ? Math.round(lats.reduce((a, b) => a + b, 0) / lats.length) : null
      },
      recentDegradations: this.degs.slice(-20),
    };
  }

  clearDegradationHistory(): void { this.degs = []; }

  private async checkEP(c: HealthCheckEndpoint): Promise<void> {
    const t0 = Date.now();
    let ok = false, lat = 0, err = "", ep = c.endpoints[0] || "";

    for (const e of c.endpoints) {
      try {
        const ac = new AbortController();
        const tid = setTimeout(() => ac.abort(), c.timeoutMs);
        const r = await fetch(e, {
          method: c.method,
          signal: ac.signal,
          headers: { "User-Agent": "StrategicAuditPro-HealthCheck/1.0" }
        });
        clearTimeout(tid);
        lat = Date.now() - t0;
        ep = e;
        if (r.ok) { ok = true; break; }
        else { err = "HTTP " + r.status; }
      } catch (ex: unknown) {
        if (ex instanceof Error && ex.name === "AbortError") {
          err = "Timeout";
        } else {
          const msg = getErrorMessage(ex);
          err = msg === "Error desconocido" ? "Unknown" : msg;
        }
        lat = Date.now() - t0;
      }
    }

    // Fetch circuit state asynchronously via getState()
    let circuitState: string | undefined;
    if (c.circuitBreaker) {
      circuitState = c.circuitBreaker.currentState;
    }

    await this.record(c, ok, lat, err, ep, circuitState);
  }

  private async checkDns(): Promise<void> {
    const t0 = Date.now();
    let ok = false, lat = 0, err = "";
    try {
      const d = await import("node:dns/promises");
      await d.resolve4("google.com");
      lat = Date.now() - t0;
      ok = true;
    } catch (ex: unknown) {
      lat = Date.now() - t0;
      const msg = getErrorMessage(ex);
      err = msg === "Error desconocido" ? "DNS failed" : msg;
    }
    await this.record(cfg.find((c) => c.id === "dns")!, ok, lat, err, "node:dns/promises");
  }

  private async record(
    c: HealthCheckEndpoint, ok: boolean, lat: number, err: string,
    ep: string, cs?: string
  ): Promise<void> {
    const e = this.hm.get(c.id)!;
    const prev = e.status;
    e.endpoint = ep;
    e.circuitState = cs;

    if (ok) {
      e.lastSuccessAt = new Date().toISOString();
      e.lastLatencyMs = lat;
      e.consecutiveFailures = 0;
      e.status = lat > c.degradedLatencyMs ? "degraded" : "healthy";
      e.message = e.status === "healthy" ? "OK (" + lat + "ms)" : "Slow: " + lat + "ms";
      e.successRate = Math.min(1.0, e.successRate + 0.1);
    } else {
      e.lastFailureAt = new Date().toISOString();
      e.consecutiveFailures++;
      if (cs === "OPEN") {
        e.status = "down";
        e.message = "Circuit open. Last: " + err;
      } else if (e.consecutiveFailures >= c.failureThreshold) {
        e.status = "down";
        e.message = e.consecutiveFailures + " fails: " + err;
      } else {
        e.status = "degraded";
        e.message = "Fail " + e.consecutiveFailures + "/" + c.failureThreshold + ": " + err;
      }
      e.successRate = Math.max(0, e.successRate - 0.2);
    }

    if (prev !== e.status) {
      this.degs.push({
        api: c.id, previousStatus: prev, newStatus: e.status,
        message: "[" + c.name + "] " + prev + " -> " + e.status + ": " + e.message,
        detectedAt: new Date().toISOString()
      });
      if (e.status === "down" || (e.status === "degraded" && prev === "healthy")) {
        logger.warn(`[SECURITY] EXTERNAL_API_DEGRADATION:${c.id} — ${c.name} ${prev} -> ${e.status}: ${e.message}`, {
          api: c.id, apiName: c.name,
          previousStatus: prev, newStatus: e.status,
          latencyMs: lat, consecutiveFailures: e.consecutiveFailures,
          circuitState: cs, endpoint: ep
        });
        logger.warn("[HealthChecker] Degradation: " + c.name + " (" + prev + " -> " + e.status + ")");
      }
    }

    this.hm.set(c.id, e);
  }
}

export const externalApiHealthChecker = new ExternalApiHealthChecker();
