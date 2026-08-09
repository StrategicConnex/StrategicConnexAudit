import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const insertMock = vi.hoisted(() => vi.fn());
vi.mock("@/shared/db", () => ({ directDb: { insert: insertMock } }));
vi.mock("@/shared/db/schemas", () => ({ securityAuditLogs: {} }));

import { logSecurityEvent, extractIpFromHeaders, eventFromRequest } from "./audit-log";

describe("audit-log — logSecurityEvent (fail-safe)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    insertMock.mockImplementation(() => ({
      values: vi.fn(async () => undefined),
    }));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("emite JSON estructurado a consola con los campos del evento", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    logSecurityEvent("rate_limit_hit", {
      ip: "203.0.113.5",
      userId: "u1",
      path: "/api/login",
      method: "POST",
      metadata: { prefix: "email_limit" },
    });

    const line = spy.mock.calls[0][0];
    expect(typeof line).toBe("string");
    const event = JSON.parse(line);
    expect(event.audit).toBe(true);
    expect(event.eventType).toBe("rate_limit_hit");
    expect(event.ip).toBe("203.0.113.5");
    expect(event.userId).toBe("u1");
    expect(event.path).toBe("/api/login");
    expect(event.method).toBe("POST");
    expect(event.metadata.prefix).toBe("email_limit");
    expect(event.timestamp).toBeTruthy();
    spy.mockRestore();
  });

  it("rellena defaults para detalles vacíos", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    logSecurityEvent("csp_violation", {});
    const event = JSON.parse(spy.mock.calls[0][0] as string);
    expect(event.ip).toBe("unknown");
    expect(event.path).toBe("/");
    expect(event.method).toBe("UNKNOWN");
    expect(event.metadata).toEqual({});
    spy.mockRestore();
  });

  it("persiste en Supabase vía directDb (fire-and-forget)", async () => {
    const valuesSpy = vi.fn(async (_values: {
      eventType?: string; ip?: string; path?: string;
      ruleEventType?: string; target?: string; status?: string; responseCode?: number | null;
      metadata?: Record<string, unknown>;
    }) => undefined);
    insertMock.mockImplementation(() => ({ values: valuesSpy }));

    logSecurityEvent("auth_failure", { ip: "198.51.100.2", path: "/auth/callback" });
    // Esperar microtasks del fire-and-forget
    await new Promise((r) => setTimeout(r, 0));

    expect(insertMock).toHaveBeenCalled();
    const values = valuesSpy.mock.calls[0]![0]!;
    expect(values.eventType).toBe("auth_failure");
    expect(values.ip).toBe("198.51.100.2");
    expect(values.path).toBe("/auth/callback");
  });

  it("nunca lanza aunque la persistencia falle (fail-safe)", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    insertMock.mockImplementation(() => ({
      values: vi.fn(async () => { throw new Error("db down"); }),
    }));

    expect(() => logSecurityEvent("invalid_input", {})).not.toThrow();
    await new Promise((r) => setTimeout(r, 0));
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});

describe("audit-log — extractIpFromHeaders (precedencia + blocklist)", () => {
  const hdrs = (o: Record<string, string>) => new Headers(o);

  it("prioriza x-vercel-forwarded-for", () => {
    expect(extractIpFromHeaders(hdrs({
      "x-vercel-forwarded-for": "203.0.113.9",
      "x-real-ip": "198.51.100.1",
    }))).toBe("203.0.113.9");
  });

  it("usa x-real-ip como segundo nivel", () => {
    expect(extractIpFromHeaders(hdrs({ "x-real-ip": "198.51.100.1" }))).toBe("198.51.100.1");
  });

  it("usa el primer valor de x-forwarded-for", () => {
    expect(extractIpFromHeaders(hdrs({ "x-forwarded-for": "192.0.2.1, 10.0.0.1" }))).toBe("192.0.2.1");
  });

  it("ignora loopback de todas las fuentes → unknown", () => {
    expect(extractIpFromHeaders(hdrs({
      "x-vercel-forwarded-for": "127.0.0.1",
      "x-real-ip": "::1",
      "x-forwarded-for": "::ffff:127.0.0.1",
    }))).toBe("unknown");
  });

  it("devuelve unknown para headers null/undefined o vacíos", () => {
    expect(extractIpFromHeaders(null)).toBe("unknown");
    expect(extractIpFromHeaders(undefined)).toBe("unknown");
    expect(extractIpFromHeaders(hdrs({}))).toBe("unknown");
  });
});

describe("audit-log — eventFromRequest", () => {
  it("extrae ip/path/method/userAgent de un Request-like", () => {
    const ctx = eventFromRequest({
      headers: new Headers({ "x-real-ip": "203.0.113.7", "user-agent": "UA/1.0" }),
      url: "https://app.example.com/api/scan?q=1",
      method: "GET",
    });
    expect(ctx.ip).toBe("203.0.113.7");
    expect(ctx.path).toBe("/api/scan");
    expect(ctx.method).toBe("GET");
    expect(ctx.userAgent).toBe("UA/1.0");
  });

  it("devuelve defaults sin request", () => {
    const ctx = eventFromRequest(null);
    expect(ctx).toEqual({ ip: "unknown", path: "/", method: "UNKNOWN", userAgent: undefined });
  });

  it("normaliza URLs sin parsear (no http)", () => {
    const ctx = eventFromRequest({ url: "login", method: "POST" });
    expect(ctx.path).toBe("/login");
  });
});
