import { describe, it, expect, vi, beforeEach } from "vitest";
import { z } from "zod";

const getUserMock = vi.hoisted(() => vi.fn());
vi.mock("@/shared/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: getUserMock },
  })),
}));

import { protectedAction } from "./safe-action";

const schema = z.object({
  projectId: z.string().min(1),
  limit: z.number().int().positive(),
});

describe("protectedAction — wrapper de Server Actions (auth + zod)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("devuelve error de sesión si no hay usuario autenticado", async () => {
    getUserMock.mockResolvedValue({ data: { user: null }, error: null });
    const result = await protectedAction(schema, { projectId: "p1", limit: 10 }, async () => "ok");
    expect(result.success).toBe(false);
    expect(result.message).toContain("Sesión");
  });

  it("devuelve error de sesión si getUser falla", async () => {
    getUserMock.mockResolvedValue({ data: { user: null }, error: new Error("auth down") });
    const result = await protectedAction(schema, { projectId: "p1", limit: 10 }, async () => "ok");
    expect(result.success).toBe(false);
    expect(result.message).toContain("Sesión");
  });

  it("valida la entrada con Zod y devuelve fieldErrors si es inválida", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
    const result = await protectedAction(schema, { projectId: "", limit: -1 }, async () => "ok");
    expect(result.success).toBe(false);
    expect(result.errors?.projectId).toBeTruthy();
    expect(result.errors?.limit).toBeTruthy();
    // El handler NO debe ejecutarse con entrada inválida
  });

  it("ejecuta el handler con input validado y userId", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: "u-42" } }, error: null });
    const handler = vi.fn(async (_input: { projectId: string; limit: number }, userId: string) => ({ userId }));
    const result = await protectedAction(schema, { projectId: "p1", limit: 5 }, handler);
    expect(result.success).toBe(true);
    expect(handler).toHaveBeenCalledWith({ projectId: "p1", limit: 5 }, "u-42");
  });

  it("devuelve el error del handler como message", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
    const result = await protectedAction(
      schema, { projectId: "p1", limit: 5 },
      async () => { throw new Error("recurso no encontrado"); }
    );
    expect(result.success).toBe(false);
    expect(result.message).toBe("recurso no encontrado");
  });

  it("no filtra el stack del error interno (message genérico solo para no-Error)", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
    const result = await protectedAction(
      schema, { projectId: "p1", limit: 5 },
      async () => { throw "string error"; }
    );
    expect(result.success).toBe(false);
    expect(result.message).toBe("Error interno del servidor");
  });
});
