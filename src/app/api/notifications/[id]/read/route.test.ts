import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  getCurrentUserOrThrow: vi.fn(),
  markNotificationRead: vi.fn(),
}));

vi.mock("@/shared/lib/auth", () => ({
  getCurrentUserOrThrow: mocks.getCurrentUserOrThrow,
}));

vi.mock("@/server/notifications/emit", () => ({
  markNotificationRead: mocks.markNotificationRead,
}));

function post(): NextRequest {
  return new NextRequest(
    new Request("http://localhost:3000/api/notifications/n1/read", { method: "POST" }),
  );
}

const ctx = { params: Promise.resolve({ id: "n1" }) };

describe("Notifications — [id]/read", () => {
  let POST: typeof import("./route").POST;

  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await import("./route");
    POST = mod.POST;
    mocks.getCurrentUserOrThrow.mockResolvedValue({ id: "user-1" });
  });

  it("200 cuando la notificación es del usuario", async () => {
    mocks.markNotificationRead.mockResolvedValue(true);
    const res = await POST(post(), ctx);
    expect(res.status).toBe(200);
    expect(mocks.markNotificationRead).toHaveBeenCalledWith("user-1", "n1");
  });

  it("404 si no era del usuario (o no existe)", async () => {
    mocks.markNotificationRead.mockResolvedValue(false);
    const res = await POST(post(), ctx);
    expect(res.status).toBe(404);
  });

  it("sin autenticación → 500", async () => {
    mocks.getCurrentUserOrThrow.mockRejectedValue(new Error("No autorizado"));
    const res = await POST(post(), ctx);
    expect(res.status).toBe(500);
  });
});
