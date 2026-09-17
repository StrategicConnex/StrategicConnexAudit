import { describe, it, expect, vi, afterEach } from "vitest";
import { safeFetchFollow, validateSafeUrl } from "./egress-guard";

function resp(status: number, location?: string): Response {
  return new Response(null, {
    status,
    headers: location ? { location } : {},
  });
}

describe("safeFetchFollow + fail-closed (P2-4)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("sigue redirects públicos hasta el 200 final", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(resp(302, "http://93.184.216.0/final"))
      .mockResolvedValueOnce(resp(200));
    vi.stubGlobal("fetch", fetchMock);
    const res = await safeFetchFollow("http://93.184.216.0/inicio");
    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("bloquea redirect a IP privada en el segundo salto", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(resp(302, "http://93.184.216.0/paso"))
      .mockResolvedValueOnce(resp(302, "http://127.0.0.1/admin"));
    vi.stubGlobal("fetch", fetchMock);
    await expect(safeFetchFollow("http://93.184.216.0/inicio")).rejects.toThrow(
      /SSRF Prevention|Acceso denegado/
    );
  });

  it("corta tras más de 3 saltos", async () => {
    const fetchMock = vi.fn(async () => resp(302, "http://93.184.216.0/otro"));
    vi.stubGlobal("fetch", fetchMock);
    await expect(safeFetchFollow("http://93.184.216.0/a", {}, 1)).rejects.toThrow(
      /demasiadas redirecciones/
    );
  });

  it("validateSafeUrl fail-closed si el DNS no resuelve", async () => {
    await expect(validateSafeUrl("https://no-existe-xyz.invalid")).rejects.toThrow(
      "Acceso denegado"
    );
  });
});
