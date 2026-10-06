import { describe, it, expect, vi, beforeEach } from "vitest";
import { executeConnector, decryptConfig, adfDocument, CONNECTORS } from "./connectors";

vi.mock("@/server/intelligence/security/egress-guard", () => ({
  assertPublicHostname: vi.fn(async (hostname: string) => [{ address: hostname, family: 4 }]),
}));

const mockFetch = vi.fn();

describe("remediation connectors (C-2)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", mockFetch);
  });

  it("expone 6 conectores documentados", () => {
    expect(CONNECTORS.map((c) => c.id)).toEqual([
      "cloudflare.purge_cache",
      "wordpress.update_plugin",
      "github.create_issue",
      "jira.create_issue",
      "linear.create_issue",
      "http.request",
    ]);
    for (const c of CONNECTORS) {
      expect(c.fields.length).toBeGreaterThan(0);
    }
  });

  it("los conectores de tickets marcan sus credenciales como secretas", () => {
    const jira = CONNECTORS.find((c) => c.id === "jira.create_issue")!;
    const linear = CONNECTORS.find((c) => c.id === "linear.create_issue")!;
    expect(jira.fields.find((f) => f.key === "apiToken")?.secret).toBe(true);
    expect(linear.fields.find((f) => f.key === "apiKey")?.secret).toBe(true);
  });

  it("falla sin config requerida (sin red)", async () => {
    await expect(
      executeConnector("cloudflare.purge_cache", {}, { title: "t", steps: [] })
    ).rejects.toThrow(/apiToken|zoneId/);
    await expect(
      executeConnector("github.create_issue", {}, { title: "t", steps: [] })
    ).rejects.toThrow(/token|owner|repo/);
    await expect(
      executeConnector("jira.create_issue", {}, { title: "t", steps: [] })
    ).rejects.toThrow(/siteUrl|email|apiToken|projectKey/);
    await expect(
      executeConnector("linear.create_issue", {}, { title: "t", steps: [] })
    ).rejects.toThrow(/apiKey|teamId/);
    await expect(
      executeConnector("http.request", {}, { title: "t", steps: [] })
    ).rejects.toThrow(/url/);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("conector desconocido lanza", async () => {
    await expect(
      executeConnector("nasa.lanzar" as never, {}, { title: "t", steps: [] })
    ).rejects.toThrow(/desconocido/);
  });

  it("decryptConfig: null → {} y legacy intacto", () => {
    expect(decryptConfig(null)).toEqual({});
    expect(decryptConfig("no-es-json")).toEqual({});
  });
});

describe("conector Jira (B11)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", mockFetch);
  });

  it("crea el issue con descripción ADF y devuelve key + URL navegable", async () => {
    mockFetch.mockResolvedValue(new Response(JSON.stringify({ key: "SEC-42" }), { status: 201 }));

    const result = await executeConnector(
      "jira.create_issue",
      {
        siteUrl: "https://acme.atlassian.net/",
        email: "soc@acme.com",
        apiToken: "tok-123",
        projectKey: "SEC",
      },
      { title: "TLS 1.0 habilitado", steps: ["Deshabilitar TLS 1.0", "Reiniciar nginx"] }
    );

    expect(result.ok).toBe(true);
    expect(result.evidence).toEqual({
      issueKey: "SEC-42",
      issueUrl: "https://acme.atlassian.net/browse/SEC-42",
    });

    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    // La barra final de siteUrl no duplica el separador.
    expect(url).toBe("https://acme.atlassian.net/rest/api/3/issue");
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe(
      `Basic ${Buffer.from("soc@acme.com:tok-123").toString("base64")}`
    );
    expect(init.redirect).toBe("manual");

    const body = JSON.parse(init.body as string);
    expect(body.fields.project).toEqual({ key: "SEC" });
    expect(body.fields.issuetype).toEqual({ name: "Task" });
    expect(body.fields.description.type).toBe("doc");
    expect(body.fields.description.content[0].content[0].text).toBe("TLS 1.0 habilitado");
    expect(body.fields.description.content).toHaveLength(3);
  });

  it("respeta el tipo de issue configurado", async () => {
    mockFetch.mockResolvedValue(new Response(JSON.stringify({ key: "SEC-1" }), { status: 201 }));
    await executeConnector(
      "jira.create_issue",
      { siteUrl: "https://a.atlassian.net", email: "e", apiToken: "t", projectKey: "P", issueType: "Bug" },
      { title: "t", steps: [] }
    );
    const body = JSON.parse((mockFetch.mock.calls[0]![1] as RequestInit).body as string);
    expect(body.fields.issuetype).toEqual({ name: "Bug" });
  });

  it("401 de Jira → lanza con el código real", async () => {
    mockFetch.mockResolvedValue(new Response(null, { status: 401, statusText: "Unauthorized" }));
    await expect(
      executeConnector(
        "jira.create_issue",
        { siteUrl: "https://a.atlassian.net", email: "e", apiToken: "t", projectKey: "P" },
        { title: "t", steps: [] }
      )
    ).rejects.toThrow(/Jira respondió 401/);
  });
});

