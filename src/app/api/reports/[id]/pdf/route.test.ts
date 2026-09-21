import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET } from "./route";
import { getCurrentUserOrThrow } from "@/shared/lib/auth";
import { withRLS } from "@/shared/db/rls";

vi.mock("@/shared/lib/auth", () => ({
  getCurrentUserOrThrow: vi.fn(),
}));

vi.mock("@/shared/db/rls", () => ({
  withRLS: vi.fn((_userId, fn) => fn({})),
}));

vi.mock("@/shared/db/direct", () => ({
  directDb: {},
}));

vi.mock("@/shared/db/schemas", () => ({
  reports: { id: "id", title: "title" },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn(() => ({})),
}));

vi.mock("@/shared/lib/logger", () => ({
  logger: { error: vi.fn(), info: vi.fn() },
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/reports/[id]/pdf", () => {
  it("returns 404 when report not found", async () => {
    vi.mocked(getCurrentUserOrThrow).mockResolvedValue({ id: "user-1" } as never);
    vi.mocked(withRLS).mockImplementation(async (_userId, fn) => {
      const tx = {
        select: () => ({
          from: () => ({
            where: () => ({
              limit: () => Promise.resolve([]),
            }),
          }),
        }),
      };
      return (fn as never)(tx);
    });

    const req = new Request("http://localhost/api/reports/123/pdf");
    const res = await GET(req as never, { params: Promise.resolve({ id: "123" }) });
    expect(res.status).toBe(404);
  });

  it("returns PDF when report found", async () => {
    vi.mocked(getCurrentUserOrThrow).mockResolvedValue({ id: "user-1" } as never);
    vi.mocked(withRLS).mockImplementation(async (_userId, fn) => {
      const tx = {
        select: () => ({
          from: () => ({
            where: () => ({
              limit: () => Promise.resolve([{ id: "123", title: "Test Report" }]),
            }),
          }),
        }),
      };
      return (fn as never)(tx);
    });

    const req = new Request("http://localhost/api/reports/123/pdf");
    const res = await GET(req as never, { params: Promise.resolve({ id: "123" }) });
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/pdf");
  });
});
