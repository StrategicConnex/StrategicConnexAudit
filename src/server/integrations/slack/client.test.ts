import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import { sendSlackAlert } from "./client";
import { formatSlackAlert } from "./formatter";
import type { SlackAlert } from "./types";

const WEBHOOK_URL = "https://hooks.slack.com/services/test";

const alert: SlackAlert = {
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

describe("slack — formatSlackAlert", () => {
  it("construye el texto con tag de severidad, tipo y mensaje", () => {
    expect(formatSlackAlert(alert)).toEqual({
      text: "*[CRITICAL] vulnerability_found*\nSQL Injection detected",
    });
  });

  it("escala la severidad a mayúsculas", () => {
    expect(formatSlackAlert({ ...alert, severity: "warning" }).text).toContain(
      "[WARNING]"
    );
    expect(formatSlackAlert({ ...alert, severity: "info" }).text).toContain(
      "[INFO]"
    );
  });

  it("conserva el mensaje exacto al final del texto", () => {
    const { text } = formatSlackAlert(alert);
    expect(text.endsWith(alert.message)).toBe(true);
    expect(text.startsWith("*[")).toBe(true);
  });
});

describe("slack — sendSlackAlert", () => {
  it("POSTea el payload JSON al webhook y devuelve ok", async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await sendSlackAlert(WEBHOOK_URL, alert);

    expect(result.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      WEBHOOK_URL,
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formatSlackAlert(alert)),
      })
    );
  });

  it("devuelve err cuando la respuesta no es ok", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 500 })));

    const result = await sendSlackAlert(WEBHOOK_URL, alert);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBeInstanceOf(Error);
      expect(result.error.message).toContain("500");
    }
  });

  it("devuelve err cuando fetch lanza una excepción", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("network down");
      })
    );

    const result = await sendSlackAlert(WEBHOOK_URL, alert);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBeInstanceOf(Error);
      expect(result.error.message).toBe("network down");
    }
  });

  it("normaliza valores lanzados que no son Error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw "raw failure";
      })
    );

    const result = await sendSlackAlert(WEBHOOK_URL, alert);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBeInstanceOf(Error);
      expect(result.error.message).toBe("raw failure");
    }
  });

  it("nunca lanza: el fallo total se reporta como Result err", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new Error("boom"))));

    await expect(sendSlackAlert(WEBHOOK_URL, alert)).resolves.toMatchObject({
      ok: false,
    });
  });
});
