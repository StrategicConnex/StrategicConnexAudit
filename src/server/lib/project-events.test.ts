import { describe, it, expect, vi, beforeEach } from "vitest";
import { emitProjectEvent } from "./project-events";

const triggerMock = vi.hoisted(() => vi.fn());
const pushMock = vi.hoisted(() => vi.fn());
const narrateMock = vi.hoisted(() => vi.fn());
const fallbackMock = vi.hoisted(() =>
  vi.fn(
    (event: string, domain: string) => `fb:${event}:${domain}`
  )
);

vi.mock("@trigger.dev/sdk", () => ({
  tasks: { trigger: triggerMock },
}));

vi.mock("@/server/ai/narrated-alerts", () => ({
  narrateAlert: narrateMock,
  fallbackNarration: fallbackMock,
}));

vi.mock("@/server/notifications/project-push", () => ({
  pushProjectEventToOwner: pushMock,
}));

describe("project-events — emisor saliente (B-3) con narración IA (Sprint 3)", () => {
  beforeEach(() => {
    triggerMock.mockReset();
    pushMock.mockReset();
    narrateMock.mockReset();
    fallbackMock.mockReset();
    fallbackMock.mockImplementation(
      (event: string, domain: string) => `fb:${event}:${domain}`
    );
    pushMock.mockResolvedValue({ sent: 1, failed: 0 });
    narrateMock.mockResolvedValue(null);
  });

  it("nunca lanza aunque Trigger.dev falle (rechazo async)", async () => {
    triggerMock.mockRejectedValue(new Error("trigger down"));

    await expect(
      emitProjectEvent("p1", "uptime.down", { domain: "x.com" })
    ).resolves.toBeUndefined();
    await expect(
      emitProjectEvent("p1", "finding.critical", { title: "t" })
    ).resolves.toBeUndefined();
    await expect(
      emitProjectEvent("p1", "anomaly.detected", { totalAnomalies: 2 })
    ).resolves.toBeUndefined();

    expect(triggerMock).toHaveBeenCalledTimes(3);
  });

  it("tampoco propaga errores síncronos del SDK", async () => {
    triggerMock.mockImplementation(() => {
      throw new Error("sync boom");
    });

    await expect(
      emitProjectEvent("p1", "finding.critical", { title: "t" })
    ).resolves.toBeUndefined();
  });

  it("delega en dispatch-webhook-task con el payload correcto (sin narración posible)", async () => {
    triggerMock.mockResolvedValue({ id: "run_1" });
    narrateMock.mockResolvedValue(null);
    fallbackMock.mockReturnValue(null as unknown as string);

    await emitProjectEvent("p1", "uptime.down", { domain: "x.com" });

    expect(triggerMock).toHaveBeenCalledWith("dispatch-webhook-task", {
      projectId: "p1",
      event: "uptime.down",
      data: { domain: "x.com" },
    });
  });

  it("incluye la narración IA en el payload del webhook y hace push al propietario", async () => {
    narrateMock.mockResolvedValue("Se detectó una caída en x.com.");
    fallbackMock.mockClear();

    await emitProjectEvent("p1", "uptime.down", { domain: "x.com" });

    // Narración pedida con el contexto correcto.
    expect(narrateMock).toHaveBeenCalledWith("uptime.down", {
      projectId: "p1",
      domain: "x.com",
      data: { domain: "x.com" },
    });

    // El webhook recibe la narración para sus consumidores.
    expect(triggerMock).toHaveBeenCalledWith("dispatch-webhook-task", {
      projectId: "p1",
      event: "uptime.down",
      data: { domain: "x.com", narrative: "Se detectó una caída en x.com." },
    });

    // Push narrado al propietario.
    expect(pushMock).toHaveBeenCalledWith(
      "p1",
      "uptime.down",
      "Se detectó una caída en x.com.",
      { domain: "x.com" }
    );
  });

  it("usa el fallback determinista cuando la IA no narra y push igualmente notifica", async () => {
    narrateMock.mockRejectedValue(new Error("IA caída"));

    await emitProjectEvent("p1", "finding.critical", { domain: "y.io", title: "t" });

    expect(fallbackMock).toHaveBeenCalledWith("finding.critical", "y.io");
    expect(pushMock).toHaveBeenCalledWith(
      "p1",
      "finding.critical",
      "fb:finding.critical:y.io",
      { domain: "y.io", title: "t" }
    );
  });

  it("el fallo del push no rompe el evento (webhook sigue entregándose)", async () => {
    narrateMock.mockResolvedValue(null);
    fallbackMock.mockReturnValue(null as unknown as string);
    pushMock.mockRejectedValue(new Error("push down"));

    await expect(
      emitProjectEvent("p1", "anomaly.detected", { domain: "z.net" })
    ).resolves.toBeUndefined();
    expect(triggerMock).toHaveBeenCalledTimes(1);
  });
});
