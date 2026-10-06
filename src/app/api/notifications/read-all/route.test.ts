import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  getCurrentUserOrThrow: vi.fn(),
  markAllNotificationsRead: vi.fn(),
}));

vi.mock("@/shared/lib/auth", () => ({
  getCurrentUserOrThrow: mocks.getCurrentUserOrThrow,
}));

vi.mock("@/server/notifications/emit", () => ({
  markAllNotificationsRead: mocks.markAllNotificationsRead,
}));

function post(): NextRequest {
  return new NextRequest(
    new Request("http://localhost:3000/api/notifications/read-all", { method: "POST" }),
  );
}

describe("Notifications — read-all", () => {
  let POST: typeof import("./route").POST;

  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await import("./route");
    POST = mod.POST;
    mocks.getCurrentUserOrThrow.mockResolvedValue({ id: "user-1" });
  });

  it("200 con el número actualizado", async () => {
    mocks.markAllNotificationsRead.mockResolvedValue(4);
    const res = await POST(post());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.updated).toBe(4);
    expect(mocks.markAllNotificationsRead).toHaveBeenCalledWith("user-1");
  });

  it("sin autenticación → 500", async () => {
    mocks.getCurrentUserOrThrow.mockRejectedValue(new Error("No autorizado"));
    const res = await POST(post());
    expect(res.status).toBe(500);
  });
});
