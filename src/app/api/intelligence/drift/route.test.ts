/* ═══════════════════════════════════════════════════════════════════════════
   Intelligence Drift — Tests de endpoint

   Verifica el handler GET con auth/RLS simulados:
   - 401 sin usuario, 400 sin investigationId, 404 si no hay investigación
   - 200 con primera investigación (sin línea base de comparación)
   - 200 con drift completo (score, IP, ASN, nameservers, DMARC, SPF, SSL, CDN)
   - 200 sin drift, deltaScore nulo y severidades de score (info/warning)
   - 500 en error interno de BD
   ═══════════════════════════════════════════════════════════════════════════ */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ─── Mocks ──────────────────────────────────────────────────────────────────

const mocks = vi.hoisted(() => {
  const findFirstQueue: unknown[] = [];
  const tx = {
    query: {
      intelligenceInvestigations: {
        findFirst: vi.fn(async () => findFirstQueue.shift() ?? null),
      },
    },
  };
  const withRLS = vi.fn((_userId: string, fn: (t: typeof tx) => unknown) =>
    fn(tx)
  );
  return {
    tx,
    findFirstQueue,
    withRLS,
    createClient: vi.fn(),
    loggerError: vi.fn(),
  };
});

vi.mock("@/shared/lib/supabase/server", () => ({
  createClient: mocks.createClient,
}));

vi.mock("@/shared/db/rls", () => ({
  withRLS: mocks.withRLS,
}));

vi.mock("@/lib/logger", () => ({
  logger: { error: mocks.loggerError, warn: vi.fn(), info: vi.fn() },
}));

// ─── Helpers ─────────────────────────────────────────────────────────────────

const INVESTIGATION_ID = "f1a2b3c4-d5e6-4789-abcd-ef1234567890";

function setUser(id: string | null): void {
  mocks.createClient.mockResolvedValue({
    auth: {
      getUser: vi.fn(async () => ({ data: { user: id ? { id } : null } })),
    },
  });
}

function createRequest(query: string): NextRequest {
  return new NextRequest(
    new Request(`http://localhost:3000/api/intelligence/drift${query}`)
  );
}

function driftUrl(): string {
  return `?investigationId=${INVESTIGATION_ID}`;
}

