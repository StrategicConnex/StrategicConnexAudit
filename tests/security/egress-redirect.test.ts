import { describe, it, expect, vi, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { safeFetchFollow } from "@/server/intelligence/security/egress-guard";

/**
 * SA-01 — Regresión del SSRF por redirección (P0.1).
 *
 * Vector original: se validaba el host de la URL inicial y después se usaba
 * `fetch` nativo, cuyo `redirect: "follow"` implícito seguía el 302 sin
 * revalidar el destino. Un atacante apuntaba su propio dominio a
 * `http://169.254.169.254/latest/meta-data/` y el HTML interno se parseaba,
 * se persistía en `crawl_results` y se devolvía.
 *
 * Estas pruebas afirman que:
 *  - un 302 hacia la metadata de AWS / loopback NO se sigue,
 *  - el cuerpo interno NUNCA se propaga (ni por retorno ni por respuesta),
 *  - y que los 4 puntos de entrada del crawler siguen usando safeFetchFollow.
 */

const METADATA_URL = "http://169.254.169.254/latest/meta-data/";
const METADATA_BODY = "AMI-ID-LEAK-MARKER\ninstance-id: i-deadbeef\n";

/** Transporte simulado: nunca sale a la red. */
function makeTransport(hop2Body = METADATA_BODY) {
  return vi.fn(async (url: string) => {
    if (url.startsWith("http://169.254.169.254") || url.startsWith("http://127.0.0.1") || url.startsWith("http://[::1]")) {
      // Sólo se alcanza si alguien siguió la redirección sin revalidar.
      return new Response(hop2Body, { status: 200, headers: { "content-type": "text/html" } });
    }
    return new Response(null, { status: 302, headers: { location: METADATA_URL } });
  });
}

describe("SA-01 — safeFetchFollow no sigue redirecciones a destinos internos", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("302 → metadata de AWS (169.254.169.254): corta y NO propaga el cuerpo interno", async () => {
    const transport = makeTransport();
    vi.stubGlobal("fetch", transport);

    const error = await safeFetchFollow("http://93.184.216.0/inicio").catch((e: Error) => e);

    // Debe fallar cerrado, no devolver la respuesta interna.
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toMatch(/SSRF|Acceso denegado|metadata|reserved/i);

    // El segundo salto NUNCA se pidió: se validó el Location antes de seguirlo.
    expect(transport).toHaveBeenCalledTimes(1);
    const requestedUrls = transport.mock.calls.map((c) => String(c[0]));
    expect(requestedUrls.some((u) => u.includes("169.254.169.254"))).toBe(false);

    // El contenido interno no aparece por ninguna vía observable.
    expect(JSON.stringify(error)).not.toContain("AMI-ID-LEAK-MARKER");
    expect(String((error as Error).message)).not.toContain("AMI-ID-LEAK-MARKER");
  });

  it("302 → loopback IPv4 (127.0.0.1): corta sin pedir el segundo salto", async () => {
    const transport = vi.fn(async (url: string) => {
      if (url.startsWith("http://127.0.0.1")) return new Response("ADMIN-PANEL", { status: 200 });
      return new Response(null, { status: 302, headers: { location: "http://127.0.0.1/admin" } });
    });
    vi.stubGlobal("fetch", transport);

    await expect(safeFetchFollow("http://93.184.216.0")).rejects.toThrow(/SSRF|Acceso denegado|private|reserved/i);
    expect(transport).toHaveBeenCalledTimes(1);
  });

  it("302 → loopback IPv6 ([::1]): corta sin pedir el segundo salto", async () => {
    const transport = vi.fn(async (url: string) => {
      if (url.startsWith("http://[::1]")) return new Response("IPV6-LOOPBACK", { status: 200 });
      return new Response(null, { status: 302, headers: { location: "http://[::1]/admin" } });
    });
    vi.stubGlobal("fetch", transport);

    await expect(safeFetchFollow("http://93.184.216.0")).rejects.toThrow(/SSRF|Acceso denegado|private|reserved/i);
    expect(transport).toHaveBeenCalledTimes(1);
  });

  it("control positivo: un 302 a un host público SÍ se sigue y devuelve el 200 final", async () => {
    const transport = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 302, headers: { location: "http://93.184.216.0/final" } }))
      .mockResolvedValueOnce(new Response("<html>ok</html>", { status: 200 }));
    vi.stubGlobal("fetch", transport);

    const res = await safeFetchFollow("http://93.184.216.0/inicio");
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("ok");
    expect(transport).toHaveBeenCalledTimes(2);
  });

  it("corta una cadena de más de 3 redirecciones", async () => {
    const transport = vi.fn(async () => new Response(null, { status: 302, headers: { location: "http://93.184.216.0/otro" } }));
    vi.stubGlobal("fetch", transport);
    await expect(safeFetchFollow("http://93.184.216.0/a")).rejects.toThrow(/demasiadas redirecciones/i);
  });
});

