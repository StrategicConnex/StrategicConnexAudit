/**
 * @vitest-environment node
 *
 * El ALS vive en `src/lib/logger.ts` y solo se inicializa server-side
 * (`typeof window === "undefined"`), así que este archivo corre en node y no
 * en el jsdom global de la suite.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  readRequestId,
  withRequestContext,
  currentCorrelationId,
  runWithCorrelation,
  correlatedHeaders,
} from "./request-context";
import { runWithRequestContext, getCorrelationId, logger } from "./logger";

describe("request-context (G1 — Correlation IDs)", () => {
  beforeEach(() => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("readRequestId", () => {
    it("lee x-request-id desde un Request", () => {
      const req = new Request("http://localhost/api", {
        headers: { "x-request-id": "req-123" },
      });
      expect(readRequestId(req)).toBe("req-123");
    });

    it("lee x-request-id desde un Headers", () => {
      expect(readRequestId(new Headers({ "x-request-id": "req-456" }))).toBe("req-456");
    });

    it("devuelve undefined sin fuente o sin cabecera", () => {
      expect(readRequestId(undefined)).toBeUndefined();
      expect(readRequestId(null)).toBeUndefined();
      expect(readRequestId(new Request("http://localhost/api"))).toBeUndefined();
    });
  });

  describe("withRequestContext", () => {
    it("entra al scope con el requestId del primer argumento", async () => {
      const handler = withRequestContext(async (_req: Request) => getCorrelationId());
      const req = new Request("http://localhost/api", {
        headers: { "x-request-id": "injected-id" },
      });
      await expect(handler(req)).resolves.toBe("injected-id");
    });

    it("sin requestId ejecuta el handler tal cual (fail-safe)", async () => {
      const handler = withRequestContext(async (_req: Request) => "ok");
      await expect(handler(new Request("http://localhost/api"))).resolves.toBe("ok");
      expect(currentCorrelationId()).toBeUndefined();
    });

    it("preserva la firma y el valor de retorno del handler original", () => {
      const handler = withRequestContext((n: number) => n * 2);
      expect(handler(21)).toBe(42);
    });

    it("el logger dentro del handler fusiona requestId en la línea", async () => {
      const handler = withRequestContext((_req: Request) => {
        logger.info("inside handler");
        return true;
      });
      await handler(new Request("http://localhost/api", { headers: { "x-request-id": "log-id" } }));
      const line = JSON.parse(
        (console.log as ReturnType<typeof vi.fn>).mock.calls.at(-1)?.[0] as string
      ) as { context?: { requestId?: string } };
      expect(line.context?.requestId).toBe("log-id");
    });
  });

  describe("currentCorrelationId", () => {
    it("está vacío fuera de un scope", () => {
      expect(currentCorrelationId()).toBeUndefined();
    });

    it("cae a requestId cuando no hay correlationId explícito", () => {
      const id = runWithRequestContext({ requestId: "r-1" }, () => currentCorrelationId());
      expect(id).toBe("r-1");
    });

    it("prefiere correlationId sobre requestId", () => {
      const id = runWithRequestContext(
        { requestId: "r-1", correlationId: "c-1" },
        () => currentCorrelationId()
      );
      expect(id).toBe("c-1");
    });
  });

  describe("runWithCorrelation (G2)", () => {
    it("entra al scope con el correlation id recibido", () => {
      const seen = runWithCorrelation("corr-1", () => currentCorrelationId());
      expect(seen).toBe("corr-1");
    });

    it("sin correlation id ejecuta la función sin scope (cron/scheduled)", () => {
      const seen = runWithCorrelation(undefined, () => currentCorrelationId());
      expect(seen).toBeUndefined();
      expect(runWithCorrelation(undefined, () => "plain")).toBe("plain");
    });

    it("propaga el valor de retorno y las excepciones", async () => {
      await expect(runWithCorrelation("c", async () => "async value")).resolves.toBe("async value");
      expect(() => runWithCorrelation("c", () => { throw new Error("boom"); })).toThrow("boom");
    });

    it("el logger dentro de la tarea fusiona el correlation id", () => {
      runWithCorrelation("corr-log", () => logger.info("worker running"));
      const line = JSON.parse(
        (console.log as ReturnType<typeof vi.fn>).mock.calls.at(-1)?.[0] as string
      ) as { context?: { correlationId?: string } };
      expect(line.context?.correlationId).toBe("corr-log");
    });

    it("no pisa un correlation id superior si no viene uno nuevo", () => {
      const nested = runWithRequestContext({ correlationId: "outer" }, () =>
        runWithCorrelation(undefined, () => currentCorrelationId())
      );
      expect(nested).toBe("outer");
    });
  });

  describe("correlatedHeaders (G3)", () => {
    it("fuera de un scope devuelve la base intacta", () => {
      expect(correlatedHeaders({ "Content-Type": "application/json" })).toEqual({
        "Content-Type": "application/json",
      });
      expect(correlatedHeaders()).toEqual({});
    });

    it("dentro de un scope añade x-request-id con el correlation id activo", () => {
      const headers = runWithRequestContext({ correlationId: "out-1" }, () =>
        correlatedHeaders({ Authorization: "Bearer x" })
      );
      expect(headers).toEqual({ Authorization: "Bearer x", "x-request-id": "out-1" });
    });

    it("cae al requestId cuando no hay correlationId explícito", () => {
      const headers = runWithRequestContext({ requestId: "rid-9" }, () => correlatedHeaders());
      expect(headers).toEqual({ "x-request-id": "rid-9" });
    });
  });
});
