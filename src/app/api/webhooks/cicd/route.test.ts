/* ═══════════════════════════════════════════════════════════════════════════
   Webhooks CI/CD API — Tests de endpoint (TD-03 lote 3)

   Verifica:
   - Firma HMAC: secreto no configurado → 503 (fail-closed), firma inválida → 401
   - Validación de payload: JSON roto → 500, campos fuera de rango → 400
   - Acuse sin projectId → 200 (sin consultar la BD)
   - Quality gate: sin auditorías → gate fail; 0 críticas → gate pass;
     críticas + score bajo → gate fail con reasons; error de BD → 500
   ═══════════════════════════════════════════════════════════════════════════ */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ==== Mocks ================================================================

const mockVerifyWebhookSignature = vi.fn();
const mockSelectChain = vi.fn();

vi.mock("@/server/security/cicd-helper", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/server/security/cicd-helper")>();
  return {
    ...actual,
    verifyWebhookSignature: (payload: string, signature: string, secret: string) =>
      mockVerifyWebhookSignature(payload, signature, secret),
  };
});

vi.mock("@/shared/db", () => ({
  directDb: {
    select: () => {
      const chain = {
        from: () => chain,
        where: () => chain,
        orderBy: () => chain,
        limit: () => chain,
        then: (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
          mockSelectChain().then(resolve, reject),
      };
      return chain;
    },
  },
}));

// ==== Helpers ==============================================================

const ORIGINAL_SECRET = process.env.SCAUDIT_WEBHOOK_SECRET;
const TEST_SECRET = "test-webhook-secret";

function createRequest(rawBody: string, signature = "sha256=test-signature"): Request {
  return new Request("http://localhost:3000/api/webhooks/cicd", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-scaudit-signature": signature,
    },
    body: rawBody,
  });
}

// ==== Tests ================================================================