/**
 * Guard estático anti-regresión: el bug de SA-01 fue precisamente volver a
 * introducir un `fetch` nativo o un `redirect: "follow"` en estos puntos.
 * Se inspecciona el código fuente (sin ejecutarlo) para que un cambio futuro
 * rompa la suite en lugar de producción. Los comentarios se eliminan antes de
 * comprobar para que la propia documentación del fix no dé un falso positivo.
 */
function sinComentarios(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

describe("SA-01 — guard estático de los puntos de entrada del crawler", () => {
  const root = process.cwd();
  const protegidos = [
    "src/app/actions/audits.ts",
    "src/trigger/audit.trigger.ts",
    "src/server/intelligence/executors/website-executors.ts",
  ];

  it.each(protegidos)("%s no usa fetch() nativo sobre la URL objetivo", (rel) => {
    const src = sinComentarios(fs.readFileSync(path.join(root, rel), "utf8"));
    // `fetch(` precedido de await/return/asignación, pero NO `safeFetch(`/`safeFetchFollow(`.
    const llamadasNativas = [...src.matchAll(/(?<![\w.])(?<!safe)fetch\s*\(/g)];
    expect(llamadasNativas.map((m) => m[0])).toEqual([]);
  });

  it.each(protegidos)("%s no usa redirect: \"follow\"", (rel) => {
    const src = sinComentarios(fs.readFileSync(path.join(root, rel), "utf8"));
    expect(src).not.toMatch(/redirect:\s*["']follow["']/);
  });

  it("los dos puntos que siguen redirecciones usan safeFetchFollow", () => {
    for (const rel of ["src/app/actions/audits.ts", "src/trigger/audit.trigger.ts"]) {
      const src = fs.readFileSync(path.join(root, rel), "utf8");
      expect(src).toContain("safeFetchFollow(");
      expect(src).toMatch(/import \{[^}]*safeFetchFollow[^}]*\}/);
    }
  });

  it("website.cookies y website.csp usan safeFetchFollow (no safeFetch con follow)", () => {
    const src = fs.readFileSync(path.join(root, "src/server/intelligence/executors/website-executors.ts"), "utf8");
    expect(src).toContain("safeFetchFollow(url, { method: \"GET\" })");
    expect(src).toContain("safeFetchFollow(url, { method: \"HEAD\" })");
  });
});

/**
 * Integración: se ejecuta el ejecutor REAL website.csp con el transporte
 * simulado. Sólo se sustituye la red, no el código bajo prueba, de modo que la
 * aserción recae sobre el ejecutor de producción.
 */
describe("SA-01 — el ejecutor website.csp no filtra contenido interno ante un 302", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it("devuelve error de egress y su salida no contiene el cuerpo de metadata", async () => {
    const transport = makeTransport();
    vi.stubGlobal("fetch", transport);

    const { websiteCspExecutor } = await import("@/server/intelligence/executors/website-executors");
    const ctx = {
      projectId: "12345678-1234-1234-1234-123456789abc",
      investigationId: "inv-1",
      userId: "user-1",
      signal: new AbortController().signal,
      log: () => {},
    };

    const result = await websiteCspExecutor.execute(ctx as never, { url: "http://93.184.216.0" });

    expect(result.success).toBe(false);
    // El ejecutor falla cerrado: no devuelve CSP ni hallazgos derivados del
    // contenido interno. El mensaje de error SÍ nombra la IP bloqueada, que es
    // justamente la señal del guard (no es contenido filtrado).
    expect(result.error).toMatch(/SSRF Prevention|Blocked private or reserved/i);
    expect(result.findings).toEqual([]);
    expect(JSON.stringify(result.output)).not.toContain("169.254.169.254");
    expect(JSON.stringify(result)).not.toContain("AMI-ID-LEAK-MARKER");
    // Nunca se pidió el segundo salto.
    expect(transport.mock.calls.map((c) => String(c[0])).some((u) => u.includes("169.254.169.254"))).toBe(false);
  });
});
