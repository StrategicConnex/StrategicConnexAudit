import { describe, it, expect, vi, beforeEach } from "vitest";
import { z } from "zod";

const getUserMock = vi.hoisted(() => vi.fn());
const withRLSMock = vi.hoisted(() => vi.fn(async (_userId: string, cb: (tx: unknown) => Promise<unknown>) => cb({})));
const securityLogMock = vi.hoisted(() => vi.fn(async () => undefined));
const infoLogMock = vi.hoisted(() => vi.fn(async () => undefined));
const errorLogMock = vi.hoisted(() => vi.fn(async () => undefined));

vi.mock("@/shared/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({ auth: { getUser: getUserMock } })),
}));
vi.mock("@/shared/db/rls", () => ({ withRLS: withRLSMock }));
vi.mock("@/shared/db", () => ({ directDb: { tag: "directDb" } }));
vi.mock("@/shared/db/schemas/index", () => ({}));
vi.mock("@/shared/lib/logger", () => ({
  logger: { security: securityLogMock, info: infoLogMock, error: errorLogMock },
}));

import { authenticatedAction } from "./actions";

const schema = z.object({ projectId: z.string().min(1) });

describe("authenticatedAction — wrapper de Server Actions (auth + zod + RLS)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
  });

  it("dev bypass: ejecuta la acción con usuario sintético sin auth real", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("NEXT_PUBLIC_DEV_BYPASS_AUTH", "true");

    const action = vi.fn(async (data: { projectId: string }, ctx: { user: { id: string } }) => ({ done: data.projectId, user: ctx.user.id }));
    const result = await authenticatedAction(schema, action)({ projectId: "p1" });

    expect(result.data).toEqual({ done: "p1", user: "dev-bypass-user" });
    expect(getUserMock).not.toHaveBeenCalled();
  });

  it("dev bypass: devuelve validationErrors con entrada inválida", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("NEXT_PUBLIC_DEV_BYPASS_AUTH", "true");

    const action = vi.fn(async () => "nunca");
    const result = await authenticatedAction(schema, action)({ projectId: "" });
    expect(result.error).toBeTruthy();
    expect(result.validationErrors?.projectId).toBeTruthy();
    expect(action).not.toHaveBeenCalled();
  });

  it("rechaza sin sesión y loguea UNAUTHORIZED_ACTION_ATTEMPT", async () => {
    getUserMock.mockResolvedValue({ data: { user: null }, error: null });
    const action = vi.fn(async () => "nunca");
    const result = await authenticatedAction(schema, action)({ projectId: "p1" });

    expect(result.error).toContain("No autorizado");
    expect(securityLogMock).toHaveBeenCalledWith(
      expect.objectContaining({ action: "UNAUTHORIZED_ACTION_ATTEMPT" })
    );
    expect(action).not.toHaveBeenCalled();
  });

  it("valida la entrada y devuelve fieldErrors antes de ejecutar", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
    const action = vi.fn(async () => "nunca");
    const result = await authenticatedAction(schema, action)({ projectId: "" });

    expect(result.error).toBeTruthy();
    expect(result.validationErrors?.projectId).toBeTruthy();
    expect(action).not.toHaveBeenCalled();
  });

  it("ejecuta la acción dentro de withRLS con el userId real y loguea éxito", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: "u-7" } }, error: null });
    const action = vi.fn(async (_data: { projectId: string }, ctx: { user: { id: string } }) => ({ who: ctx.user.id }));
    const result = await authenticatedAction(schema, action)({ projectId: "p1" });

    expect(result.data).toEqual({ who: "u-7" });
    expect(withRLSMock).toHaveBeenCalledWith("u-7", expect.any(Function));
    expect(infoLogMock).toHaveBeenCalledWith(
      expect.objectContaining({ action: "ACTION_SUCCESS" })
    );
  });

  it("convierte excepciones de la acción en error con log SERVER_ACTION_EXCEPTION", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
    const result = await authenticatedAction(
      schema,
      async () => { throw new Error("falló la DB"); }
    )({ projectId: "p1" });

    expect(result.error).toBe("falló la DB");
    expect(errorLogMock).toHaveBeenCalledWith(
      expect.objectContaining({ action: "SERVER_ACTION_EXCEPTION" })
    );
  });

  it("acepta FormData y lo convierte a objeto", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
    const fd = new FormData();
    fd.set("projectId", "p-fd");
    const action = vi.fn(async (data: { projectId: string }) => ({ id: data.projectId }));
    const result = await authenticatedAction(schema, action)(fd);
    expect(result.data).toEqual({ id: "p-fd" });
  });
});
