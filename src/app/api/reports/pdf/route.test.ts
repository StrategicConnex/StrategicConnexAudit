/* =========================================================================
   Reports PDF — Tests de endpoint — TD-03 lote 3 (rutas PDF)
   =========================================================================
   Verifica POST /api/reports/pdf (withRateLimit resuelto como passthrough):
   - body sin projectId → 400
   - proyecto inexistente / sin ownership → 404
   - sin investigaciones → 404
   - happy path → 200 con application/pdf, Content-Length > 0, X-Generation-Id
     y escrituras de progreso scoped por usuario (VULN-007)
   - fallo inesperado → 500 con success:false
   - casos borde: investigaciones con score null → overallScore null;
     findings vacíos → 200 con totalFindings 0
   - TD-13: findings con limit 500 y totales/severidad con COUNT(group-by)
      independientes del fetch acotado
   ========================================================================= */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { Readable } from "stream";

// ==== Mocks ====

interface Chain {
  from: () => Chain;
  where: () => Chain;
  groupBy: () => Chain;
  limit: () => Chain;
  then: (
    onfulfilled?: ((value: unknown) => unknown) | null,
    onrejected?: ((reason: unknown) => unknown) | null
  ) => Promise<unknown>;
}

const mocks = vi.hoisted(() => {
  const state = {
    txResults: [] as unknown[],
    countResults: [] as unknown[],
  };

  const tx = {
    select: () => {
      const chain: Chain = {
        from: () => chain,
        where: () => chain,
        groupBy: () => chain,
        limit: () => chain,
        then: (onfulfilled, onrejected) => {
          const next = state.txResults.length > 0 ? state.txResults.shift() : [];
          return Promise.resolve(next).then(
            onfulfilled ?? undefined,
            onrejected ?? undefined,
          );
        },
      };
      return chain;
    },
  };

  return {
    state,
    tx,
    withRLS: vi.fn((_userId: string, cb: (t: unknown) => Promise<unknown>) =>
      cb(tx),
    ),
    findInvestigations: vi.fn(),
    findFindings: vi.fn(),
    findAssets: vi.fn(),
    writePdfProgress: vi.fn(async () => {}),
    pruneStalePdfProgress: vi.fn(async () => {}),
    createClient: vi.fn(),
    loggerInfo: vi.fn(),
    loggerWarn: vi.fn(),
    loggerError: vi.fn(),
    loggerDebug: vi.fn(),
  };
});

vi.mock("@/shared/lib/ratelimit", () => ({
  withRateLimit: (_cfg: unknown, handler: unknown) => handler,
}));

vi.mock("@/server/reports/pdf-progress", () => ({
  writePdfProgress: mocks.writePdfProgress,
  pruneStalePdfProgress: mocks.pruneStalePdfProgress,
}));

vi.mock("@/shared/lib/supabase/server", () => ({
  createClient: mocks.createClient,
}));

vi.mock("@/shared/db/rls", () => ({
  withRLS: mocks.withRLS,
}));

vi.mock("@/shared/db", () => ({
  directDb: {
    query: {
      intelligenceInvestigations: { findMany: mocks.findInvestigations },
      intelligenceFindings: { findMany: mocks.findFindings },
      intelligenceAssets: { findMany: mocks.findAssets },
    },
    select: () => {
      const chain: Chain = {
        from: () => chain,
        where: () => chain,
        groupBy: () => chain,
        limit: () => chain,
        then: (onfulfilled, onrejected) => {
          const next =
            mocks.state.countResults.length > 0 ? mocks.state.countResults.shift() : [];
          return Promise.resolve(next).then(
            onfulfilled ?? undefined,
            onrejected ?? undefined,
          );
        },
      };
      return chain;
    },
  },
  db: {},
}));

vi.mock("@react-pdf/renderer", () => ({
  renderToStream: vi.fn(async () =>
    Readable.from([Buffer.from("%PDF-1.4 test")]),
  ),
  Document: (props: unknown) => props,
  Page: (props: unknown) => props,
  Text: (props: unknown) => props,
  View: (props: unknown) => props,
  StyleSheet: { create: (styles: unknown) => styles },
}));

vi.mock("@/server/reports/pdf-template", () => ({
  PdfReport: () => null,
}));

vi.mock("@/lib/logger", () => ({
  logger: {
    info: mocks.loggerInfo,
    warn: mocks.loggerWarn,
    error: mocks.loggerError,
    debug: mocks.loggerDebug,
  },
}));

// ==== Helpers ====

const USER_ID = "user-1";
const PROJECT_ID = "123e4567-e89b-12d3-a456-426614174000";

const projectRow = {
  id: PROJECT_ID,
  name: "Acme Corp",
  domain: "acme.com",
  ownerId: USER_ID,
};

const investigationRow = {
  id: "inv-1",
  projectId: PROJECT_ID,
  title: "Full audit",
  score: 77,
  summary: "Summary",
  target: "acme.com",
  targetType: "domain",
  createdAt: new Date("2026-09-01T00:00:00Z"),
};

const findingRow = {
  id: "f-1",
  investigationId: "inv-1",
  severity: "critical",
  title: "SQLi",
  description: "desc",
  recommendation: "fix",
  affectedAsset: "acme.com",
  evidence: { _toolId: "T1110" },
  createdAt: new Date("2026-09-02T00:00:00Z"),
};

