import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { mockGetUser, mockSelect } = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockSelect: vi.fn(),
}));

vi.mock("@/shared/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: mockGetUser },
  })),
}));

vi.mock("@/shared/db", () => ({
  db: { select: mockSelect },
}));

vi.mock("@/shared/db/schemas", () => ({
  users: { id: "users.id", role: "users.role" },
}));

import { assertPlatformAdmin, requireAdmin } from "./admin";

describe("platform admin gates", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  beforeEach(() => {
    vi.stubEnv("NODE_ENV", "production");
    mockGetUser.mockReset();
    mockSelect.mockReset();
    mockGetUser.mockResolvedValue({ data: { user: { id: "user-client" } } });
    mockSelect.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([{ role: "client" }]),
        }),
      }),
    });
  });

  it("requireAdmin rejects an authenticated non-admin with 403", async () => {
    const gate = await requireAdmin();

    expect(gate.ok).toBe(false);
    if (!gate.ok) {
      expect(gate.response.status).toBe(403);
    }
    expect(mockSelect).toHaveBeenCalledOnce();
  });

  it("assertPlatformAdmin rejects an authenticated non-admin in production", async () => {
    await expect(assertPlatformAdmin()).rejects.toThrow(
      "Prohibido: se requiere rol admin"
    );
    expect(mockSelect).toHaveBeenCalledOnce();
  });

  it("allows an authenticated non-admin only in development", async () => {
    vi.stubEnv("NODE_ENV", "development");

    await expect(requireAdmin()).resolves.toMatchObject({
      ok: true,
      userId: "user-client",
    });
    await expect(assertPlatformAdmin()).resolves.toBe("user-client");
    expect(mockSelect).not.toHaveBeenCalled();
  });

  it("rejects an authenticated non-admin when NODE_ENV is undefined", async () => {
    vi.stubEnv("NODE_ENV", undefined);

    const gate = await requireAdmin();
    expect(gate.ok).toBe(false);
    if (!gate.ok) {
      expect(gate.response.status).toBe(403);
    }
    await expect(assertPlatformAdmin()).rejects.toThrow(
      "Prohibido: se requiere rol admin"
    );
    expect(mockSelect).toHaveBeenCalledTimes(2);
  });
});
