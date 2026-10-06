import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import crypto from "node:crypto";
import { ACK_ACTION_ID } from "./route";

const mockRun = vi.fn();

vi.mock("@/server/integrations/commands/executor", () => ({
  runScAuditCommand: (...args: unknown[]) => mockRun(...args),
  parseAllowedProjectIds: (value: string | undefined) =>
    (value ?? "").split(",").map((s) => s.trim()).filter(Boolean),
}));

const SECRET = "test-slack-signing-secret";

function signedRequest(body: string, opts: { secret?: string } = {}) {
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = `v0=${crypto
    .createHmac("sha256", opts.secret ?? SECRET)
    .update(`v0:${timestamp}:${body}`)
    .digest("hex")}`;
  return new Request("http://localhost:3000/api/integrations/slack/interactive", {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      "x-slack-request-timestamp": String(timestamp),
      "x-slack-signature": signature,
    },
    body,
  });
}

function payloadBody(payload: unknown): string {
  return `payload=${encodeURIComponent(JSON.stringify(payload))}`;
}

describe("POST /api/integrations/slack/interactive", () => {
  let POST: typeof import("./route").POST;

  beforeEach(async () => {
    vi.clearAllMocks();
    process.env.SLACK_SIGNING_SECRET = SECRET;
    process.env.SLACK_ALLOWED_PROJECT_IDS = "p-1";
    mockRun.mockResolvedValue({ text: "ack ok", error: false });
    ({ POST } = await import("./route"));
  });

  afterEach(() => {
    delete process.env.SLACK_SIGNING_SECRET;
    delete process.env.SLACK_ALLOWED_PROJECT_IDS;
  });

  it("sin secreto → 503", async () => {
    delete process.env.SLACK_SIGNING_SECRET;
    const res = await POST(signedRequest(payloadBody({ type: "block_actions" })));
    expect(res.status).toBe(503);
  });

  it("firma inválida → 401", async () => {
    const res = await POST(signedRequest(payloadBody({ type: "block_actions" }), { secret: "malo" }));
    expect(res.status).toBe(401);
    expect(mockRun).not.toHaveBeenCalled();
  });

  it("sin payload → 400", async () => {
    const res = await POST(signedRequest("user=1"));
    expect(res.status).toBe(400);
  });

  it("payload no-JSON → 400", async () => {
    const res = await POST(signedRequest("payload=%7Bno-json"));
    expect(res.status).toBe(400);
  });

  it("botón de acuse → reutiliza el ejecutor con el findingId y el usuario", async () => {
    const res = await POST(
      signedRequest(
        payloadBody({
          type: "block_actions",
          user: { username: "ana" },
          actions: [{ action_id: ACK_ACTION_ID, value: "f-1" }],
        }),
      ),
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.text).toBe("ack ok");
    expect(body.replace_original).toBe(false);
    expect(mockRun).toHaveBeenCalledWith(
      { name: "ack", args: ["f-1"], raw: "ack f-1" },
      { allowedProjectIds: ["p-1"], source: "Slack (ana)" },
    );
  });

  it("acción desconocida → no ejecuta nada", async () => {
    const res = await POST(
      signedRequest(
        payloadBody({ type: "block_actions", actions: [{ action_id: "otra", value: "x" }] }),
      ),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.text).toContain("Acción no reconocida");
    expect(mockRun).not.toHaveBeenCalled();
  });

  it("acción de acuse sin value → no ejecuta nada", async () => {
    const res = await POST(
      signedRequest(payloadBody({ type: "block_actions", actions: [{ action_id: ACK_ACTION_ID }] })),
    );
    const body = await res.json();
    expect(body.text).toContain("Acción no reconocida");
    expect(mockRun).not.toHaveBeenCalled();
  });
});
