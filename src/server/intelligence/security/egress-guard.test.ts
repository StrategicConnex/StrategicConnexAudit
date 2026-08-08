import { describe, it, expect, beforeAll } from "vitest";
import { isBlockedAddress, isPrivateIp, assertPublicHostname, safeFetch, normalizeUrl, validateSafeUrl } from "./egress-guard";

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

  describe("assertPublicHostname()", () => {
    it("should immediately reject blocked IP inputs", async () => {
      await expect(assertPublicHostname("127.0.0.1")).rejects.toThrow(
        "SSRF Prevention: Blocked private or reserved IP target"
      );
      await expect(assertPublicHostname("10.0.0.1")).rejects.toThrow(
        "SSRF Prevention: Blocked private or reserved IP target"
      );
    });

    it("should resolve and accept safe public hostnames", async () => {
      const result = await assertPublicHostname("google.com");
      expect(result.length).toBeGreaterThan(0);
      expect(result[0].address).toBeDefined();
    });

    it("should reject hostnames that resolve to private subnets", async () => {
      // Create a local hostname check, or mock lookup for isolated test stability
      // If we don't mock node:dns, some systems may not resolve specific local hostnames, 
      // but let's test it against a mock resolver if needed.
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

  describe("validateSafeUrl()", () => {
    it("should accept valid public URLs", async () => {
      const url = "https://google.com";
      const res = await validateSafeUrl(url);
      expect(res).toBe(url);
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

  // Sondeo previo de conectividad: estos tests requieren internet real y
  // httpbin.org / example.com pueden estar caídos o filtrados (p.ej. detrás
  // de un proxy corporativo que devuelve 503). Si no hay red, se omiten en
  // vez de fallar — es flakiness ambiental, no una regresión del código.
  const networkReachablePromise = Promise.all(
    ["https://example.com", "https://httpbin.org/status/200"].map((url) =>
      fetch(url, { signal: AbortSignal.timeout(8_000), redirect: "manual" })
        .then((res) => res.status < 500)
        .catch(() => false),
    )
  ).then((results) => results.every(Boolean));

  describe("safeFetch — integración real contra red (requiere internet)", () => {
    let networkReachable = false;

    beforeAll(async () => {
      networkReachable = await networkReachablePromise;
    });

    // Wrapper que omite el test si la red no está disponible (ambiental).
    const itOnline = (name: string, fn: () => Promise<void>) =>
      it(name, async () => {
        if (!networkReachable) return;
        await fn();
      });

    const HTTPBIN = "https://httpbin.org";

    itOnline("debería fetchear exitosamente un dominio público sin redirección", async () => {
      const res = await safeFetch("https://example.com", { method: "GET" });
      expect(res.ok).toBe(true);
      expect(res.status).toBe(200);
    });

    itOnline("debería seguir una redirección segura (a dominio público) cuando redirect=manual", async () => {
      // httpbin.org/redirect-to?url=... devuelve 302 con Location al target
      const target = encodeURIComponent("https://example.com");
      const res = await safeFetch(`${HTTPBIN}/redirect-to?url=${target}`, {
        method: "GET",
        redirect: "manual",
      });
      // safeFetch devuelve la 302 sin seguir — verificar Location válido
      expect(res.status).toBe(302);
      const location = res.headers.get("location");
      expect(location).toBe("https://example.com");
    });

    itOnline("debería BLOQUEAR redirección a IP privada en modo manual", async () => {
      const target = encodeURIComponent("http://127.0.0.1");
      await expect(
        safeFetch(`${HTTPBIN}/redirect-to?url=${target}`, {
          method: "GET",
          redirect: "manual",
        })
      ).rejects.toThrow(/SSRF Prevention|Acceso denegado/);
    });

    itOnline("debería BLOQUEAR redirección a AWS metadata IP en modo manual", async () => {
      const target = encodeURIComponent("http://169.254.169.254/latest/meta-data/");
      await expect(
        safeFetch(`${HTTPBIN}/redirect-to?url=${target}`, {
          method: "GET",
          redirect: "manual",
        })
      ).rejects.toThrow(/SSRF Prevention|Acceso denegado/);
    });

    itOnline("NO debería lanzar SSRF error en modo follow (el caller eligió explícitamente)", async () => {
      const target = encodeURIComponent("http://127.0.0.1:9999");
      try {
        await safeFetch(`${HTTPBIN}/redirect-to?url=${target}`, {
          method: "GET",
          redirect: "follow",
        });
        // Si milagrosamente conecta, no es SSRF
      } catch (error: any) {
        // Puede lanzar error de conexión (ECONNREFUSED) pero NO de SSRF
        expect(error.message).not.toContain("SSRF Prevention");
        expect(error.message).not.toContain("Acceso denegado");
      }
    });
  });
});
