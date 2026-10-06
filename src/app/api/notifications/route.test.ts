import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  getCurrentUserOrThrow: vi.fn(),
  listNotifications: vi.fn(),
  countUnread: vi.fn(),
}));

vi.mock("@/shared/lib/auth", () => ({
  getCurrentUserOrThrow: mocks.getCurrentUserOrThrow,
}));

vi.mock("@/server/notifications/emit", () => ({
  listNotifications: mocks.listNotifications,
  countUnread: mocks.countUnread,
  INBOX_LIMIT: 50,
}));

function get(url: string): NextRequest {
  return new NextRequest(new Request(url));
}

const row = {
  id: "n1",
  projectId: "p1",
  kind: "finding_overdue",
  title: "SLA vencido",
  body: "detalle",
  link: "/dashboard",
  metadata: {},
  readAt: null,
  createdAt: "2026-10-05T00:00:00.000Z",
};

describe("Notifications — GET", () => {
  let GET: typeof import("./route").GET;

  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await import("./route");
    GET = mod.GET;
    mocks.getCurrentUserOrThrow.mockResolvedValue({ id: "user-1" });
    mocks.listNotifications.mockResolvedValue([row]);
    mocks.countUnread.mockResolvedValue(1);
  });

  it("200 con bandeja y contador", async () => {
    const res = await GET(get("http://localhost:3000/api/notifications"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.notifications).toHaveLength(1);
    expect(body.unread).toBe(1);
  });

  it("unread=1 filtra no leídas", async () => {
    await GET(get("http://localhost:3000/api/notifications?unread=1"));
    expect(mocks.listNotifications).toHaveBeenCalledWith("user-1", {
      unreadOnly: true,
      limit: undefined,
    });
  });

  it("limit se acota a INBOX_LIMIT", async () => {
    await GET(get("http://localhost:3000/api/notifications?limit=999"));
    expect(mocks.listNotifications).toHaveBeenCalledWith("user-1", {
      unreadOnly: false,
      limit: 50,
    });
  });

  it("sin autenticación → 500", async () => {
    mocks.getCurrentUserOrThrow.mockRejectedValue(new Error("No autorizado"));
    const res = await GET(get("http://localhost:3000/api/notifications"));
    expect(res.status).toBe(500);
  });
});
