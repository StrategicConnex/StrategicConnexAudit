import { describe, it, expect } from "vitest";
import { emitProjectEvent } from "./project-events";

describe("project-events — emisor saliente (B-3)", () => {
  it("nunca lanza aunque Trigger.dev falle", async () => {
    await expect(
      emitProjectEvent("p1", "uptime.down", { domain: "x.com" })
    ).resolves.toBeUndefined();
    await expect(
      emitProjectEvent("p1", "finding.critical", { title: "t" })
    ).resolves.toBeUndefined();
    await expect(
      emitProjectEvent("p1", "anomaly.detected", { totalAnomalies: 2 })
    ).resolves.toBeUndefined();
  });
});
