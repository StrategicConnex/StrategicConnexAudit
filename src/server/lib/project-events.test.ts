import { describe, it, expect, vi, beforeEach } from "vitest";
import { emitProjectEvent } from "./project-events";

const triggerMock = vi.hoisted(() => vi.fn());

vi.mock("@trigger.dev/sdk", () => ({
  tasks: { trigger: triggerMock },
}));

describe("project-events — emisor saliente (B-3)", () => {
  beforeEach(() => {
    triggerMock.mockReset();
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

  it("delega en dispatch-webhook-task con el payload correcto", async () => {
    triggerMock.mockResolvedValue({ id: "run_1" });

    await emitProjectEvent("p1", "uptime.down", { domain: "x.com" });

    expect(triggerMock).toHaveBeenCalledWith("dispatch-webhook-task", {
      projectId: "p1",
      event: "uptime.down",
      data: { domain: "x.com" },
    });
  });
});
