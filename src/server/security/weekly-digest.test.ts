import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const queryQueue: Array<unknown> = [];

function pushQueryResult(...results: unknown[]) {
  for (const r of results) queryQueue.push(r);
}

function makeChain() {
  const c = {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    leftJoin: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    then: vi.fn((resolve: (val: unknown) => void) => {
      resolve(queryQueue.shift() ?? []);
    }),
  };
  return c;
}

vi.mock("@/shared/db", () => ({
  directDb: {
    select: () => makeChain(),
  },
}));

vi.mock("@/shared/db/schemas", () => ({
  projects: { id: "id", domain: "domain", ownerId: "ownerId", settings: "settings", deletedAt: "deletedAt", isDeleted: "isDeleted", isHidden: "isHidden" },
  uptimeLogs: { projectId: "projectId", checkedAt: "checkedAt", isUp: "isUp" },
  issues: { projectId: "projectId", severity: "severity" },
  anomalyDetections: { projectId: "projectId", detectedAt: "detectedAt" },
  users: { id: "id", email: "email" },
}));

vi.mock("@/server/security/siem-exporter", () => ({
  WEBHOOK_FORMATTERS: [],
  persistDelivery: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

import { digestSeverity, runWeeklyDigest } from "./weekly-digest";

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
  queryQueue.length = 0;
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("weekly-digest — severidad (P2-5)", () => {
  it("crítica con issues críticas aunque el uptime sea 100", () => {
    expect(digestSeverity(100, 2)).toBe("critical");
  });

  it("crítica con uptime bajo 95 sin issues", () => {
    expect(digestSeverity(94.9, 0)).toBe("critical");
  });

  it("info con uptime alto y sin issues", () => {
    expect(digestSeverity(99.5, 0)).toBe("info");
  });

  it("info sin datos de uptime ni issues", () => {
    expect(digestSeverity(null, 0)).toBe("info");
  });
});

describe("weekly-digest — runWeeklyDigest", () => {
  it("returns empty results when no active projects", async () => {
    pushQueryResult([]);
    const result = await runWeeklyDigest();
    expect(result.projects).toBe(0);
    expect(result.sent).toBe(0);
    expect(result.failed).toBe(0);
    expect(result.results).toEqual([]);
  });

  it("processes project with no SIEM channels (only direct delivery)", async () => {
    pushQueryResult([
      { id: "p1", domain: "example.com", ownerEmail: "owner@example.com", settings: {} },
    ]);
    pushQueryResult([{ total: 100 }]);
    pushQueryResult([{ ups: 95 }]);
    pushQueryResult([{ n: 2 }]);
    pushQueryResult([{ n: 1 }]);

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 200 }));

    const result = await runWeeklyDigest();
    expect(result.projects).toBe(1);
    expect(result.results).toHaveLength(1);
    expect(result.results[0]!.domain).toBe("example.com");
    expect(result.results[0]!.uptimePct).toBe(95);
    expect(result.results[0]!.criticalIssues).toBe(2);
    expect(result.results[0]!.anomalies7d).toBe(1);
  });

  it("logs error when project processing fails", async () => {
    pushQueryResult([{
      id: "p-fail",
      domain: "fail.com",
      ownerEmail: null,
      settings: null,
    }]);

    const errorChain = {
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockImplementation(() => {
        throw new Error("DB crash");
      }),
      leftJoin: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      then: vi.fn(),
    };

    const { directDb } = await import("@/shared/db");
    const origSelect = directDb.select;
    let callCount = 0;
    directDb.select = ((...args: unknown[]) => {
      callCount++;
      if (callCount === 1) return origSelect(...args);
      return errorChain;
    }) as typeof directDb.select;

    const result = await runWeeklyDigest();
    directDb.select = origSelect;
    expect(result.failed).toBe(1);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain("fail.com");
  });

  it("handles project with telegramChatId in settings", async () => {
    pushQueryResult([{
      id: "p2",
      domain: "tg.com",
      ownerEmail: "tg@example.com",
      settings: { telegramChatId: "12345" },
    }]);
    pushQueryResult([{ total: 50 }]);
    pushQueryResult([{ ups: 50 }]);
    pushQueryResult([{ n: 0 }]);
    pushQueryResult([{ n: 0 }]);

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 200 }));

    const result = await runWeeklyDigest();
    expect(result.results).toHaveLength(1);
    expect(result.results[0]!.domain).toBe("tg.com");
  });

  it("marks project as failed when no SIEM target succeeds", async () => {
    pushQueryResult([{
      id: "p3",
      domain: "nosend.com",
      ownerEmail: null,
      settings: null,
    }]);
    pushQueryResult([{ total: 10 }]);
    pushQueryResult([{ ups: 10 }]);
    pushQueryResult([{ n: 0 }]);
    pushQueryResult([{ n: 0 }]);

    vi.stubGlobal("fetch", vi.fn());

    const result = await runWeeklyDigest();
    expect(result.failed).toBe(1);
    expect(result.results[0]!.sent).toBe(false);
  });

  it("handles null ownerEmail and null settings gracefully", async () => {
    pushQueryResult([{
      id: "p4",
      domain: "nulls.com",
      ownerEmail: null,
      settings: null,
    }]);
    pushQueryResult([{ total: 20 }]);
    pushQueryResult([{ ups: 19 }]);
    pushQueryResult([{ n: 0 }]);
    pushQueryResult([{ n: 0 }]);

    vi.stubGlobal("fetch", vi.fn());

    const result = await runWeeklyDigest();
    expect(result.results).toHaveLength(1);
    expect(result.results[0]!.emailSent).toBe(false);
    expect(result.results[0]!.telegramSent).toBe(false);
  });

  it("uptimePct is null when total checks is 0", async () => {
    pushQueryResult([{
      id: "p5",
      domain: "empty.com",
      ownerEmail: "e@e.com",
      settings: {},
    }]);
    pushQueryResult([{ total: 0 }]);
    pushQueryResult([{ ups: 0 }]);
    pushQueryResult([{ n: 0 }]);
    pushQueryResult([{ n: 0 }]);

    vi.stubGlobal("fetch", vi.fn());

    const result = await runWeeklyDigest();
    expect(result.results[0]!.uptimePct).toBeNull();
  });

  it("handles multiple projects", async () => {
    pushQueryResult([
      { id: "p1", domain: "a.com", ownerEmail: "a@a.com", settings: {} },
      { id: "p2", domain: "b.com", ownerEmail: "b@b.com", settings: null },
    ]);
    // p1: 5 queries (total, ups, crit, anom)
    pushQueryResult([{ total: 200 }]);
    pushQueryResult([{ ups: 190 }]);
    pushQueryResult([{ n: 0 }]);
    pushQueryResult([{ n: 3 }]);
    // p2: 4 queries
    pushQueryResult([{ total: 100 }]);
    pushQueryResult([{ ups: 100 }]);
    pushQueryResult([{ n: 1 }]);
    pushQueryResult([{ n: 0 }]);

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 200 }));

    const result = await runWeeklyDigest();
    expect(result.projects).toBe(2);
    expect(result.results).toHaveLength(2);
  });

  it("uses WEBHOOK_FORMATTERS for SIEM channels when configured", async () => {
    const { WEBHOOK_FORMATTERS } = await import("@/server/security/siem-exporter");
    const mockFormatter = {
      name: "TestSlack",
      envVar: "SIEM_WEBHOOK_TEST",
      formatter: vi.fn().mockReturnValue({ url: "https://hooks.test.com", headers: {}, body: {} }),
    };
    (WEBHOOK_FORMATTERS as unknown[]).push(mockFormatter);

    vi.stubEnv("SIEM_WEBHOOK_TEST", "https://hooks.test.com");

    pushQueryResult([{
      id: "p6",
      domain: "siem.com",
      ownerEmail: null,
      settings: null,
    }]);
    pushQueryResult([{ total: 50 }]);
    pushQueryResult([{ ups: 50 }]);
    pushQueryResult([{ n: 0 }]);
    pushQueryResult([{ n: 0 }]);

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 200 }));

    try {
      const result = await runWeeklyDigest();
      expect(result.results).toHaveLength(1);
    } finally {
      const idx = (WEBHOOK_FORMATTERS as unknown[]).indexOf(mockFormatter);
      if (idx >= 0) (WEBHOOK_FORMATTERS as unknown[]).splice(idx, 1);
    }
  });
});