const DAY_MS = 86_400_000;

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("GET /api/intelligence/drift", () => {
  let GET: typeof import("./route").GET;

  beforeEach(async () => {
    vi.clearAllMocks();
    mocks.findFirstQueue.length = 0;
    const mod = await import("./route");
    GET = mod.GET;
  });

  it("returns 401 when no user", async () => {
    setUser(null);

    const res = await GET(createRequest(driftUrl()));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toBe("No autorizado");
    expect(mocks.withRLS).not.toHaveBeenCalled();
  });

  it("returns 400 when investigationId is missing", async () => {
    setUser("user-1");

    const res = await GET(createRequest(""));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toBe("Falta investigationId");
    expect(mocks.withRLS).not.toHaveBeenCalled();
  });

  it("returns 404 when investigation does not exist", async () => {
    setUser("user-1");

    const res = await GET(createRequest(driftUrl()));
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toBe("Investigación no encontrada");
    expect(mocks.withRLS).toHaveBeenCalledWith("user-1", expect.any(Function));
  });

  it("returns 404 when investigation has no createdAt", async () => {
    setUser("user-1");
    mocks.findFirstQueue.push({
      id: "inv-1",
      projectId: "proj-1",
      normalizedTarget: "example.com",
      createdAt: null,
      score: 75,
      metadata: null,
    });

    const res = await GET(createRequest(driftUrl()));
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("Investigación no encontrada");
  });

  it("returns baseline message for the first investigation of a target", async () => {
    setUser("user-1");
    mocks.findFirstQueue.push({
      id: "inv-1",
      projectId: "proj-1",
      normalizedTarget: "example.com",
      createdAt: new Date("2026-09-20T10:00:00.000Z"),
      score: 75,
      metadata: null,
    });

    const res = await GET(createRequest(driftUrl()));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.hasDrift).toBe(false);
    expect(body.changes).toEqual([]);
    expect(body.deltaScore).toBeNull();
    expect(body.message).toContain("Primera investigación");
  });

  it("returns full drift report with all detected changes", async () => {
    setUser("user-1");
    mocks.findFirstQueue.push(
      {
        id: "inv-2",
        projectId: "proj-1",
        normalizedTarget: "example.com",
        createdAt: new Date("2026-09-20T10:00:00.000Z"),
        score: 50,
        metadata: {
          asnGeo: { ipAddress: "10.0.0.2", asn: "AS64501", asName: "New ISP" },
          whois: { nameservers: ["ns2.new.com", "ns1.new.com"] },
          dmarcParsed: { policy: "none" },
          spfParsed: { isWeak: true },
          sslCertificate: {
            validTo: new Date(Date.now() + 10 * DAY_MS).toISOString(),
          },
          cdnWaf: { detected: false },
        },
      },
      {
        id: "inv-1",
        projectId: "proj-1",
        normalizedTarget: "example.com",
        createdAt: new Date("2026-09-10T10:00:00.000Z"),
        score: 80,
        metadata: {
          asnGeo: { ipAddress: "10.0.0.1", asn: "AS64500", asName: "Old ISP" },
          whois: { nameservers: ["ns2.old.com", "ns1.old.com"] },
          dmarcParsed: { policy: "reject" },
          spfParsed: { isWeak: false },
          sslCertificate: { validTo: "2026-12-01T00:00:00.000Z" },
          cdnWaf: { detected: true, name: "Cloudflare" },
        },
      }
    );

    const res = await GET(createRequest(driftUrl()));
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.success).toBe(true);
    expect(body.hasDrift).toBe(true);
    expect(body.deltaScore).toBe(-30);
    expect(body.previousInvestigationId).toBe("inv-1");
    expect(body.previousScore).toBe(80);
    expect(body.previousCreatedAt).toBe("2026-09-10T10:00:00.000Z");

    expect(body.changes.map((c: { field: string }) => c.field)).toEqual([
      "score",
      "ip_address",
      "asn",
      "nameservers",
      "dmarc_policy",
      "spf_weakness",
      "ssl_expiry",
      "cdn_waf",
    ]);

    expect(body.changes[0]).toMatchObject({
      severity: "critical",
      previous: "80/100",
      current: "50/100 (-30)",
    });
    expect(body.changes[1]).toMatchObject({
      previous: "10.0.0.1",
      current: "10.0.0.2",
    });
    expect(body.changes[2]).toMatchObject({
      previous: "AS64500 — Old ISP",
      current: "AS64501 — New ISP",
    });
    expect(body.changes[3]).toMatchObject({
      previous: "ns1.old.com, ns2.old.com",
      current: "ns1.new.com, ns2.new.com",
    });
    expect(body.changes[4]).toMatchObject({
      previous: "REJECT",
      current: "NONE",
      severity: "critical",
    });
    expect(body.changes[5]).toMatchObject({ severity: "warning" });
    expect(body.changes[6].severity).toBe("warning");
    expect(body.changes[6].current).toMatch(/^Vence en \d+ días?$/);
    expect(body.changes[7]).toMatchObject({
      previous: "Cloudflare",
      current: "No detectada",
      severity: "warning",
    });
  });

  it("returns no drift when both investigations are identical", async () => {
    setUser("user-1");
    const investigation = {
      id: "inv-2",
      projectId: "proj-1",
      normalizedTarget: "example.com",
      createdAt: new Date("2026-09-20T10:00:00.000Z"),
      score: 75,
      metadata: null,
    };
    mocks.findFirstQueue.push(investigation, {
      ...investigation,
      id: "inv-1",
      createdAt: new Date("2026-09-10T10:00:00.000Z"),
    });

    const res = await GET(createRequest(driftUrl()));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.hasDrift).toBe(false);
    expect(body.changes).toEqual([]);
    expect(body.deltaScore).toBe(0);
    expect(body.previousInvestigationId).toBe("inv-1");
  });

  it("returns null deltaScore when a score is missing", async () => {
    setUser("user-1");
    mocks.findFirstQueue.push(
      {
        id: "inv-2",
        projectId: "proj-1",
        normalizedTarget: "example.com",
        createdAt: new Date("2026-09-20T10:00:00.000Z"),
        score: null,
        metadata: null,
      },
      {
        id: "inv-1",
        projectId: "proj-1",
        normalizedTarget: "example.com",
        createdAt: new Date("2026-09-10T10:00:00.000Z"),
        score: 80,
        metadata: null,
      }
    );

    const res = await GET(createRequest(driftUrl()));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.hasDrift).toBe(false);
    expect(body.deltaScore).toBeNull();
  });

  it("flags a score increase as info severity", async () => {
    setUser("user-1");
    mocks.findFirstQueue.push(
      {
        id: "inv-2",
        projectId: "proj-1",
        createdAt: new Date("2026-09-20T10:00:00.000Z"),
        score: 85,
        metadata: null,
      },
      {
        id: "inv-1",
        projectId: "proj-1",
        createdAt: new Date("2026-09-10T10:00:00.000Z"),
        score: 70,
        metadata: null,
      }
    );

    const res = await GET(createRequest(driftUrl()));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.hasDrift).toBe(true);
    expect(body.deltaScore).toBe(15);
    expect(body.changes).toHaveLength(1);
    expect(body.changes[0]).toMatchObject({
      field: "score",
      severity: "info",
      current: "85/100 (+15)",
    });
  });

  it("flags a small score drop as warning severity", async () => {
    setUser("user-1");
    mocks.findFirstQueue.push(
      {
        id: "inv-2",
        projectId: "proj-1",
        createdAt: new Date("2026-09-20T10:00:00.000Z"),
        score: 75,
        metadata: null,
      },
      {
        id: "inv-1",
        projectId: "proj-1",
        createdAt: new Date("2026-09-10T10:00:00.000Z"),
        score: 85,
        metadata: null,
      }
    );

    const res = await GET(createRequest(driftUrl()));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.hasDrift).toBe(true);
    expect(body.deltaScore).toBe(-10);
    expect(body.changes[0]).toMatchObject({
      field: "score",
      severity: "warning",
      current: "75/100 (-10)",
    });
  });

  it("flags a certificate expiring within 7 days as critical", async () => {
    setUser("user-1");
    const metadata = {
      sslCertificate: {
        validTo: new Date(Date.now() + 3 * DAY_MS).toISOString(),
      },
    };
    mocks.findFirstQueue.push(
      {
        id: "inv-2",
        projectId: "proj-1",
        createdAt: new Date("2026-09-20T10:00:00.000Z"),
        score: 75,
        metadata,
      },
      {
        id: "inv-1",
        projectId: "proj-1",
        createdAt: new Date("2026-09-10T10:00:00.000Z"),
        score: 75,
        metadata,
      }
    );

    const res = await GET(createRequest(driftUrl()));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.changes).toHaveLength(1);
    expect(body.changes[0]).toMatchObject({
      field: "ssl_expiry",
      severity: "critical",
      previous: null,
    });
  });

  it("ignores an already expired certificate", async () => {
    setUser("user-1");
    const metadata = {
      sslCertificate: {
        validTo: new Date(Date.now() - 5 * DAY_MS).toISOString(),
      },
    };
    mocks.findFirstQueue.push(
      {
        id: "inv-2",
        projectId: "proj-1",
        createdAt: new Date("2026-09-20T10:00:00.000Z"),
        score: 75,
        metadata,
      },
      {
        id: "inv-1",
        projectId: "proj-1",
        createdAt: new Date("2026-09-10T10:00:00.000Z"),
        score: 75,
        metadata,
      }
    );

    const res = await GET(createRequest(driftUrl()));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.hasDrift).toBe(false);
    expect(body.changes).toEqual([]);
  });

  it("returns 500 on internal error", async () => {
    setUser("user-1");
    mocks.tx.query.intelligenceInvestigations.findFirst.mockRejectedValueOnce(
      new Error("DB down")
    );

    const res = await GET(createRequest(driftUrl()));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toBe("Error interno del servidor");
    expect(mocks.loggerError).toHaveBeenCalledWith("Drift detection error:", {
      error: "DB down",
    });
  });
});
