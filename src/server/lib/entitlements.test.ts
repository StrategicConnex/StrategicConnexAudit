import { describe, it, expect, vi, beforeEach } from "vitest";

const state = vi.hoisted(() => ({
  planId: null as string | null,
  planRow: null as null | {
    name: string;
    maxProjects: number;
    maxKeywords: number;
    features: Record<string, unknown>;
  },
  ownedIds: [] as string[],
}));

vi.mock("@/shared/db", () => ({
  directDb: {
    select: (cols: Record<string, unknown>) => ({
      from: () => {
        const rows = (() => {
          if ("planId" in cols) return [{ planId: state.planId }];
          if ("id" in cols) return state.ownedIds.map((id) => ({ id }));
          if ("n" in cols) return [{ n: 0 }];
          return [];
        })();
        // Drizzle: where() devuelve builder con .limit(), y también se
        // puede awaitear directo (entitlements usa ambas formas).
        const builder = {
          limit: async () => rows,
          then: (resolve: (v: typeof rows) => void) => resolve(rows),
        };
        return { where: () => builder };
      },
    }),
    query: {
      subscriptionPlans: {
        findFirst: async () => state.planRow,
      },
    },
  },
}));

// Nota: el mock responde [] a los conteos; se valida resolución de plan,
// límites y conteo de proyectos (la agregación exacta vive en integración).
import { getEntitlements } from "./entitlements";

describe("entitlements — plan y uso (A-4)", () => {
  beforeEach(() => {
    state.planId = null;
    state.planRow = {
      name: "pro",
      maxProjects: 10,
      maxKeywords: 5000,
      features: { seats: 5, whiteLabel: false, apiAccess: true },
    };
    state.ownedIds = ["p1", "p2"];
  });

  it("resuelve plan pro con uso agregado", async () => {
    // El mock genérico no distingue columnas: se valida la forma, no cifras.
    const ent = await getEntitlements("u1");
    expect(ent.planName).toBe("pro");
    expect(ent.maxProjects).toBe(10);
    expect(ent.seats).toBe(5);
    expect(ent.projectsUsed).toBe(2);
  });
});