describe("weekly-digest — entrega directa (B-5)", () => {
  function pushProjectAndMetrics(project: Record<string, unknown>) {
    pushQueryResult([project]);
    pushQueryResult([{ total: 100 }]);
    pushQueryResult([{ ups: 95 }]);
    pushQueryResult([{ n: 0 }]);
    pushQueryResult([{ n: 0 }]);
  }

  it("envía email por Resend cuando hay ownerEmail y credenciales", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test_key");
    vi.stubEnv("SIEM_EMAIL_FROM", "digest@example.com");
    pushProjectAndMetrics({
      id: "p-mail",
      domain: "mail.com",
      ownerEmail: "owner@mail.com",
      settings: {},
    });
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal("fetch", fetchMock);

    const result = await runWeeklyDigest();
    expect(result.results[0]!.emailSent).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.resend.com/emails",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("emailSent=false cuando la llamada a Resend falla", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test_key");
    vi.stubEnv("SIEM_EMAIL_FROM", "digest@example.com");
    pushProjectAndMetrics({
      id: "p-mail-fail",
      domain: "mail-fail.com",
      ownerEmail: "owner@mail.com",
      settings: {},
    });
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("resend down")));

    const result = await runWeeklyDigest();
    expect(result.results[0]!.emailSent).toBe(false);
    expect(result.results[0]!.telegramSent).toBe(false);
  });

  it("envía Telegram cuando hay chat id y bot token", async () => {
    vi.stubEnv("TELEGRAM_BOT_TOKEN", "bot-token-123");
    pushProjectAndMetrics({
      id: "p-tg",
      domain: "tg.com",
      ownerEmail: null,
      settings: { telegramChatId: "42" },
    });
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal("fetch", fetchMock);

    const result = await runWeeklyDigest();
    expect(result.results[0]!.telegramSent).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.telegram.org/botbot-token-123/sendMessage",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("telegramSent=false cuando la llamada a Telegram falla", async () => {
    vi.stubEnv("TELEGRAM_BOT_TOKEN", "bot-token-123");
    pushProjectAndMetrics({
      id: "p-tg-fail",
      domain: "tg-fail.com",
      ownerEmail: null,
      settings: { telegramChatId: "42" },
    });
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("telegram down")));

    const result = await runWeeklyDigest();
    expect(result.results[0]!.telegramSent).toBe(false);
  });

  it("sin RESEND_API_KEY no intenta enviar email", async () => {
    vi.stubEnv("RESEND_API_KEY", "");
    pushProjectAndMetrics({
      id: "p-nokey",
      domain: "nokey.com",
      ownerEmail: "owner@nokey.com",
      settings: {},
    });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const result = await runWeeklyDigest();
    expect(result.results[0]!.emailSent).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("weekly-digest — canales SIEM (fallos de entrega)", () => {
  async function pushFormatter(name: string, envVar: string) {
    const { WEBHOOK_FORMATTERS } = await import("@/server/security/siem-exporter");
    const fmt = {
      name,
      envVar,
      formatter: vi.fn().mockReturnValue({ url: "https://hooks.test.com", headers: {}, body: {} }),
    };
    (WEBHOOK_FORMATTERS as unknown[]).push(fmt);
    vi.stubEnv(envVar, "https://hooks.test.com");
    return () => {
      const idx = (WEBHOOK_FORMATTERS as unknown[]).indexOf(fmt);
      if (idx >= 0) (WEBHOOK_FORMATTERS as unknown[]).splice(idx, 1);
    };
  }

  function pushProjectAndMetrics() {
    pushQueryResult([{ id: "p-siem", domain: "siem.com", ownerEmail: null, settings: null }]);
    pushQueryResult([{ total: 100 }]);
    pushQueryResult([{ ups: 100 }]);
    pushQueryResult([{ n: 0 }]);
    pushQueryResult([{ n: 0 }]);
  }

  it("persistDelivery con failed cuando el endpoint responde non-ok", async () => {
    const remove = await pushFormatter("FailHook", "SIEM_WEBHOOK_FAILTEST");
    pushProjectAndMetrics();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 500 }));

    try {
      const { persistDelivery } = await import("@/server/security/siem-exporter");
      const result = await runWeeklyDigest();
      expect(persistDelivery).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: "weekly_digest" }),
        "FailHook",
        "failed",
        500,
        null,
      );
      expect(result.sent).toBe(0);
      expect(result.failed).toBe(1);
      expect(result.results[0]!.sent).toBe(false);
    } finally {
      remove();
    }
  });

  it("persistDelivery con failed cuando fetch lanza excepción", async () => {
    const remove = await pushFormatter("ThrowHook", "SIEM_WEBHOOK_THROWTEST");
    pushProjectAndMetrics();
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));

    try {
      const { persistDelivery } = await import("@/server/security/siem-exporter");
      const result = await runWeeklyDigest();
      expect(persistDelivery).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: "weekly_digest" }),
        "ThrowHook",
        "failed",
        null,
        "network down",
      );
      expect(result.failed).toBe(1);
    } finally {
      remove();
    }
  });

  it("cuenta como enviado cuando el canal SIEM responde ok", async () => {
    const remove = await pushFormatter("OkHook", "SIEM_WEBHOOK_OKTEST");
    pushProjectAndMetrics();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 200 }));

    try {
      const { persistDelivery } = await import("@/server/security/siem-exporter");
      const result = await runWeeklyDigest();
      expect(persistDelivery).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: "weekly_digest" }),
        "OkHook",
        "success",
        200,
        null,
      );
      expect(result.sent).toBe(1);
      expect(result.failed).toBe(0);
      expect(result.results[0]!.sent).toBe(true);
    } finally {
      remove();
    }
  });
});

