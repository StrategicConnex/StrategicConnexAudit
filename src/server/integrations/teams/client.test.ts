import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import { sendTeamsAlert } from "./client";
import { formatTeamsAlert } from "./formatter";
import type { TeamsAlert } from "./types";

const WEBHOOK_URL = "https://outlook.office.com/webhook/test";

const alert: TeamsAlert = {
  type: "vulnerability_found",
  message: "SQL Injection detected",
  severity: "critical",
};

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("teams — formatTeamsAlert", () => {
  it("construye un MessageCard de Office 365", () => {
    expect(formatTeamsAlert(alert)).toEqual({
      "@type": "MessageCard",
      "@context": "http://schema.org/extensions",
      summary: "[CRITICAL] vulnerability_found",
      themeColor: "dc2626",
      title: "[CRITICAL] vulnerability_found",
      text: "SQL Injection detected",
    });
  });

  it("asigna themeColor según la severidad", () => {
    expect(formatTeamsAlert({ ...alert, severity: "critical" }).themeColor).toBe(
      "dc2626"
    );
    expect(formatTeamsAlert({ ...alert, severity: "warning" }).themeColor).toBe(
      "f59e0b"
    );
    expect(formatTeamsAlert({ ...alert, severity: "info" }).themeColor).toBe(
      "3b82f6"
    );
  });

  it("incluye tag de severidad en mayúsculas, tipo y mensaje", () => {
    const card = formatTeamsAlert({ ...alert, severity: "info" });
    expect(card.title).toBe("[INFO] vulnerability_found");
    expect(card.summary).toBe("[INFO] vulnerability_found");
    expect(card.text).toBe("SQL Injection detected");
  });
});

describe("teams — sendTeamsAlert", () => {
  it("POSTea el MessageCard JSON al webhook y devuelve ok", async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await sendTeamsAlert(WEBHOOK_URL, alert);

    expect(result.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      WEBHOOK_URL,
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formatTeamsAlert(alert)),
      })
    );
  });

  it("devuelve err cuando la respuesta no es ok", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 403 })));

    const result = await sendTeamsAlert(WEBHOOK_URL, alert);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBeInstanceOf(Error);
      expect(result.error.message).toContain("403");
    }
  });

  it("devuelve err cuando fetch lanza una excepción", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("teams unreachable");
      })
    );

    const result = await sendTeamsAlert(WEBHOOK_URL, alert);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBeInstanceOf(Error);
      expect(result.error.message).toBe("teams unreachable");
    }
  });

  it("normaliza valores lanzados que no son Error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw "raw failure";
      })
    );

    const result = await sendTeamsAlert(WEBHOOK_URL, alert);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBeInstanceOf(Error);
      expect(result.error.message).toBe("raw failure");
    }
  });

  it("nunca lanza: el fallo total se reporta como Result err", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new Error("boom"))));

    await expect(sendTeamsAlert(WEBHOOK_URL, alert)).resolves.toMatchObject({
      ok: false,
    });
  });
});