describe("Webhooks CI/CD API — POST", () => {
  let POST: typeof import("./route").POST;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockVerifyWebhookSignature.mockReturnValue(true);
    mockSelectChain.mockResolvedValue([]);
    process.env.SCAUDIT_WEBHOOK_SECRET = TEST_SECRET;
    const mod = await import("./route");
    POST = mod.POST;
  });

  it("invalid signature → 401", async () => {
    mockVerifyWebhookSignature.mockReturnValue(false);

    const res = await POST(createRequest(JSON.stringify({ commit: "abc" })));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toBe("Firma HMAC inválida o no provista");
    expect(mockSelectChain).not.toHaveBeenCalled();
  });

  it("signature is checked with the configured secret", async () => {
    const raw = JSON.stringify({ commit: "abc123" });

    await POST(createRequest(raw, "sha256=whatever"));

    expect(mockVerifyWebhookSignature).toHaveBeenCalledWith(
      raw,
      "sha256=whatever",
      TEST_SECRET,
    );
  });

  it("raw body not json → 500", async () => {
    const res = await POST(createRequest("<html>nope</html>"));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("Error procesando el webhook de CI/CD");
  });

  it("commit over 120 chars → 400", async () => {
    const res = await POST(
      createRequest(JSON.stringify({ commit: "a".repeat(121) })),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Payload inválido");
  });

  it("projectId not uuid → 400", async () => {
    const res = await POST(
      createRequest(JSON.stringify({ projectId: "not-a-uuid" })),
    );
    expect(res.status).toBe(400);
  });

  it("negative failIf.maxCritical → 400", async () => {
    const res = await POST(
      createRequest(
        JSON.stringify({ projectId: "550e8400-e29b-41d4-a716-446655440000", failIf: { maxCritical: -1 } }),
      ),
    );
    expect(res.status).toBe(400);
  });

  it("no projectId → 200 ack without touching the db", async () => {
    const res = await POST(
      createRequest(JSON.stringify({ commit: "abc123", ref: "refs/heads/main" })),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.message).toContain("exitosamente");
    expect(body.payloadSummary.commit).toBe("abc123");
    expect(body.payloadSummary.ref).toBe("refs/heads/main");
    expect(body.triggerTime).toBeDefined();
    expect(mockSelectChain).not.toHaveBeenCalled();
  });

  it("ack defaults commit to manual and ref to main", async () => {
    const res = await POST(createRequest(JSON.stringify({})));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.payloadSummary.commit).toBe("manual");
    expect(body.payloadSummary.ref).toBe("main");
  });

  it("projectId without audits → gate fail closed", async () => {
    mockSelectChain.mockResolvedValue([]);

    const res = await POST(
      createRequest(
        JSON.stringify({ projectId: "550e8400-e29b-41d4-a716-446655440000" }),
      ),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.gate).toBe("fail");
    expect(body.reasons).toEqual(["Sin auditorías registradas para este proyecto"]);
    expect(body.commit).toBe("manual");
    expect(body.ref).toBe("main");
  });

  it("clean audit → gate pass", async () => {
    mockSelectChain
      .mockResolvedValueOnce([{ id: "audit-1" }])
      .mockResolvedValueOnce([{ criticalCount: 0, warningCount: 0 }]);

    const res = await POST(
      createRequest(
        JSON.stringify({ projectId: "550e8400-e29b-41d4-a716-446655440000", commit: "deadbeef" }),
      ),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.gate).toBe("pass");
    expect(body.score).toBe(100);
    expect(body.criticals).toBe(0);
    expect(body.warnings).toBe(0);
    expect(body.reasons).toEqual([]);
    expect(body.commit).toBe("deadbeef");
    expect(mockSelectChain).toHaveBeenCalledTimes(2);
  });

  it("criticals over policy → gate fail", async () => {
    mockSelectChain
      .mockResolvedValueOnce([{ id: "audit-1" }])
      .mockResolvedValueOnce([{ criticalCount: "1", warningCount: "0" }]);

    const res = await POST(
      createRequest(
        JSON.stringify({ projectId: "550e8400-e29b-41d4-a716-446655440000" }),
      ),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.gate).toBe("fail");
    expect(body.criticals).toBe(1);
    expect(body.warnings).toBe(0);
    expect(body.score).toBe(85);
    expect(body.reasons).toHaveLength(1);
    expect(body.reasons[0]).toContain("crítica");
  });

  it("low score plus criticals → gate fail with both reasons", async () => {
    mockSelectChain
      .mockResolvedValueOnce([{ id: "audit-1" }])
      .mockResolvedValueOnce([{ criticalCount: 2, warningCount: 4 }]);

    const res = await POST(
      createRequest(
        JSON.stringify({
          projectId: "550e8400-e29b-41d4-a716-446655440000",
          failIf: { minScore: 70, maxCritical: 0 },
        }),
      ),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.gate).toBe("fail");
    expect(body.score).toBe(50);
    expect(body.criticals).toBe(2);
    expect(body.warnings).toBe(4);
    expect(body.reasons).toHaveLength(2);
  });

  it("db error → 500", async () => {
    mockSelectChain.mockRejectedValue(new Error("db down"));

    const res = await POST(
      createRequest(
        JSON.stringify({ projectId: "550e8400-e29b-41d4-a716-446655440000" }),
      ),
    );
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toBe("Error procesando el webhook de CI/CD");
  });

  it("missing SCAUDIT_WEBHOOK_SECRET → 503 fail-closed", async () => {
    delete process.env.SCAUDIT_WEBHOOK_SECRET;
    try {
      const res = await POST(createRequest(JSON.stringify({ commit: "abc" })));
      expect(res.status).toBe(503);
      const body = await res.json();
      expect(body.success).toBe(false);
      expect(body.error).toContain("SCAUDIT_WEBHOOK_SECRET");
      expect(mockVerifyWebhookSignature).not.toHaveBeenCalled();
    } finally {
      if (ORIGINAL_SECRET === undefined) {
        delete process.env.SCAUDIT_WEBHOOK_SECRET;
      } else {
        process.env.SCAUDIT_WEBHOOK_SECRET = ORIGINAL_SECRET;
      }
    }
  });
});
