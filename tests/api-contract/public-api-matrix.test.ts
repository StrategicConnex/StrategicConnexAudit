/**
 * D4 — Matriz de contrato de la API pública v1.
 *
 * Fija, POR ENDPOINT, el comportamiento de autenticación y scope que ya implanta
 * `withPublicApi` (`src/server/api/public-router.ts`):
 *
 *   - sin API key            → 401 + WWW-Authenticate (nunca toca el handler);
 *   - key sin el scope       → 403 citando el scope requerido;
 *   - rate limit por IP      → 429 (cubierto en `public-router.test.ts`).
 *
 * El valor está en recorrer los endpoints REALES (no solo el router): si un
 * endpoint nuevo olvida `withPublicApi` o declara mal su scope, esta matriz lo
 * detecta. El camino "key válida con el scope correcto" lo cubre
 * `src/server/api/public-router.test.ts` (evita tocar la BD aquí).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const mockAuthenticateApiKey = vi.fn();

vi.mock("@/shared/lib/api-keys", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/shared/lib/api-keys")>();
  return { ...actual, authenticateApiKey: mockAuthenticateApiKey };
});

vi.mock("@/shared/db", () => ({
  directDb: { insert: vi.fn(() => ({ values: vi.fn(() => ({ catch: vi.fn(() => Promise.resolve()) })) })) },
}));

vi.mock("@/lib/logger", () => ({
  getRequestContext: vi.fn(() => undefined),
  runWithRequestContext: <T>(_ctx: unknown, fn: () => T): T => fn(),
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

/**
 * Endpoint → scope exigido. Debe coincidir con el `scope:` que cada route pasa
 * a `withPublicApi`. Si un endpoint cambia su scope deliberadamente, actualiza
 * esta tabla (es el contrato).
 */
const MATRIX = [
  { path: "adversary", method: "GET", scope: "adversary:read" },
  { path: "audits", method: "GET", scope: "intelligence:read" },
  { path: "findings", method: "GET", scope: "findings:read" },
  { path: "intelligence", method: "GET", scope: "intelligence:read" },
  { path: "intelligence", method: "POST", scope: "intelligence:write" },
  { path: "reports", method: "GET", scope: "reports:read" },
  { path: "uptime", method: "GET", scope: "intelligence:read" },
] as const;

function wrongScopeFor(required: string): string {
  return required === "reports:read" ? "findings:read" : "reports:read";
}

function requestFor(path: string, method: string, ip: string): NextRequest {
  return new NextRequest(
    new Request(`http://localhost/api/public/v1/${path}`, {
      method,
      headers: { "x-forwarded-for": ip },
    }),
  );
}

let ipCounter = 0;
function uniqueIp(): string {
  ipCounter += 1;
  return `203.0.113.${ipCounter % 250}`;
}

let rateLimitIpCounter = 0;
/**
 * Rango distinto al de `uniqueIp` para que la ventana de rate limit de un
 * caso no se solape con la de otro (compartir identificador haría que el
 * segundo arrancara ya agotado y la aserción de `limit` llamadas fallara).
 */
function uniqueRateLimitIp(): string {
  rateLimitIpCounter += 1;
  return `198.18.${Math.floor(rateLimitIpCounter / 250)}.${rateLimitIpCounter % 250}`;
}

/** Cargadores estáticos (vite no resuelve imports con plantilla). */
const LOADERS: Record<string, () => Promise<Record<string, unknown>>> = {
  adversary: () => import("@/app/api/public/v1/adversary/route"),
  audits: () => import("@/app/api/public/v1/audits/route"),
  findings: () => import("@/app/api/public/v1/findings/route"),
  intelligence: () => import("@/app/api/public/v1/intelligence/route"),
  reports: () => import("@/app/api/public/v1/reports/route"),
  uptime: () => import("@/app/api/public/v1/uptime/route"),
};