const assetRow = {
  id: "a-1",
  investigationId: "inv-1",
  assetType: "domain",
  value: "acme.com",
  ip: "1.2.3.4",
  firstSeenAt: new Date("2026-09-01T00:00:00Z"),
  lastSeenAt: new Date("2026-09-03T00:00:00Z"),
};

function createRequest(body: Record<string, unknown>): NextRequest {
  return new NextRequest(
    new Request("http://localhost:3000/api/reports/pdf", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

type ReportData = {
  overallScore: number | null;
  sections: { totalFindings: number; severeCount: number }[];
};

async function renderedReportData(): Promise<ReportData> {
  const { renderToStream } = await import("@react-pdf/renderer");
  const call = vi.mocked(renderToStream).mock.calls[0];
  if (!call) throw new Error("renderToStream not called");
  return (call[0] as unknown as { props: { data: ReportData } }).props.data;
}

// ==== Tests ====

describe("POST /api/reports/pdf", () => {
  let POST: typeof import("./route").POST;

  beforeEach(async () => {
    vi.clearAllMocks();
    mocks.state.txResults = [[projectRow]];
    mocks.state.countResults = [[{ severity: "critical", n: 1 }]];
    mocks.findInvestigations.mockResolvedValue([investigationRow]);
    mocks.findFindings.mockResolvedValue([findingRow]);
    mocks.findAssets.mockResolvedValue([assetRow]);
    const mod = await import("./route");
    POST = mod.POST;
  });

  it("missing projectId returns 400", async () => {
    const res = await POST(createRequest({}), USER_ID);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toBe("Se requiere projectId");
    expect(mocks.withRLS).not.toHaveBeenCalled();
  });

  it("project not found returns 404", async () => {
    mocks.state.txResults = [];

    const res = await POST(createRequest({ projectId: PROJECT_ID }), USER_ID);
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toBe("Proyecto no encontrado o acceso denegado");
    expect(mocks.withRLS).toHaveBeenCalledWith(USER_ID, expect.any(Function));
    expect(mocks.findInvestigations).not.toHaveBeenCalled();
  });

  it("no investigations returns 404", async () => {
    mocks.findInvestigations.mockResolvedValue([]);

    const res = await POST(createRequest({ projectId: PROJECT_ID }), USER_ID);
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe(
      "No se encontraron investigaciones para este proyecto",
    );
  });

  it("happy path returns 200 pdf with headers", async () => {
    const res = await POST(
      createRequest({ projectId: PROJECT_ID, genId: "gen-12345678" }),
      USER_ID,
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/pdf");    expect(Number(res.headers.get("Content-Length"))).toBeGreaterThan(0);
    expect(res.headers.get("X-Generation-Id")).toBe("gen-12345678");
    expect(res.headers.get("Content-Disposition")).toContain("SCAUDIT_Report_");
    expect(await res.text()).toContain("%PDF-1.4");
    expect(mocks.writePdfProgress).toHaveBeenCalledWith(
      "user-1",
      "gen-12345678",
      expect.objectContaining({ percent: expect.any(Number), step: expect.any(String) }),
    );
    expect(mocks.pruneStalePdfProgress).toHaveBeenCalledTimes(1);
  });

  it("missing genId omits X-Generation-Id", async () => {
    const res = await POST(createRequest({ projectId: PROJECT_ID }), USER_ID);
    expect(res.status).toBe(200);
    expect(res.headers.get("X-Generation-Id")).toBeNull();
    expect(mocks.writePdfProgress).not.toHaveBeenCalled();
    expect(mocks.pruneStalePdfProgress).not.toHaveBeenCalled();
  });

  it("null scores yield overallScore null", async () => {
    mocks.findInvestigations.mockResolvedValue([
      { ...investigationRow, score: null },
    ]);

    const res = await POST(createRequest({ projectId: PROJECT_ID }), USER_ID);
    expect(res.status).toBe(200);
    const data = await renderedReportData();
    expect(data.overallScore).toBeNull();
    expect(data.sections).toHaveLength(1);
  });

  it("empty findings still returns 200", async () => {
    mocks.findFindings.mockResolvedValue([]);
    mocks.state.countResults = [[]];

    const res = await POST(createRequest({ projectId: PROJECT_ID }), USER_ID);
    expect(res.status).toBe(200);
    const data = await renderedReportData();
    expect(data.sections[0].totalFindings).toBe(0);
  });

  it("TD-13: counts por severity reales e independientes del fetch acotado", async () => {
    mocks.state.countResults = [
      [
        { severity: "critical", n: 5 },
        { severity: "medium", n: 3 },
      ],
    ];

    const res = await POST(createRequest({ projectId: PROJECT_ID }), USER_ID);
    expect(res.status).toBe(200);
    const data = await renderedReportData();
    expect(data.sections[0].totalFindings).toBe(8);
    expect(data.sections[0].severeCount).toBe(5);
  });

  it("unexpected error returns 500", async () => {
    mocks.findInvestigations.mockRejectedValue(new Error("db down"));

    const res = await POST(createRequest({ projectId: PROJECT_ID }), USER_ID);
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toContain("Error al generar PDF");
    expect(mocks.loggerError).toHaveBeenCalled();
  });
});
