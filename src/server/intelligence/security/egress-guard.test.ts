import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { Mock } from "vitest";
import type { LookupAddress } from "node:dns";
import { lookup } from "node:dns/promises";
import {
  isBlockedAddress,
  isPrivateIp,
  assertPublicHostname,
  safeFetch,
  normalizeUrl,
  validateSafeUrl,
} from "./egress-guard";

/**
 * Hermeticidad (PI-01 — tarea previa a C5)
 *
 * Este suite no toca la red externa: `node:dns/promises` va mockeado y
 * `fetch` se sustituye por un stub en cada test. Los destinos iniciales son
 * literales IP públicas, así que `assertPublicHostname` los clasifica sin
 * DNS; las redirecciones se fabrican con `Response` locales.
 *
 * Antes se dependía de httpbin.org (`/redirect-to`): cuando httpbin pasó a
 * responder 403 en vez de 302, dos tests rojos bloquearon el gate de sprint
 * sin que hubiera regresión del guard. Un fallo del guard ahora es siempre
 * reproducible y no depende de un tercero.
 */

vi.mock("node:dns/promises", () => {
  const lookup = vi.fn();
  return { lookup, default: { lookup } };
});

const lookupMock = lookup as unknown as Mock<(hostname: string) => Promise<LookupAddress[]>>;

const PUBLIC_ADDRESSES: LookupAddress[] = [
  { address: "93.184.216.34", family: 4 },
  { address: "2606:4700:4700::1111", family: 6 },
];

const PRIVATE_REDIRECTS: Array<[string, string]> = [
  ["loopback IPv4", "http://127.0.0.1/admin"],
  ["RFC 1918", "http://10.0.0.7/admin"],
  ["AWS metadata", "http://169.254.169.254/latest/meta-data/"],
  ["IPv4-mapped IPv6", "http://[::ffff:127.0.0.1]/admin"],
];

const fetchMock = vi.fn<typeof fetch>();

function redirectTo(location: string, status = 302): Response {
  return new Response(null, { status, headers: { location } });
}

