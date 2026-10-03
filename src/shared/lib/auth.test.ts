import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

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

  it("getCurrentUserOrThrow lanza AuthError sin usuario", async () => {
    getUserMock.mockResolvedValue({ data: { user: null }, error: null });
    await expect(getCurrentUserOrThrow()).rejects.toThrow("No autorizado");
  });

  it("getCurrentUserOrThrow devuelve el usuario autenticado", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: "u9" } }, error: null });
    expect((await getCurrentUserOrThrow()).id).toBe("u9");
  });
});

describe("auth — dev bypass", () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalBypass = process.env.NEXT_PUBLIC_DEV_BYPASS_AUTH;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  function setEnv(nodeEnv: string, bypass: string | undefined) {
    vi.stubEnv("NODE_ENV", nodeEnv);
    if (bypass === undefined) vi.stubEnv("NEXT_PUBLIC_DEV_BYPASS_AUTH", undefined);
    else vi.stubEnv("NEXT_PUBLIC_DEV_BYPASS_AUTH", bypass);
  }

  afterEach(() => {
    vi.unstubAllEnvs();
    if (originalNodeEnv !== undefined) process.env.NODE_ENV = originalNodeEnv;
    if (originalBypass === undefined) delete process.env.NEXT_PUBLIC_DEV_BYPASS_AUTH;
    else process.env.NEXT_PUBLIC_DEV_BYPASS_AUTH = originalBypass;
    vi.clearAllMocks();
  });

  // El id debe ser EXACTAMENTE el de DEV_BYPASS_USER_ID en @/shared/lib/actions:
  // si divergen, las escrituras del bypass crean filas que ninguna lectura ve.
  it("devuelve el usuario sintético en development con la opt-in puesta", async () => {
    setEnv("development", "true");
    const user = await getCurrentUser();
    expect(user?.id).toBe("00000000-0000-0000-0000-000000000001");
    expect(getUserMock).not.toHaveBeenCalled();
  });

  it("getCurrentUserOrThrow no lanza AuthError bajo bypass", async () => {
    setEnv("development", "true");
    expect((await getCurrentUserOrThrow()).id).toBe("00000000-0000-0000-0000-000000000001");
  });

  it("NO se activa en producción aunque la opt-in esté puesta", async () => {
    setEnv("production", "true");
    getUserMock.mockResolvedValue({ data: { user: null }, error: null });
    expect(await getCurrentUser()).toBeNull();
    expect(getUserMock).toHaveBeenCalled();
  });

  it("NO se activa en development sin la opt-in explícita", async () => {
    setEnv("development", undefined);
    getUserMock.mockResolvedValue({ data: { user: null }, error: null });
    expect(await getCurrentUser()).toBeNull();
    expect(getUserMock).toHaveBeenCalled();
  });
});
