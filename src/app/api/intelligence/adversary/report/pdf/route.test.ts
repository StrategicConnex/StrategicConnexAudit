/* =========================================================================
   Adversary Report PDF — Tests de endpoint — TD-03 lote 3 (rutas PDF)
   =========================================================================
   Verifica GET /api/intelligence/adversary/report/pdf:
   - sin sesión → 401; sin projectId → 400
   - proyecto inexistente / sin ownership → 404
   - sin evaluaciones completadas → 404
   - happy path → 200 con application/pdf y Content-Disposition
   - fallo inesperado (BD lanza) → 500 con success:false
   - caso borde: riskScore null, summary null y sin vulnerabilidades → 200
   ========================================================================= */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { Readable } from "stream";

// ==== Mocks ====

const mocks = vi.hoisted(() => {
  interface Chain {
    from: () => Chain;
    where: () => Chain;
    orderBy: () => Chain;
    limit: () => Chain;
    then: (
      onfulfilled?: ((value: unknown) => unknown) | null,
      onrejected?: ((reason: unknown) => unknown) | null
    ) => Promise<unknown>;
  }

  const state = { selectResults: [] as unknown[] };

  function makeChain(): Chain {
    const chain: Chain = {
      from: () => chain,
      where: () => chain,
      orderBy: () => chain,
      limit: () => chain,
      then: (onfulfilled, onrejected) => {
        const next = state.selectResults.length > 0 ? state.selectResults.shift() : [];
        if (next instanceof Error) {
          return Promise.reject(next).then(
            onfulfilled ?? undefined,
            onrejected ?? undefined,
          );
        }
        return Promise.resolve(next).then(
          onfulfilled ?? undefined,
          onrejected ?? undefined,
        );
      },
    };
    return chain;
  }

  return {
    state,
    select: vi.fn(() => makeChain()),
    createClient: vi.fn(),
    getLocale: vi.fn(async () => "es"),
    loggerInfo: vi.fn(),
    loggerWarn: vi.fn(),
    loggerError: vi.fn(),
    loggerDebug: vi.fn(),
  };
});

vi.mock("@/shared/lib/supabase/server", () => ({
  createClient: mocks.createClient,
}));

vi.mock("@/shared/db", () => ({
  directDb: { select: mocks.select },
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

vi.mock("@/i18n/request", () => ({
  getLocale: mocks.getLocale,
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

const PROJECT_ID = "123e4567-e89b-12d3-a456-426614174000";
const BASE_URL = "http://localhost:3000/api/intelligence/adversary/report/pdf";

const projectRow = { id: PROJECT_ID, name: "Acme Corp", domain: "acme.com" };

const assessmentRow = {
  id: "assess-1",
  projectId: PROJECT_ID,
  status: "completed",
  target: "https://acme.com",
  riskScore: 62,
  summary: "Solid posture",
  modelUsed: "gpt-x",
  checksTotal: 40,
  checksPassed: 37,
  analysisFailed: false,
  createdAt: new Date("2026-09-01T00:00:00Z"),
};

const vulnRow = {
  id: "vuln-1",
  assessmentId: "assess-1",
  title: "Open redirect",
  severity: "high",
  cvssScore: "7.4",
  cweId: "CWE-601",
  owaspCategory: "A01:2021",
  description: "desc",
  evidence: { summary: "reflected" },
  remediation: ["Validate URL"],
  references: ["https://cwe.mitre.org"],
  confidence: 0.8,
};

function setUser(id: string | null): void {
  mocks.createClient.mockResolvedValue({
    auth: {
      getUser: vi.fn(async () => ({ data: { user: id ? { id } : null } })),
    },
  });
}

function createRequest(query = ""): NextRequest {
  return new NextRequest(new Request(`${BASE_URL}${query}`));
}

type DocProps = {
  assessment: { riskScore: number | null };
  vulnerabilities: unknown[];
};

async function renderedDocProps(): Promise<DocProps> {
  const { renderToStream } = await import("@react-pdf/renderer");
  const call = vi.mocked(renderToStream).mock.calls[0];
  if (!call) throw new Error("renderToStream not called");
  return (call[0] as unknown as { props: DocProps }).props;
}

// ==== Tests ====

describe("GET /api/intelligence/adversary/report/pdf", () => {
  let GET: typeof import("./route").GET;

  beforeEach(async () => {
    vi.clearAllMocks();
    mocks.state.selectResults.length = 0;
    setUser("user-1");
    const mod = await import("./route");
    GET = mod.GET;
  });

  it("missing user returns 401", async () => {
    setUser(null);

    const res = await GET(createRequest(`?projectId=${PROJECT_ID}`));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("No autorizado");
    expect(mocks.select).not.toHaveBeenCalled();
  });

  it("missing projectId returns 400", async () => {
    const res = await GET(createRequest());
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toBe("projectId requerido");
    expect(mocks.select).not.toHaveBeenCalled();
  });

  it("project not found returns 404", async () => {
    mocks.state.selectResults.push([]);

    const res = await GET(createRequest(`?projectId=${PROJECT_ID}`));
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toBe("Proyecto no encontrado");
  });

  it("no completed assessment returns 404", async () => {
    mocks.state.selectResults.push([projectRow], []);

    const res = await GET(createRequest(`?projectId=${PROJECT_ID}`));
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("Sin evaluaciones completadas para este proyecto");
  });

  it("happy path returns 200 pdf", async () => {
    mocks.state.selectResults.push([projectRow], [assessmentRow], [vulnRow]);

    const res = await GET(createRequest(`?projectId=${PROJECT_ID}`));
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/pdf");
    expect(res.headers.get("Content-Disposition")).toContain(
      "adversary-real-acme.com",
    );
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(await res.text()).toContain("%PDF-1.4");
  });

  it("unexpected error returns 500", async () => {
    mocks.state.selectResults.push(new Error("db down"));

    const res = await GET(createRequest(`?projectId=${PROJECT_ID}`));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toBe("Error interno");
    expect(mocks.loggerError).toHaveBeenCalled();
  });

  it("null risk score and no vulnerabilities returns 200", async () => {
    mocks.state.selectResults.push(
      [projectRow],
      [
        {
          ...assessmentRow,
          riskScore: null,
          summary: null,
          analysisFailed: true,
        },
      ],
      [],
    );

    const res = await GET(createRequest(`?projectId=${PROJECT_ID}`));
    expect(res.status).toBe(200);
    const props = await renderedDocProps();
    expect(props.assessment.riskScore).toBeNull();
    expect(props.vulnerabilities).toHaveLength(0);
  });
});
