/* ═══════════════════════════════════════════════════════════════════════════
   cicd-helper — Tests del HMAC de webhooks CI/CD (RULE-007 v3.1)
   ═══════════════════════════════════════════════════════════════════════════ */

import { describe, it, expect } from "vitest";
import crypto from "crypto";
import {
  verifyWebhookSignature,
  generateGithubWorkflowSnippet,
  generateGitlabCiSnippet,
  generateGithubGateSnippet,
  evaluateGate,
} from "./cicd-helper";

const SECRET = "test-secret-123";

function sign(payload: string, secret: string): string {
  const hmac = crypto.createHmac("sha256", secret);
  return `sha256=${hmac.update(payload).digest("hex")}`;
}

describe("verifyWebhookSignature", () => {
  it("acepta una firma HMAC-SHA256 válida", () => {
    const payload = '{"commit":"abc123","ref":"refs/heads/main"}';
    const signature = sign(payload, SECRET);
    expect(verifyWebhookSignature(payload, signature, SECRET)).toBe(true);
  });

  it("rechaza una firma inválida", () => {
    const payload = '{"commit":"abc123"}';
    expect(verifyWebhookSignature(payload, "sha256=deadbeef", SECRET)).toBe(false);
  });

  it("rechaza firma de otro secret (mismo payload)", () => {
    const payload = '{"commit":"abc123"}';
    const signature = sign(payload, "otro-secret");
    expect(verifyWebhookSignature(payload, signature, SECRET)).toBe(false);
  });

  it("rechaza payload manipulado (firma de payload distinto)", () => {
    const payload = '{"commit":"abc123"}';
    const signature = sign('{"commit":"tampered"}', SECRET);
    expect(verifyWebhookSignature(payload, signature, SECRET)).toBe(false);
  });

  it("rechaza firma vacía", () => {
    expect(verifyWebhookSignature("{}", "", SECRET)).toBe(false);
  });

  it("rechaza secret vacío", () => {
    const signature = sign("{}", "");
    expect(verifyWebhookSignature("{}", signature, "")).toBe(false);
  });

  it("rechaza firma sin prefijo sha256=", () => {
    const payload = "{}";
    const bare = crypto
      .createHmac("sha256", SECRET)
      .update(payload)
      .digest("hex");
    expect(verifyWebhookSignature(payload, bare, SECRET)).toBe(false);
  });

  it("es determinista: misma entrada → misma firma esperada", () => {
    const payload = "payload-estable";
    const signature = sign(payload, SECRET);
    expect(verifyWebhookSignature(payload, signature, SECRET)).toBe(true);
    expect(verifyWebhookSignature(payload, signature, SECRET)).toBe(true);
  });
});

describe("generateGithubWorkflowSnippet", () => {
  it("incluye la URL del webhook y el header X-SCAUDIT-Signature", () => {
    const snippet = generateGithubWorkflowSnippet("https://scaudit.vercel.app/api/webhooks/cicd");
    expect(snippet).toContain("https://scaudit.vercel.app/api/webhooks/cicd");
    expect(snippet).toContain("X-SCAUDIT-Signature");
    expect(snippet).toContain("SCAUDIT_WEBHOOK_SECRET");
  });
});

describe("generateGitlabCiSnippet", () => {
  it("incluye la URL del webhook y el secret de CI", () => {
    const snippet = generateGitlabCiSnippet("https://scaudit.vercel.app/api/webhooks/cicd");
    expect(snippet).toContain("https://scaudit.vercel.app/api/webhooks/cicd");
    expect(snippet).toContain("X-SCAUDIT-Signature");
    expect(snippet).toContain("SCAUDIT_WEBHOOK_SECRET");
  });
});

describe("evaluateGate — quality gate CI/CD (B-1)", () => {
  it("pass con score alto y cero críticas", () => {
    expect(evaluateGate(85, 0, 2)).toMatchObject({ gate: "pass", score: 85 });
  });

  it("fail con críticas sobre el máximo", () => {
    const r = evaluateGate(90, 2, 0);
    expect(r.gate).toBe("fail");
    expect(r.reasons.join(" ")).toContain("crítica");
  });

  it("fail con score bajo el mínimo", () => {
    const r = evaluateGate(60, 0, 1);
    expect(r.gate).toBe("fail");
    expect(r.reasons.join(" ")).toContain("60");
  });

  it("fail cerrado sin auditoría (score null)", () => {
    const r = evaluateGate(null, 0, 0);
    expect(r.gate).toBe("fail");
  });

  it("respeta política personalizada", () => {
    expect(evaluateGate(60, 1, 0, { maxCritical: 2, minScore: 50 }).gate).toBe("pass");
    expect(evaluateGate(60, 3, 0, { maxCritical: 2, minScore: 50 }).gate).toBe("fail");
  });
});

describe("generateGithubGateSnippet", () => {
  it("incluye projectId y salida con exit 1", () => {
    const snippet = generateGithubGateSnippet("https://x/api/webhooks/cicd", "proj-1");
    expect(snippet).toContain("proj-1");
    expect(snippet).toContain("exit 1");
    expect(snippet).toContain('"gate":"pass"');
  });
});
