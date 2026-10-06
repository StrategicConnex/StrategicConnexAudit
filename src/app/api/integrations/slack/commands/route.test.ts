/* ═══════════════════════════════════════════════════════════════════════════
   POST /api/integrations/slack/commands — Tests (Tanda 4 / B16)

   La verificación de firma es la REAL (crypto), no un mock: si la ruta
   dejara de verificar, estos tests lo detectarían.
   ═══════════════════════════════════════════════════════════════════════════ */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import crypto from "node:crypto";

const mockRun = vi.fn();

vi.mock("@/server/integrations/commands/executor", () => ({
  runScAuditCommand: (...args: unknown[]) => mockRun(...args),
  parseAllowedProjectIds: (value: string | undefined) =>
    (value ?? "").split(",").map((s) => s.trim()).filter(Boolean),
}));

const SECRET = "test-slack-signing-secret";
const PROJECT = "550e8400-e29b-41d4-a716-446655440000";

function signedRequest(body: string, opts: { secret?: string; timestamp?: number } = {}) {
  const timestamp = opts.timestamp ?? Math.floor(Date.now() / 1000);
  const secret = opts.secret ?? SECRET;
  const signature = `v0=${crypto
    .createHmac("sha256", secret)
    .update(`v0:${timestamp}:${body}`)
    .digest("hex")}`;
  return new Request("http://localhost:3000/api/integrations/slack/commands", {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      "x-slack-request-timestamp": String(timestamp),
      "x-slack-signature": signature,
    },
    body,
  });
}

describe("POST /api/integrations/slack/commands", () => {
  let POST: typeof import("./route").POST;

  beforeEach(async () => {
    vi.clearAllMocks();
    process.env.SLACK_SIGNING_SECRET = SECRET;
    process.env.SLACK_ALLOWED_PROJECT_IDS = PROJECT;
    mockRun.mockResolvedValue({ text: "ok", error: false });
    ({ POST } = await import("./route"));
  });

  afterEach(() => {
    delete process.env.SLACK_SIGNING_SECRET;
    delete process.env.SLACK_ALLOWED_PROJECT_IDS;
  });

  it("sin SLACK_SIGNING_SECRET → 503 (fail-closed) y no ejecuta nada", async () => {
    delete process.env.SLACK_SIGNING_SECRET;
    const res = await POST(signedRequest("text=status"));
    expect(res.status).toBe(503);
    expect(mockRun).not.toHaveBeenCalled();
  });

  it("firma inválida → 401 y no ejecuta nada", async () => {
    const res = await POST(signedRequest("text=status", { secret: "secreto-equivocado" }));
    expect(res.status).toBe(401);
    expect(mockRun).not.toHaveBeenCalled();
  });

  it("timestamp viejo → 401 (anti-replay)", async () => {
    const res = await POST(signedRequest("text=status", { timestamp: Math.floor(Date.now() / 1000) - 600 }));
    expect(res.status).toBe(401);
    expect(mockRun).not.toHaveBeenCalled();
  });

  it("comando válido → 200 ephemeral con bloques y allowlist aplicada", async () => {
    mockRun.mockResolvedValue({
      text: "postura",
      error: false,
      actions: [{ text: "Acusar 550e8400", value: "f-1" }],
    });

    const res = await POST(
      signedRequest(`text=${encodeURIComponent(`status ${PROJECT}`)}&user_name=ana&command=/scaudit`),
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.response_type).toBe("ephemeral");
    expect(body.text).toBe("postura");
    expect(body.blocks).toHaveLength(2);

    expect(mockRun).toHaveBeenCalledWith(
      { name: "status", args: [PROJECT], raw: `status ${PROJECT}` },
      { allowedProjectIds: [PROJECT], source: "Slack (ana)" },
    );
  });

  it("comando desconocido → 200 con el error de uso y sin tocar el ejecutor", async () => {
    const res = await POST(signedRequest(`text=${encodeURIComponent("destruir-nada")}`));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.text).toContain("Comando desconocido");
    expect(mockRun).not.toHaveBeenCalled();
  });

  it("texto vacío → 200 con la ayuda de uso", async () => {
    const res = await POST(signedRequest("text="));
    const body = await res.json();
    expect(body.text).toContain("Falta el comando");
    expect(mockRun).not.toHaveBeenCalled();
  });
});