describe("conector Linear (B11)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", mockFetch);
  });

  it("crea el issue vía GraphQL y devuelve identificador + URL", async () => {
    mockFetch.mockResolvedValue(
      new Response(
        JSON.stringify({
          data: {
            issueCreate: {
              success: true,
              issue: { id: "uuid-1", identifier: "ENG-7", url: "https://linear.app/acme/issue/ENG-7" },
            },
          },
        }),
        { status: 200 }
      )
    );

    const result = await executeConnector(
      "linear.create_issue",
      { apiKey: "lin_api_key", teamId: "team-1" },
      { title: "Hallazgo crítico", steps: ["Paso 1", "Paso 2"] }
    );

    expect(result.ok).toBe(true);
    expect(result.evidence).toEqual({
      identifier: "ENG-7",
      issueUrl: "https://linear.app/acme/issue/ENG-7",
    });

    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.linear.app/graphql");
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe("lin_api_key");
    const body = JSON.parse(init.body as string);
    expect(body.query).toContain("issueCreate");
    expect(body.variables.input.teamId).toBe("team-1");
    expect(body.variables.input.title).toBe("Hallazgo crítico");
    expect(body.variables.input.description).toBe("1. Paso 1\n2. Paso 2");
  });

  it("200 sin issue en la respuesta → lanza (no un falso éxito)", async () => {
    mockFetch.mockResolvedValue(
      new Response(JSON.stringify({ data: { issueCreate: { success: false } } }), { status: 200 })
    );
    await expect(
      executeConnector(
        "linear.create_issue",
        { apiKey: "k", teamId: "t" },
        { title: "t", steps: [] }
      )
    ).rejects.toThrow(/no devolvió el issue/);
  });

  it("500 de Linear → lanza con el código real", async () => {
    mockFetch.mockResolvedValue(new Response(null, { status: 500, statusText: "Boom" }));
    await expect(
      executeConnector("linear.create_issue", { apiKey: "k", teamId: "t" }, { title: "t", steps: [] })
    ).rejects.toThrow(/Linear respondió 500/);
  });
});

describe("adfDocument", () => {
  it("genera un documento válido y descarta párrafos vacíos", () => {
    const doc = adfDocument(["Título", "   ", "Paso 1"]);
    expect(doc.type).toBe("doc");
    expect(doc.version).toBe(1);
    const content = doc.content as Array<{ content: Array<{ text: string }> }>;
    expect(content).toHaveLength(2);
    expect(content[1]!.content[0]!.text).toBe("Paso 1");
  });

  it("sin párrafos devuelve un documento vacío pero válido", () => {
    const doc = adfDocument(["", "  "]);
    expect(doc.content).toEqual([{ type: "paragraph" }]);
  });
});
