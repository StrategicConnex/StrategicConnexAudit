/* ═══════════════════════════════════════════════════════════════════════════
   Ejecutor de comandos del bot (Tanda 4 / B16)

   Garantías:
   - Sin allowlist no se ejecuta nada sobre datos de proyecto.
   - El ACK usa `transitionFinding` (una sola máquina de estados), no una
     escritura paralela.
   - Los fallos de BD se convierten en mensaje de error, nunca en excepción.
   ═══════════════════════════════════════════════════════════════════════════ */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { parseAllowedProjectIds, runScAuditCommand } from "./executor";
import type { ParsedCommand } from "./commands";

const {
  mockProjectFindFirst,
  mockAuditFindFirst,
  mockGroupBy,
  mockRecentLimit,
  mockGetFindingScope,
  mockTransition,
} = vi.hoisted(() => ({
  mockProjectFindFirst: vi.fn(),
  mockAuditFindFirst: vi.fn(),
  mockGroupBy: vi.fn(),
  mockRecentLimit: vi.fn(),
  mockGetFindingScope: vi.fn(),
  mockTransition: vi.fn(),
}));

vi.mock("@/shared/db", () => ({
  directDb: {
    query: {
      projects: { findFirst: mockProjectFindFirst },
      audits: { findFirst: mockAuditFindFirst },
    },
    select: () => ({
      from: () => ({
        where: () => ({
          groupBy: mockGroupBy,
          orderBy: () => ({ limit: mockRecentLimit }),
        }),
      }),
    }),
  },
}));

vi.mock("@/shared/db/schemas", () => ({
  projects: { id: "projects.id" },
  audits: { projectId: "audits.projectId", status: "audits.status", createdAt: "audits.createdAt" },
  intelligenceFindings: {
    projectId: "f.projectId",
    status: "f.status",
    severity: "f.severity",
    createdAt: "f.createdAt",
  },
}));

// Se conserva el módulo real (FINDING_STATUSES/TERMINAL_STATUSES) y se
// sustituyen solo las dos funciones que tocan la BD.
vi.mock("@/server/intelligence/findings/workflow", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/server/intelligence/findings/workflow")>();
  return {
    ...actual,
    getFindingScope: (...args: unknown[]) => mockGetFindingScope(...args),
    transitionFinding: (...args: unknown[]) => mockTransition(...args),
  };
});

const PROJECT = "550e8400-e29b-41d4-a716-446655440000";

function command(name: ParsedCommand["name"], ...args: string[]): ParsedCommand {
  return { name, args, raw: [name, ...args].join(" ") };
}

describe("parseAllowedProjectIds", () => {
  it("separa por comas, recorta y descarta vacíos", () => {
    expect(parseAllowedProjectIds("A, B ,,  C ")).toEqual(["A", "B", "C"]);
  });

  it("sin valor → lista vacía (ningún proyecto autorizado)", () => {
    expect(parseAllowedProjectIds(undefined)).toEqual([]);
    expect(parseAllowedProjectIds("  ")).toEqual([]);
  });
});

describe("runScAuditCommand — sin BD", () => {
  it("help responde la ayuda", async () => {
    const response = await runScAuditCommand(command("help"), { allowedProjectIds: [] });
    expect(response.error).toBe(false);
    expect(response.text).toContain("Comandos de SCAUDIT");
  });

  it("scan no toca la BD y dice que no ha lanzado nada", async () => {
    const response = await runScAuditCommand(command("scan", "acme.com"), { allowedProjectIds: [] });
    expect(response.error).toBe(true);
    expect(response.text).toContain("No se ha lanzado nada");
    expect(mockProjectFindFirst).not.toHaveBeenCalled();
  });
});

