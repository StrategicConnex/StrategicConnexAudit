import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const sendSlackAlertMock = vi.hoisted(() => vi.fn());
const sendTeamsAlertMock = vi.hoisted(() => vi.fn());

vi.mock("@/server/integrations/slack/client", () => ({
  sendSlackAlert: sendSlackAlertMock,
}));
vi.mock("@/server/integrations/teams/client", () => ({
  sendTeamsAlert: sendTeamsAlertMock,
}));
vi.mock("@/lib/logger", () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { manageAlert, type AlertPayload } from "./alert-manager";
import { logger } from "@/lib/logger";
import { ok, err } from "@/shared/lib/result";

const alert: AlertPayload = {
  type: "vulnerability_found",
  message: "SQL Injection detected",
  severity: "critical",
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
  vi.stubEnv("SLACK_WEBHOOK_URL", "");
  vi.stubEnv("TEAMS_WEBHOOK_URL", "");
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, status: 200 })));
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("alert-manager — manageAlert", () => {
  it("sin webhooks configurados es un no-op exitoso", async () => {
    const summary = await manageAlert(alert);

    expect(summary.ok).toBe(true);
    expect(summary.attempted).toBe(0);
    expect(summary.delivered).toBe(0);
    expect(summary.failed).toBe(0);
    expect(summary.deliveries).toEqual([]);
    expect(sendSlackAlertMock).not.toHaveBeenCalled();
    expect(sendTeamsAlertMock).not.toHaveBeenCalled();
    expect(logger.info).toHaveBeenCalled();
  });

  it("enruta solo a Slack cuando solo SLACK_WEBHOOK_URL está configurada", async () => {
    vi.stubEnv("SLACK_WEBHOOK_URL", "https://hooks.slack.test/x");
    sendSlackAlertMock.mockResolvedValue(ok(undefined));

    const summary = await manageAlert(alert);

    expect(sendSlackAlertMock).toHaveBeenCalledWith(
      "https://hooks.slack.test/x",
      alert
    );
    expect(sendTeamsAlertMock).not.toHaveBeenCalled();
    expect(summary.ok).toBe(true);
    expect(summary.attempted).toBe(1);
    expect(summary.delivered).toBe(1);
    expect(summary.failed).toBe(0);
    expect(summary.deliveries).toHaveLength(1);
    expect(summary.deliveries[0]!.channel).toBe("slack");
    expect(summary.deliveries[0]!.result.ok).toBe(true);
  });

  it("enruta solo a Teams cuando solo TEAMS_WEBHOOK_URL está configurada", async () => {
    vi.stubEnv("TEAMS_WEBHOOK_URL", "https://outlook.office.test/x");
    sendTeamsAlertMock.mockResolvedValue(ok(undefined));

    const summary = await manageAlert(alert);

    expect(sendTeamsAlertMock).toHaveBeenCalledWith(
      "https://outlook.office.test/x",
      alert
    );
    expect(sendSlackAlertMock).not.toHaveBeenCalled();
    expect(summary.ok).toBe(true);
    expect(summary.attempted).toBe(1);
    expect(summary.delivered).toBe(1);
    expect(summary.deliveries[0]!.channel).toBe("teams");
  });

  it("envía a ambos canales cuando ambos webhooks están configurados", async () => {
    vi.stubEnv("SLACK_WEBHOOK_URL", "https://hooks.slack.test/x");
    vi.stubEnv("TEAMS_WEBHOOK_URL", "https://outlook.office.test/x");
    sendSlackAlertMock.mockResolvedValue(ok(undefined));
    sendTeamsAlertMock.mockResolvedValue(ok(undefined));

    const summary = await manageAlert(alert);

    expect(sendSlackAlertMock).toHaveBeenCalledTimes(1);
    expect(sendTeamsAlertMock).toHaveBeenCalledTimes(1);
    expect(summary.ok).toBe(true);
    expect(summary.attempted).toBe(2);
    expect(summary.delivered).toBe(2);
    expect(summary.failed).toBe(0);
    expect(summary.deliveries.map((d) => d.channel)).toEqual([
      "slack",
      "teams",
    ]);
    expect(logger.info).toHaveBeenCalled();
  });

  it("agrega fallos parciales sin lanzar excepciones", async () => {
    vi.stubEnv("SLACK_WEBHOOK_URL", "https://hooks.slack.test/x");
    vi.stubEnv("TEAMS_WEBHOOK_URL", "https://outlook.office.test/x");
    sendSlackAlertMock.mockResolvedValue(ok(undefined));
    sendTeamsAlertMock.mockResolvedValue(err(new Error("teams down")));

    const summary = await manageAlert(alert);

    expect(summary.ok).toBe(false);
    expect(summary.attempted).toBe(2);
    expect(summary.delivered).toBe(1);
    expect(summary.failed).toBe(1);
    expect(summary.deliveries[1]!.result.ok).toBe(false);
    if (summary.deliveries[1]!.result.ok === false) {
      expect(summary.deliveries[1]!.result.error.message).toBe("teams down");
    }
    expect(logger.warn).toHaveBeenCalledTimes(1);
    expect(logger.info).not.toHaveBeenCalled();
  });

  it("un cliente que lanza excepción se captura como fallo del canal", async () => {
    vi.stubEnv("SLACK_WEBHOOK_URL", "https://hooks.slack.test/x");
    sendSlackAlertMock.mockRejectedValue(new Error("boom"));

    const summary = await manageAlert(alert);

    expect(summary.ok).toBe(false);
    expect(summary.attempted).toBe(1);
    expect(summary.failed).toBe(1);
    expect(summary.deliveries[0]!.result.ok).toBe(false);
    if (summary.deliveries[0]!.result.ok === false) {
      expect(summary.deliveries[0]!.result.error.message).toBe("boom");
    }
    expect(logger.warn).toHaveBeenCalledTimes(1);
  });

  it("un webhook en blanco se trata como no configurado", async () => {
    vi.stubEnv("SLACK_WEBHOOK_URL", "   ");
    vi.stubEnv("TEAMS_WEBHOOK_URL", "");

    const summary = await manageAlert(alert);

    expect(summary.ok).toBe(true);
    expect(summary.attempted).toBe(0);
    expect(sendSlackAlertMock).not.toHaveBeenCalled();
    expect(sendTeamsAlertMock).not.toHaveBeenCalled();
  });

  it("todo fallido devuelve ok=false con ambos canales en el resumen", async () => {
    vi.stubEnv("SLACK_WEBHOOK_URL", "https://hooks.slack.test/x");
    vi.stubEnv("TEAMS_WEBHOOK_URL", "https://outlook.office.test/x");
    sendSlackAlertMock.mockResolvedValue(err(new Error("slack 500")));
    sendTeamsAlertMock.mockResolvedValue(err(new Error("teams 403")));

    const summary = await manageAlert(alert);

    expect(summary.ok).toBe(false);
    expect(summary.attempted).toBe(2);
    expect(summary.delivered).toBe(0);
    expect(summary.failed).toBe(2);
    expect(summary.deliveries).toHaveLength(2);
    expect(logger.warn).toHaveBeenCalledTimes(1);
  });
});
