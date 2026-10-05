import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ─── Mocks ──────────────────────────────────────────────────────────────────

const mockLogger = {
  warn: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
};
vi.mock("@/lib/logger", () => ({ logger: mockLogger }));

vi.mock("@/lib/request-context", () => ({
  withRequestContext:
    (handler: (req: unknown) => Promise<Response>) =>
    (req: unknown) =>
      handler(req),
}));

const DSN =
  "https://publickey123@o4511488296026112.ingest.us.sentry.io/4511488301137920";
const ENVELOPE_URL =
  "https://o4511488296026112.ingest.us.sentry.io/api/4511488301137920/envelope/";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Envelope mínimo válido: cabecera con event_id + ítem de evento. */
const validEnvelope = () =>
  [
    JSON.stringify({ event_id: "abc123", sent_at: "2026-10-05T00:00:00.000Z" }),
    JSON.stringify({
      type: "event",
      event: { event_id: "abc123", message: "prueba" },
    }),
    "",
  ].join("\n");

/**
 * La ruta solo usa `request.arrayBuffer()`, así que un objeto mínimo alcanza
 * para ejercitar el handler sin construir un Request real.
 */
function makeRequest(body: string | Buffer): Request {
  const buf = typeof body === "string" ? Buffer.from(body) : body;
  const slice = buf.buffer.slice(
    buf.byteOffset,
    buf.byteOffset + buf.byteLength,
  );
  return { arrayBuffer: async () => slice } as unknown as Request;
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe("POST /monitoring (túnel de Sentry)", () => {
  let POST: typeof import("./route").POST;

  beforeEach(async () => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_SENTRY_DSN = DSN;
    mockFetch.mockResolvedValue({ ok: true, status: 200 });
    POST = (await import("./route")).POST;
  });

  afterEach(() => {
    delete process.env.NEXT_PUBLIC_SENTRY_DSN;
  });

  it("reenvía un envelope válido a Sentry con la cabecera de autenticación", async () => {
    const res = await POST(makeRequest(validEnvelope()));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ success: true });
    expect(mockFetch).toHaveBeenCalledTimes(1);

    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(ENVELOPE_URL);
    expect(init.method).toBe("POST");
    expect(init.headers).toMatchObject({
      "Content-Type": "application/x-sentry-envelope",
    });
    expect(
      (init.headers as Record<string, string>)["X-Sentry-Auth"],
    ).toContain("sentry_key=publickey123");
  });

  it("rechaza un JSON que no es un envelope de Sentry (sin event_id)", async () => {
    const res = await POST(makeRequest('{"basura":true}'));

    expect(res.status).toBe(400);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("rechaza un cuerpo que no es JSON", async () => {
    const res = await POST(makeRequest("esto no es json"));

    expect(res.status).toBe(400);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("rechaza un cuerpo vacío", async () => {
    const res = await POST(makeRequest(""));

    expect(res.status).toBe(400);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("rechaza envelopes de más de 1 MB sin reenviar", async () => {
    const res = await POST(makeRequest(Buffer.alloc(1024 * 1024 + 1, 0x78)));

    expect(res.status).toBe(413);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("devuelve 503 si no hay DSN configurado", async () => {
    delete process.env.NEXT_PUBLIC_SENTRY_DSN;
    const res = await POST(makeRequest(validEnvelope()));

    expect(res.status).toBe(503);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("devuelve 500 si el DSN tiene formato inválido", async () => {
    process.env.NEXT_PUBLIC_SENTRY_DSN = "no-es-un-dsn";
    const res = await POST(makeRequest(validEnvelope()));

    expect(res.status).toBe(500);
    expect(mockFetch).not.toHaveBeenCalled();
    expect(mockLogger.error).toHaveBeenCalled();
  });

  it("devuelve 502 si Sentry rechaza el envelope", async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 429 });
    const res = await POST(makeRequest(validEnvelope()));

    expect(res.status).toBe(502);
    expect(mockLogger.warn).toHaveBeenCalled();
  });

  it("devuelve 502 sin lanzar si la red falla (fail-open)", async () => {
    mockFetch.mockRejectedValue(new Error("ECONNREFUSED"));
    const res = await POST(makeRequest(validEnvelope()));

    expect(res.status).toBe(502);
    expect(mockLogger.warn).toHaveBeenCalled();
  });
});