beforeEach(() => {
  lookupMock.mockReset();
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("EgressGuard - SSRF and Private Network Protection Suite", () => {
  describe("isBlockedAddress() / isPrivateIp alias", () => {
    it("isPrivateIp alias points to isBlockedAddress", () => {
      expect(isPrivateIp("127.0.0.1")).toBe(true);
      expect(isPrivateIp("8.8.8.8")).toBe(false);
    });
  });

  describe("isBlockedAddress()", () => {
    it("should block loopback and local IPv4 addresses", () => {
      expect(isBlockedAddress("127.0.0.1")).toBe(true);
      expect(isBlockedAddress("127.255.0.1")).toBe(true);
      expect(isBlockedAddress("0.0.0.0")).toBe(true);
    });

    it("should block RFC 1918 Private IPv4 networks", () => {
      expect(isBlockedAddress("10.0.0.1")).toBe(true);
      expect(isBlockedAddress("10.255.255.255")).toBe(true);
      expect(isBlockedAddress("192.168.1.100")).toBe(true);
      expect(isBlockedAddress("172.16.0.1")).toBe(true);
      expect(isBlockedAddress("172.31.255.255")).toBe(true);
    });

    it("should block CGNAT (Carrier-grade NAT) IP networks", () => {
      expect(isBlockedAddress("100.64.0.1")).toBe(true);
      expect(isBlockedAddress("100.127.255.254")).toBe(true);
    });

    it("should block link-local IPv4 addresses", () => {
      expect(isBlockedAddress("169.254.169.254")).toBe(true);
      expect(isBlockedAddress("169.254.0.1")).toBe(true);
    });

    it("should block broadcast and multicast IPv4 networks", () => {
      expect(isBlockedAddress("224.0.0.1")).toBe(true);
      expect(isBlockedAddress("240.0.0.1")).toBe(true);
      expect(isBlockedAddress("255.255.255.255")).toBe(true);
    });

    it("should allow public IPv4 addresses", () => {
      expect(isBlockedAddress("8.8.8.8")).toBe(false);
      expect(isBlockedAddress("1.1.1.1")).toBe(false);
      expect(isBlockedAddress("204.79.197.200")).toBe(false);
    });

    it("should block loopback and link-local IPv6 addresses", () => {
      expect(isBlockedAddress("::1")).toBe(true);
      expect(isBlockedAddress("fe80::1")).toBe(true);
      expect(isBlockedAddress("fc00::")).toBe(true);
      expect(isBlockedAddress("fd00::1")).toBe(true);
    });

    it("should allow public IPv6 addresses", () => {
      expect(isBlockedAddress("2001:4860:4860::8888")).toBe(false);
    });
  });

  describe("isBlockedAddress — edge cases (0.0.0.0/8, 198.18.0.0/15, ::ffff:)", () => {
    it("should block the full 0.0.0.0/8 range (current network)", () => {
      expect(isBlockedAddress("0.0.0.0")).toBe(true);
      expect(isBlockedAddress("0.1.2.3")).toBe(true);
      expect(isBlockedAddress("0.255.255.255")).toBe(true);
    });

    it("should block the 198.18.0.0/15 benchmark range", () => {
      expect(isBlockedAddress("198.18.0.1")).toBe(true);
      expect(isBlockedAddress("198.18.255.255")).toBe(true);
      expect(isBlockedAddress("198.19.0.1")).toBe(true);
      expect(isBlockedAddress("198.19.255.255")).toBe(true);
    });

    it("should NOT block addresses outside 198.18.0.0/15", () => {
      expect(isBlockedAddress("198.17.255.255")).toBe(false);
      expect(isBlockedAddress("198.20.0.1")).toBe(false);
    });

    it("should block ::ffff: IPv4-mapped IPv6 addresses (SSRF gap closed)", () => {
      // Las direcciones IPv4-mapped IPv6 (::ffff:x.x.x.x) reconocidas por
      // net.isIPv6() NO están en PRIVATE_V6_PREFIXES, pero la IPv4 embebida
      // debe cotejarse contra las listas CIDR IPv4. Antes esto era una brecha
      // de seguridad conocida (un atacante podía representar una IP privada
      // como ::ffff:127.0.0.1 para evadir el guard); ahora se extrae y bloquea.
      expect(isBlockedAddress("::ffff:127.0.0.1")).toBe(true);
      expect(isBlockedAddress("::ffff:10.0.0.1")).toBe(true);
      expect(isBlockedAddress("::ffff:192.168.1.1")).toBe(true);
      expect(isBlockedAddress("::ffff:169.254.169.254")).toBe(true);
      // Forma hexadecimal de la IPv4 embebida (RFC 4291): ::ffff:7f00:1 = 127.0.0.1
      expect(isBlockedAddress("::ffff:7f00:1")).toBe(true);
      expect(isBlockedAddress("0:0:0:0:0:ffff:0a00:0001")).toBe(true);
      expect(isBlockedAddress("::FFFF:ac10:0001")).toBe(true); // 172.16.0.1, mayúsculas
    });

    it("should NOT block ::ffff: addresses pointing to public IPv4", () => {
      expect(isBlockedAddress("::ffff:8.8.8.8")).toBe(false);
      expect(isBlockedAddress("::ffff:1.1.1.1")).toBe(false);
      expect(isBlockedAddress("::ffff:0808:0808")).toBe(false); // 8.8.8.8 en hexadecimal
    });
  });

  describe("assertPublicHostname() — DNS inyectado (sin red)", () => {
    it("should immediately reject blocked IP inputs without DNS", async () => {
      await expect(assertPublicHostname("127.0.0.1")).rejects.toThrow(
        "SSRF Prevention: Blocked private or reserved IP target"
      );
      await expect(assertPublicHostname("10.0.0.1")).rejects.toThrow(
        "SSRF Prevention: Blocked private or reserved IP target"
      );
      expect(lookupMock).not.toHaveBeenCalled();
    });

    it("should accept a hostname that resolves exclusively to public addresses", async () => {
      lookupMock.mockResolvedValue(PUBLIC_ADDRESSES);

      await expect(assertPublicHostname("public.example")).resolves.toEqual(PUBLIC_ADDRESSES);
      expect(lookupMock).toHaveBeenCalledWith("public.example", { all: true, verbatim: false });
    });

    it("should reject a hostname that resolves to a private subnet", async () => {
      lookupMock.mockResolvedValue([{ address: "10.1.2.3", family: 4 }]);

      await expect(assertPublicHostname("internal.example")).rejects.toThrow(
        "Blocked DNS resolution to private/reserved address: 10.1.2.3"
      );
    });

    it("should reject when any resolved address is private, even alongside public ones", async () => {
      lookupMock.mockResolvedValue([...PUBLIC_ADDRESSES, { address: "192.168.1.10", family: 4 }]);

      await expect(assertPublicHostname("mixed.example")).rejects.toThrow(
        "Blocked DNS resolution to private/reserved address: 192.168.1.10"
      );
    });

    it("should reject when DNS returns no addresses", async () => {
      lookupMock.mockResolvedValue([]);

      await expect(assertPublicHostname("empty.example")).rejects.toThrow(
        "did not resolve to any addresses"
      );
    });

    it("should classify IPv6 literals locally, without DNS", async () => {
      await expect(assertPublicHostname("[::1]")).rejects.toThrow(
        "Blocked private or reserved IP target: ::1"
      );
      await expect(assertPublicHostname("2001:4860:4860::8888")).resolves.toEqual([
        { address: "2001:4860:4860::8888", family: 6 },
      ]);
      expect(lookupMock).not.toHaveBeenCalled();
    });
  });

  describe("safeFetch()", () => {
    it("should block non-HTTP/HTTPS protocols", async () => {
      await expect(safeFetch("ftp://example.com")).rejects.toThrow(
        "SSRF Prevention: Only HTTP and HTTPS protocols are allowed."
      );
      await expect(safeFetch("gopher://example.com")).rejects.toThrow(
        "SSRF Prevention: Only HTTP and HTTPS protocols are allowed."
      );
    });

    it("should refuse to connect to private subnets", async () => {
      await expect(safeFetch("http://127.0.0.1/admin")).rejects.toThrow(
        "SSRF Prevention: Blocked private or reserved IP target"
      );
    });
  });

  describe("normalizeUrl()", () => {
    it("should return correct scheme prefix for domains", () => {
      expect(normalizeUrl("example.com")).toBe("https://example.com");
      expect(normalizeUrl("www.google.com")).toBe("https://www.google.com");
    });

    it("should preserve already valid URLs", () => {
      expect(normalizeUrl("https://scaudit.vercel.app")).toBe("https://scaudit.vercel.app");
      expect(normalizeUrl("http://localhost:3000")).toBe("http://localhost:3000");
    });

    it("should handle spacing gracefully", () => {
      expect(normalizeUrl("   github.com/org   ")).toBe("https://github.com/org");
    });

    it("should return empty string for empty input", () => {
      expect(normalizeUrl("")).toBe("");
    });
  });

  describe("validateSafeUrl() — DNS inyectado (sin red)", () => {
    it("should accept a public URL when DNS resolves to public addresses", async () => {
      lookupMock.mockResolvedValue(PUBLIC_ADDRESSES);

      await expect(validateSafeUrl("https://public.example/report")).resolves.toBe(
        "https://public.example/report"
      );
    });

    it("should reject a hostname that resolves to a private address", async () => {
      lookupMock.mockResolvedValue([{ address: "10.0.0.5", family: 4 }]);

      await expect(validateSafeUrl("https://internal.example")).rejects.toThrow(
        "se resuelve a una IP privada (10.0.0.5)"
      );
    });

    it("should fail closed when DNS lookup fails", async () => {
      lookupMock.mockRejectedValue(new Error("getaddrinfo ENOTFOUND"));

      await expect(validateSafeUrl("https://unresolvable.example")).rejects.toThrow("fallo DNS");
    });

    it("should reject non HTTP/HTTPS schemes", async () => {
      await expect(validateSafeUrl("ftp://test.com")).rejects.toThrow("Protocolo no soportado");
      await expect(validateSafeUrl("javascript:alert(1)")).rejects.toThrow();
    });

    it("should reject private IPv4 hosts", async () => {
      await expect(validateSafeUrl("https://127.0.0.1")).rejects.toThrow("Acceso denegado");
      await expect(validateSafeUrl("http://192.168.0.1")).rejects.toThrow("Acceso denegado");
    });
  });

  describe("safeFetch() — redirecciones sin red (fetch inyectado)", () => {
    it("should return a public response without redirect", async () => {
      fetchMock.mockResolvedValue(new Response("ok", { status: 200 }));

      const res = await safeFetch("https://93.184.216.34/health");

      expect(res.ok).toBe(true);
      expect(res.status).toBe(200);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(lookupMock).not.toHaveBeenCalled();
    });

    it("should return the 3xx without following it and send redirect=manual by default", async () => {
      fetchMock.mockResolvedValue(redirectTo("https://1.1.1.1/next"));

      const res = await safeFetch("https://93.184.216.34/start");

      expect(res.status).toBe(302);
      expect(res.headers.get("location")).toBe("https://1.1.1.1/next");
      const init = fetchMock.mock.calls[0]?.[1];
      expect(init?.redirect).toBe("manual");
      expect((init?.headers as Record<string, string>)["User-Agent"]).toContain(
        "SCAuditIntelligenceBot"
      );
    });

    it.each(PRIVATE_REDIRECTS)("should BLOCK a 3xx redirect to %s", async (_label, location) => {
      fetchMock.mockResolvedValue(redirectTo(location));

      await expect(safeFetch("https://93.184.216.34/start")).rejects.toThrow(
        /SSRF Prevention|Acceso denegado/
      );
    });

    it("should NOT validate Location on non-3xx responses (httpbin 403 regression)", async () => {
      // Antes este test dependía de que httpbin devolviera 302. Cuando pasó a
      // devolver 403 con el mismo Location, el guard lo retornaba sin lanzar
      // (comportamiento correcto: solo 300-399 son redirecciones). El caso
      // queda fijado aquí para que un cambio de esa condición sea visible.
      fetchMock.mockResolvedValue(
        new Response("forbidden", { status: 403, headers: { location: "http://127.0.0.1/" } })
      );

      const res = await safeFetch("https://93.184.216.34/redirect-to");

      expect(res.status).toBe(403);
    });

    it("should return a 3xx without Location without throwing", async () => {
      fetchMock.mockResolvedValue(new Response(null, { status: 302 }));

      const res = await safeFetch("https://93.184.216.34/start");

      expect(res.status).toBe(302);
    });

    it("should NOT apply SSRF validation in follow mode (explicit caller choice)", async () => {
      fetchMock.mockResolvedValue(redirectTo("http://127.0.0.1:9999/"));

      const res = await safeFetch("https://93.184.216.34/start", { redirect: "follow" });

      expect(res.status).toBe(302);
      expect(fetchMock.mock.calls[0]?.[1]?.redirect).toBe("follow");
    });
  });
});