describe("runScAuditCommand — status", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockProjectFindFirst.mockResolvedValue({ id: PROJECT, name: "Acme", domain: "acme.com" });
    mockGroupBy.mockResolvedValue([{ severity: "critical", n: 2 }, { severity: "low", n: 1 }]);
    mockRecentLimit.mockResolvedValue([
      { id: "f-1", severity: "critical", title: "TLS 1.0" },
    ]);
    mockAuditFindFirst.mockResolvedValue({ completedAt: new Date("2026-10-01T10:00:00.000Z") });
  });

  it("sin projectId → error de uso", async () => {
    const response = await runScAuditCommand(command("status"), { allowedProjectIds: [PROJECT] });
    expect(response.error).toBe(true);
    expect(response.text).toContain("Falta el projectId");
  });

  it("proyecto fuera de la allowlist → no consulta la BD", async () => {
    const response = await runScAuditCommand(command("status", "otro-proyecto"), {
      allowedProjectIds: [PROJECT],
    });
    expect(response.error).toBe(true);
    expect(response.text).toContain("no está autorizado");
    expect(mockProjectFindFirst).not.toHaveBeenCalled();
  });

  it("proyecto inexistente → error honesto", async () => {
    mockProjectFindFirst.mockResolvedValue(undefined);
    const response = await runScAuditCommand(command("status", PROJECT), {
      allowedProjectIds: [PROJECT],
    });
    expect(response.error).toBe(true);
    expect(response.text).toContain("Proyecto no encontrado");
  });

  it("proyecto ok → postura con recuento, desglose y último escaneo", async () => {
    const response = await runScAuditCommand(command("status", PROJECT), {
      allowedProjectIds: [PROJECT],
    });
    expect(response.error).toBe(false);
    expect(response.text).toContain("*Acme* — acme.com");
    expect(response.text).toContain("Hallazgos abiertos: 3 (2 critical, 1 low)");
    expect(response.text).toContain("2026-10-01T10:00:00.000Z");
    expect(response.actions).toHaveLength(1);
  });

  it("sin escaneo completado → 'sin datos'", async () => {
    mockAuditFindFirst.mockResolvedValue(undefined);
    const response = await runScAuditCommand(command("status", PROJECT), {
      allowedProjectIds: [PROJECT],
    });
    expect(response.text).toContain("sin datos");
  });

  it("fallo de BD → mensaje de error, no excepción", async () => {
    mockGroupBy.mockRejectedValue(new Error("db down"));
    const response = await runScAuditCommand(command("status", PROJECT), {
      allowedProjectIds: [PROJECT],
    });
    expect(response.error).toBe(true);
    expect(response.text).toContain("db down");
  });
});

describe("runScAuditCommand — ack", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetFindingScope.mockResolvedValue({ id: "f-1", projectId: PROJECT, status: "open" });
    mockTransition.mockResolvedValue({
      ok: true,
      status: "acknowledged",
      dueAt: "2026-10-02T10:00:00.000Z",
    });
  });

  it("sin findingId → error de uso", async () => {
    const response = await runScAuditCommand(command("ack"), { allowedProjectIds: [PROJECT] });
    expect(response.error).toBe(true);
    expect(response.text).toContain("Falta el findingId");
  });

  it("hallazgo inexistente → error", async () => {
    mockGetFindingScope.mockResolvedValue(null);
    const response = await runScAuditCommand(command("ack", "f-x"), { allowedProjectIds: [PROJECT] });
    expect(response.error).toBe(true);
    expect(response.text).toContain("Hallazgo no encontrado");
    expect(mockTransition).not.toHaveBeenCalled();
  });

  it("hallazgo de un proyecto no autorizado → no transiciona", async () => {
    const response = await runScAuditCommand(command("ack", "f-1"), { allowedProjectIds: [] });
    expect(response.error).toBe(true);
    expect(response.text).toContain("no está autorizado");
    expect(mockTransition).not.toHaveBeenCalled();
  });

  it("ack válido → transiciona con nota del origen y sin actor de plataforma", async () => {
    const response = await runScAuditCommand(command("ack", "f-1"), {
      allowedProjectIds: [PROJECT],
      source: "Slack (ana)",
    });

    expect(mockTransition).toHaveBeenCalledWith({
      findingId: "f-1",
      toStatus: "acknowledged",
      actorId: null,
      note: "ACK desde Slack (ana)",
    });
    expect(response.error).toBe(false);
    expect(response.text).toContain("SLA hasta: 2026-10-02T10:00:00.000Z");
  });

  it("transición inválida (ya terminal) → se informa el motivo real", async () => {
    mockTransition.mockResolvedValue({
      ok: false,
      reason: "invalid_transition",
      message: "Transición no permitida desde 'resolved'",
    });
    const response = await runScAuditCommand(command("ack", "f-1"), {
      allowedProjectIds: [PROJECT],
    });
    expect(response.error).toBe(true);
    expect(response.text).toContain("Transición no permitida");
  });
});
