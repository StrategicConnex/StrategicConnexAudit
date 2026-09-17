import { describe, it, expect } from "vitest";
import { recordAiUsage, assertAiQuota } from "./ai-usage";
import { checkAiDailyQuota } from "@/shared/lib/ratelimit";

function fakeDb(captured: { v?: unknown }, fail = false) {
  return {
    insert: (_t: unknown) => ({
      values: async (v: unknown) => {
        if (fail) throw new Error("db caída");
        captured.v = v;
      },
    }),
  };
}

describe("ai-usage — telemetría anti-ruina (P0-1)", () => {
  it("recordAiUsage persiste la fila sin lanzar", async () => {
    const captured: { v?: unknown } = {};
    await recordAiUsage(
      {
        userId: "u-1",
        taskType: "seo-report",
        modelUsed: "m",
        latencyMs: 12,
        success: true,
      },
      fakeDb(captured)
    );
    expect(captured.v).toMatchObject({
      userId: "u-1",
      taskType: "seo-report",
      modelUsed: "m",
      success: true,
    });
  });

  it("recordAiUsage jamás lanza aunque la DB falle", async () => {
    await expect(
      recordAiUsage(
        { userId: null, taskType: "general-chat", modelUsed: "none", success: false },
        fakeDb({}, true)
      )
    ).resolves.toBeUndefined();
  });

  it("cuota diaria seo-report: 20 pasan, la 21ª falla", async () => {
    const uid = `q-${Date.now()}`;
    for (let i = 0; i < 20; i++) {
      const r = await checkAiDailyQuota(uid, "seo-report");
      expect(r.success).toBe(true);
    }
    const blocked = await checkAiDailyQuota(uid, "seo-report");
    expect(blocked.success).toBe(false);
    expect(blocked.remaining).toBe(0);
  });

  it("cuotas son independientes por task", async () => {
    const uid = `q2-${Date.now()}`;
    for (let i = 0; i < 20; i++) {
      await checkAiDailyQuota(uid, "seo-report");
    }
    const other = await checkAiDailyQuota(uid, "general-chat");
    expect(other.success).toBe(true);
  });

  it("assertAiQuota retorna 429 con headers cuando se agota", async () => {
    const uid = `q3-${Date.now()}`;
    for (let i = 0; i < 20; i++) {
      await checkAiDailyQuota(uid, "seo-report");
    }
    const res = await assertAiQuota(uid, "seo-report");
    expect(res).not.toBeNull();
    expect(res!.status).toBe(429);
    expect(res!.headers.get("X-AI-Quota-Remaining")).toBe("0");
    const body = await res!.json();
    expect(body.success).toBe(false);
  });

  it("assertAiQuota retorna null con cuota disponible", async () => {
    const res = await assertAiQuota(`q4-${Date.now()}`, "seo-report");
    expect(res).toBeNull();
  });
});