async function loadHandler(path: string, method: string) {
  const mod = await LOADERS[path]();
  return mod[method] as (req: NextRequest) => Promise<Response>;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("API pública v1 — matriz por endpoint", () => {
  it.each(MATRIX.map((e) => [`${e.method} /${e.path}`, e] as const))(
    "%s sin API key → 401 con WWW-Authenticate",
    async (_label, endpoint) => {
      mockAuthenticateApiKey.mockResolvedValue({
        authenticated: false,
        userId: null,
        error: "Use: Bearer sa_live_<key>",
      });
      const handler = await loadHandler(endpoint.path, endpoint.method);
      const res = await handler(requestFor(endpoint.path, endpoint.method, uniqueIp()));

      expect(res.status).toBe(401);
      expect(res.headers.get("WWW-Authenticate")).toContain("Bearer");
      const body = await res.json();
      expect(body.success).toBe(false);
      expect(body.documentation_url).toBeDefined();
    },
  );

  it.each(MATRIX.map((e) => [`${e.method} /${e.path}`, e] as const))(
    "%s con key sin el scope requerido → 403 citando el scope",
    async (_label, endpoint) => {
      mockAuthenticateApiKey.mockResolvedValue({
        authenticated: true,
        userId: "user-1",
        keyRecord: {
          id: "key-1",
          userId: "user-1",
          name: "test-key",
          keyPrefix: "sa_live_",
          scope: [wrongScopeFor(endpoint.scope)],
          expiresAt: null,
          lastUsedAt: null,
          createdAt: new Date(),
        },
      });
      const handler = await loadHandler(endpoint.path, endpoint.method);
      const res = await handler(requestFor(endpoint.path, endpoint.method, uniqueIp()));

      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.error).toContain(endpoint.scope);
    },
  );

  it("todas las rutas públicas declaran withPublicApi y un scope explícito", async () => {
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    for (const endpoint of MATRIX) {
      const source = readFileSync(
        join(process.cwd(), "src/app/api/public/v1", endpoint.path, "route.ts"),
        "utf8",
      );
      expect(source, `${endpoint.path} no usa withPublicApi`).toContain("withPublicApi(");
      expect(source, `${endpoint.path} no declara scope`).toMatch(/scope:\s*API_SCOPES\./);
    }
  });
});

/**
 * Rate limiting de la API pública (fase IP) POR ENDPOINT.
 *
 * El presupuesto se agota con un identificador propio de cada caso para no
 * interferir entre endpoints. El 429 se resuelve ANTES de autenticar, así que
 * `authenticateApiKey` se llama exactamente `limit` veces: esa cuenta prueba
 * que la ruta pasa por `withPublicApi` (una ruta sin envolver no limitaría ni
 * devolvería headers de cuota).
 *
 * La fase `key` (límite por key tras autenticar, que sí ejecuta el handler y
 * por tanto toca la BD) se cubre en `src/server/api/public-router.test.ts`.
 */
describe("API pública v1 — matriz por endpoint (rate limit por IP)", () => {
  it.each(MATRIX.map((e) => [`${e.method} /${e.path}`, e] as const))(
    "%s agota el presupuesto por IP → 429 con headers de límite",
    async (_label, endpoint) => {
      // Import dinámico: el `vi.mock` de arriba se hoista, así que un import
      // estático del router evalúa su fábrica ANTES de que exista
      // `mockAuthenticateApiKey` (ReferenceError).
      const { PUBLIC_API_RATE_LIMITS } = await import("@/server/api/public-router");

      mockAuthenticateApiKey.mockResolvedValue({
        authenticated: false,
        userId: null,
        error: "no key",
      });

      const handler = await loadHandler(endpoint.path, endpoint.method);
      const ip = uniqueRateLimitIp();

      let last: Response | undefined;
      for (let i = 0; i <= PUBLIC_API_RATE_LIMITS.ip.limit; i++) {
        last = await handler(requestFor(endpoint.path, endpoint.method, ip));
      }

      expect(last!.status).toBe(429);
      // Headers IETF + legacy: el cliente sabe cuánto le queda y cuándo reintentar.
      expect(last!.headers.get("RateLimit-Limit")).toBe(String(PUBLIC_API_RATE_LIMITS.ip.limit));
      expect(last!.headers.get("RateLimit-Remaining")).toBe("0");
      expect(last!.headers.get("X-RateLimit-Limit")).toBe(String(PUBLIC_API_RATE_LIMITS.ip.limit));
      expect(last!.headers.get("Retry-After")).toBeTruthy();

      const body = await last!.json();
      expect(body.success).toBe(false);
      expect(body.documentation_url).toBeDefined();

      // El 429 corta antes de autenticar: no se gastó una consulta de API key.
      expect(mockAuthenticateApiKey).toHaveBeenCalledTimes(PUBLIC_API_RATE_LIMITS.ip.limit);
    },
  );
});
