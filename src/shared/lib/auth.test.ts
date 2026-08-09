import { describe, it, expect, vi, beforeEach } from "vitest";

const getUserMock = vi.hoisted(() => vi.fn());
vi.mock("@/shared/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: getUserMock },
  })),
}));

import { getCurrentUser, getCurrentUserOrThrow } from "./auth";

describe("auth — getCurrentUser / getCurrentUserOrThrow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("devuelve el usuario autenticado", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: "u1", email: "a@b.c" } }, error: null });
    const user = await getCurrentUser();
    expect(user?.id).toBe("u1");
  });

  it("devuelve null sin usuario", async () => {
    getUserMock.mockResolvedValue({ data: { user: null }, error: null });
    expect(await getCurrentUser()).toBeNull();
  });

  it("devuelve null si getUser lanza (fail-safe)", async () => {
    getUserMock.mockRejectedValue(new Error("supabase down"));
    expect(await getCurrentUser()).toBeNull();
  });

  it("getCurrentUserOrThrow lanza 'No autorizado' sin usuario", async () => {
    getUserMock.mockResolvedValue({ data: { user: null }, error: null });
    await expect(getCurrentUserOrThrow()).rejects.toThrow("No autorizado");
  });

  it("getCurrentUserOrThrow devuelve el usuario autenticado", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: "u9" } }, error: null });
    expect((await getCurrentUserOrThrow()).id).toBe("u9");
  });
});
