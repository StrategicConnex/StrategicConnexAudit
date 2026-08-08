/* ═══════════════════════════════════════════════════════════════════════════
   cicd-helper — Tests del HMAC de webhooks CI/CD (RULE-007 v3.1)
   ═══════════════════════════════════════════════════════════════════════════ */

import { describe, it, expect } from "vitest";
import crypto from "crypto";
import {
  verifyWebhookSignature,
  generateGithubWorkflowSnippet,
  generateGitlabCiSnippet,
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
