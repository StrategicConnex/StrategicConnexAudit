import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const mockRun = vi.fn();
const mockVerify = vi.fn();

vi.mock("@/server/integrations/commands/executor", () => ({
  runScAuditCommand: (...args: unknown[]) => mockRun(...args),
  parseAllowedProjectIds: (value: string | undefined) =>
    (value ?? "").split(",").map((s) => s.trim()).filter(Boolean),
}));

vi.mock("@/server/security/cicd-helper", () => ({
  verifyWebhookSignature: (...args: unknown[]) => mockVerify(...args),
}));

function request(body: unknown) {
  return new Request("http://localhost:3000/api/integrations/teams/commands", {
    method: "POST",
    headers: { "content-type": "application/json", "x-scaudit-signature": "sha256=fake" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/integrations/teams/commands", () => {
  let POST: typeof import("./route").POST;

  beforeEach(async () => {
    vi.clearAllMocks();
    process.env.SCAUDIT_TEAMS_SECRET = "teams-secret";
    process.env.SLACK_ALLOWED_PROJECT_IDS = "p-1";
    mockVerify.mockReturnValue(true);
    mockRun.mockResolvedValue({ text: "postura", error: false });
    ({ POST } = await import("./route"));
  });

  afterEach(() => {
    delete process.env.SCAUDIT_TEAMS_SECRET;
    delete process.env.SLACK_ALLOWED_PROJECT_IDS;
  });

  it("sin SCAUDIT_TEAMS_SECRET → 503 (fail-closed)", async () => {
    delete process.env.SCAUDIT_TEAMS_SECRET;
    const res = await POST(request({ type: "message", text: "help" }));
    expect(res.status).toBe(503);
    expect(mockRun).not.toHaveBeenCalled();
  });

  it("firma inválida → 401", async () => {
    mockVerify.mockReturnValue(false);
    const res = await POST(request({ type: "message", text: "help" }));
    expect(res.status).toBe(401);
    expect(mockRun).not.toHaveBeenCalled();
  });

  it("mensaje válido → 200 con el comando parseado (mención HTML fuera)", async () => {
    const res = await POST(
      request({ type: "message", text: "<at>SCAudit</at> status&nbsp;p-1", from: { name: "Ana" } }),
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ type: "message", text: "postura" });
    expect(mockRun).toHaveBeenCalledWith(
      { name: "status", args: ["p-1"], raw: "status p-1" },
      { allowedProjectIds: ["p-1"], source: "Teams (Ana)" },
    );
  });

  it("comando desconocido → 200 con error de uso, sin ejecutar", async () => {
    const res = await POST(request({ type: "message", text: "<at>Bot</at> destruir" }));
    const body = await res.json();
    expect(body.text).toContain("Comando desconocido");
    expect(mockRun).not.toHaveBeenCalled();
  });

  it("cuerpo no-JSON → 400 (tras verificar la firma)", async () => {
    const res = await POST(
      new Request("http://localhost:3000/api/integrations/teams/commands", {
        method: "POST",
        headers: { "x-scaudit-signature": "sha256=fake" },
        body: "no-json",
      }),
    );
    expect(res.status).toBe(400);
  });
});