describe("weekly-digest — edge cases de datos, timeout y errores no-Error", () => {
  async function pushFormatter(name: string, envVar: string) {
    const { WEBHOOK_FORMATTERS } = await import("@/server/security/siem-exporter");
    const fmt = {
      name,
      envVar,
      formatter: vi.fn().mockReturnValue({ url: "https://hooks.test.com", headers: {}, body: {} }),
    };
    (WEBHOOK_FORMATTERS as unknown[]).push(fmt);
    vi.stubEnv(envVar, "https://hooks.test.com");
    return () => {
      const idx = (WEBHOOK_FORMATTERS as unknown[]).indexOf(fmt);
      if (idx >= 0) (WEBHOOK_FORMATTERS as unknown[]).splice(idx, 1);
    };
  }

  function pushProject(project: Record<string, unknown>) {
    pushQueryResult([project]);
  }

  it("métricas sin filas derivan a cero y uptime null", async () => {
    pushProject({ id: "p-empty", domain: "empty-metrics.com", ownerEmail: null, settings: null });
    pushQueryResult([]);
    pushQueryResult([]);
    pushQueryResult([]);
    pushQueryResult([]);

    vi.stubGlobal("fetch", vi.fn());

    const result = await runWeeklyDigest();
    expect(result.results[0]!.uptimePct).toBeNull();
    expect(result.results[0]!.criticalIssues).toBe(0);
    expect(result.results[0]!.anomalies7d).toBe(0);
    expect(result.results[0]!.sent).toBe(false);
  });

  it("email con uptime null usa placeholders en asunto y html", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test_key");
    vi.stubEnv("SIEM_EMAIL_FROM", "digest@example.com");
    pushProject({ id: "p-mail0", domain: "m0.com", ownerEmail: "o@m0.com", settings: {} });
    pushQueryResult([{ total: 0 }]);
    pushQueryResult([{ ups: 0 }]);
    pushQueryResult([{ n: 0 }]);
    pushQueryResult([{ n: 0 }]);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 200 }));

    const result = await runWeeklyDigest();
    expect(result.results[0]!.uptimePct).toBeNull();
    expect(result.results[0]!.emailSent).toBe(true);
  });

  it("telegram con uptime null usa placeholder sin datos", async () => {
    vi.stubEnv("TELEGRAM_BOT_TOKEN", "bot-token-123");
    pushProject({
      id: "p-tg0",
      domain: "tg0.com",
      ownerEmail: null,
      settings: { telegramChatId: "7" },
    });
    pushQueryResult([{ total: 0 }]);
    pushQueryResult([{ ups: 0 }]);
    pushQueryResult([{ n: 0 }]);
    pushQueryResult([{ n: 0 }]);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 200 }));

    const result = await runWeeklyDigest();
    expect(result.results[0]!.telegramSent).toBe(true);
  });

  it("maneja valores no-Error lanzados en el loop principal", async () => {
    pushProject({ id: "p-ne", domain: "nonerror.com", ownerEmail: null, settings: null });

    const errorChain = {
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockImplementation(() => {
        throw "string crash";
      }),
      leftJoin: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      then: vi.fn(),
    };

    const { directDb } = await import("@/shared/db");
    const origSelect = directDb.select;
    let callCount = 0;
    directDb.select = ((...args: unknown[]) => {
      callCount++;
      if (callCount === 1) return origSelect(...args);
      return errorChain;
    }) as typeof directDb.select;

    try {
      const result = await runWeeklyDigest();
      expect(result.failed).toBe(1);
      expect(result.errors[0]).toContain("nonerror.com");
      expect(result.errors[0]).toContain("string crash");
    } finally {
      directDb.select = origSelect;
    }
  });

  it("persistDelivery con failed cuando fetch rechaza con valor no-Error", async () => {
    const remove = await pushFormatter("StrHook", "SIEM_WEBHOOK_STRTEST");
    pushProject({ id: "p-str", domain: "str.com", ownerEmail: null, settings: null });
    pushQueryResult([{ total: 10 }]);
    pushQueryResult([{ ups: 10 }]);
    pushQueryResult([{ n: 0 }]);
    pushQueryResult([{ n: 0 }]);
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue("raw failure"));

    try {
      const { persistDelivery } = await import("@/server/security/siem-exporter");
      const result = await runWeeklyDigest();
      expect(persistDelivery).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: "weekly_digest" }),
        "StrHook",
        "failed",
        null,
        "raw failure",
      );
      expect(result.failed).toBe(1);
    } finally {
      remove();
    }
  });

  it("aborta la petición SIEM por timeout de 10s y registra failed", async () => {
    const remove = await pushFormatter("SlowHook", "SIEM_WEBHOOK_SLOWTEST");
    pushProject({ id: "p-slow", domain: "slow.com", ownerEmail: null, settings: null });
    pushQueryResult([{ total: 10 }]);
    pushQueryResult([{ ups: 10 }]);
    pushQueryResult([{ n: 0 }]);
    pushQueryResult([{ n: 0 }]);

    vi.useFakeTimers();
    const fetchMock = vi.fn(
      (_url: unknown, init: { signal: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          init.signal.addEventListener("abort", () => reject(new Error("aborted by timeout")));
        }),
    );
    vi.stubGlobal("fetch", fetchMock);

    try {
      const { persistDelivery } = await import("@/server/security/siem-exporter");
      const pending = runWeeklyDigest();
      await vi.advanceTimersByTimeAsync(10_000);
      const result = await pending;

      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(persistDelivery).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: "weekly_digest" }),
        "SlowHook",
        "failed",
        null,
        "aborted by timeout",
      );
      expect(result.failed).toBe(1);
      expect(result.results[0]!.sent).toBe(false);
    } finally {
      vi.useRealTimers();
      remove();
    }
  });
});
