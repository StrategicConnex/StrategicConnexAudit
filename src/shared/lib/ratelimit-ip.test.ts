import { describe, it, expect, vi, beforeEach } from "vitest";

// Reutiliza los mocks de @upstash para no instanciar Redis real
vi.mock("@upstash/redis", () => ({ Redis: vi.fn(() => ({})) }));
vi.mock("@upstash/ratelimit", () => ({
  Ratelimit: class {
    limit = vi.fn();
    static slidingWindow = vi.fn();
  },
}));
vi.mock("./audit-log", () => ({ logSecurityEvent: vi.fn() }));

import {
  extractClientIp,
  buildRateLimitHeaders,
  rateLimitResponse,
  withRateLimit,
} from "./ratelimit";

const mkReq = (headers: Record<string, string>) => ({
  headers: new Headers(headers),
});

describe("ratelimit — extractClientIp (precedencia de confianza)", () => {
  it("prioriza x-vercel-forwarded-for (no falsificable)", () => {
    const ip = extractClientIp(mkReq({
      "x-vercel-forwarded-for": "203.0.113.9",
      "x-real-ip": "198.51.100.1",
      "x-forwarded-for": "192.0.2.1",
    }));
    expect(ip).toBe("203.0.113.9");
  });

  it("usa x-real-ip cuando no hay header Vercel", () => {
    const ip = extractClientIp(mkReq({
      "x-real-ip": "198.51.100.1",
      "x-forwarded-for": "192.0.2.1, 10.0.0.1",
    }));
    expect(ip).toBe("198.51.100.1");
  });

  it("usa el primer valor de x-forwarded-for como último recurso", () => {
    const ip = extractClientIp(mkReq({ "x-forwarded-for": "192.0.2.1, 10.0.0.1" }));
    expect(ip).toBe("192.0.2.1");
  });

  it("ignora IPs de la blocklist (localhost/loopback) y pasa al siguiente header", () => {
    const ip = extractClientIp(mkReq({
      "x-vercel-forwarded-for": "127.0.0.1",
      "x-real-ip": "::1",
      "x-forwarded-for": "203.0.113.42",
    }));
    expect(ip).toBe("203.0.113.42");
  });

  it("genera fallback hash anon-XXXXXX sin ningún header de IP", () => {
    const ip = extractClientIp(mkReq({
      "user-agent": "Mozilla/5.0 TestBrowser/1.0",
      "accept-language": "es-ES,es;q=0.9",
    }));
    expect(ip).toMatch(/^anon-[0-9a-z]{6}$/);
  });

  it("es determinista para los mismos headers", () => {
    const req = mkReq({ "user-agent": "same-ua", "accept-language": "en" });
    expect(extractClientIp(req)).toBe(extractClientIp(req));
  });
});

describe("ratelimit — buildRateLimitHeaders / rateLimitResponse", () => {
  it("setea headers estándar IETF y legacy X-", () => {
    const h = buildRateLimitHeaders({
      success: true, limit: 10, remaining: 9, reset: 1234, retryAfter: 0,
    });
    expect(h.get("RateLimit-Limit")).toBe("10");
    expect(h.get("RateLimit-Remaining")).toBe("9");
    expect(h.get("RateLimit-Reset")).toBe("1234");
    expect(h.get("X-RateLimit-Limit")).toBe("10");
    expect(h.get("X-RateLimit-Remaining")).toBe("9");
    expect(h.get("X-RateLimit-Reset")).toBe("1234");
    expect(h.get("Retry-After")).toBeNull();
  });

  it("incluye Retry-After cuando success=false", () => {
    const h = buildRateLimitHeaders({
      success: false, limit: 5, remaining: 0, reset: 9999, retryAfter: 42,
    });
    expect(h.get("Retry-After")).toBe("42");
  });

  it("rateLimitResponse devuelve 429 con cuerpo y headers", () => {
    const res = rateLimitResponse({
      success: false, limit: 5, remaining: 0, reset: 9999, retryAfter: 30,
    });
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("30");
    expect(res.headers.get("RateLimit-Limit")).toBe("5");
  });

  it("rateLimitResponse mergea extraBody", () => {
    const res = rateLimitResponse(
      { success: false, limit: 5, remaining: 0, reset: 1, retryAfter: 5 },
      { prefix: "ai_limit" }
    );
    expect(res.status).toBe(429);
  });
});

describe("ratelimit — withRateLimit (middleware de route handlers)", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  const handler = async (req: Request, identifier: string) =>
    new Response(JSON.stringify({ ok: true, who: identifier }), { status: 200 });

  it("success: ejecuta el handler y adjunta headers de rate limit", async () => {
    const wrapped = withRateLimit({ limit: 5, window: 60, prefix: "t1" }, handler);
    const res = await wrapped(new Request("http://localhost/api/x", { method: "POST" }));

    expect(res.status).toBe(200);
    expect(res.headers.get("RateLimit-Limit")).toBe("5");
    expect(res.headers.get("X-RateLimit-Remaining")).toBeTruthy();
    const body = await res.json();
    expect(body.who).toMatch(/^(anon-|127)/);
  });

  it("429 cuando se excede el límite (fallback en memoria)", async () => {
    const wrapped = withRateLimit({ limit: 2, window: 60, prefix: "t2" }, handler);
    const req = () => new Request("http://localhost/api/x", { method: "POST" });

    await wrapped(req());
    await wrapped(req());
    const third = await wrapped(req());

    expect(third.status).toBe(429);
    expect(third.headers.get("Retry-After")).toBeTruthy();
  });

  it("401 cuando authenticate devuelve null", async () => {
    const wrapped = withRateLimit(
      {
        limit: 5, window: 60, prefix: "t3",
        authenticate: async () => null,
      },
      handler
    );
    const res = await wrapped(new Request("http://localhost/api/x", { method: "POST" }));
    expect(res.status).toBe(401);
  });

  it("identifica por user.id cuando authenticate devuelve usuario", async () => {
    const wrapped = withRateLimit(
      {
        limit: 5, window: 60, prefix: "t4",
        authenticate: async () => ({ id: "user-1" }),
      },
      handler
    );
    const res = await wrapped(new Request("http://localhost/api/x", { method: "POST" }));
    const body = await res.json();
    expect(body.who).toBe("user-1");
  });

  it("500 con error interno si el handler lanza", async () => {
    const failing = async () => { throw new Error("boom"); };
    const wrapped = withRateLimit({ limit: 5, window: 60, prefix: "t5" }, failing);
    const res = await wrapped(new Request("http://localhost/api/x", { method: "POST" }));
    expect(res.status).toBe(500);
  });
});
