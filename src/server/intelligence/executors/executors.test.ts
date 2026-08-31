import { describe, it, expect, vi, beforeEach } from "vitest";
import { dnsLookupExecutor } from "./dns-executors";
import { emailSpfExecutor, emailDmarcExecutor } from "./email-executors";
import {
  networkAsnExecutor,
  networkCdnExecutor,
  networkWafExecutor,
  networkReverseIpExecutor,
  threatIpReputationExecutor
} from "./network-executors";
import { calculateRiskScore } from "../core/risk-engine";
import { executeTool } from "../core/dispatcher";
import { getExecutor, listToolDefinitions } from "../core/tool-registry";
import { ExecutionContext, Finding } from "../types/executor.types";
import { dnsDnssecExecutor, dnsPropagationExecutor, dnsZoneExecutor } from "./dns-advanced";
import { websiteRedirectsExecutor, websiteCookiesExecutor, websiteCspExecutor } from "./website-executors";
import { logger } from "@/lib/logger";

// Mock del EgressGuard para que los tests pasen de forma determinista e inmediata sin tocar red real
vi.mock("../security/egress-guard", () => ({
  assertPublicHostname: vi.fn().mockImplementation(async (host: string) => {
    if (host.includes("private") || host.includes("127.0.0.1")) {
      throw new Error("EgressGuard: Acceso a host privado bloqueado (SSRF)");
    }
    return host;
  }),
  safeFetch: vi.fn(),
}));

// Mock DNS globalmente antes de todos los tests
vi.mock("node:dns/promises", () => {
  const defaultExports = {
    resolveTxt: vi.fn().mockResolvedValue([]),
    resolve4: vi.fn().mockResolvedValue(["1.2.3.4"]),
    resolveMx: vi.fn().mockResolvedValue([{ exchange: "mail.example.com", priority: 10 }]),
    resolveNs: vi.fn().mockResolvedValue(["ns1.example.com"]),
    resolveSoa: vi.fn().mockResolvedValue({ nsname: "ns1.example.com", hostmaster: "admin.example.com", serial: 1, refresh: 7200, retry: 3600, expire: 604800, minttl: 3600 }),
    resolve6: vi.fn().mockResolvedValue([]),
    resolveSrv: vi.fn().mockResolvedValue([]),
    resolve: vi.fn().mockImplementation(async (host: string, type: string) => {
      if (type === "CNAME") return [];
      if (type === "CAA") return [{ critical: 0, tag: "issue", value: "letsencrypt.org" }];
      if (type === "DNSKEY") return [];
      if (type === "DS") return [];
      if (type === "RRSIG") return [];
      throw new Error(`DNS type not found: ${type}`);
    }) as any,
  };
  return {
    default: defaultExports,
    resolveTxt: defaultExports.resolveTxt as any,
  };
});

describe("Cybersecurity Executing Suite — Test de Componentes Core", () => {
  const dummyCtx: ExecutionContext = {
    projectId: "12345678-1234-1234-1234-123456789abc",
    investigationId: "investigation-123",
    userId: "user-123",
    signal: new AbortController().signal,
    log: (msg, p) => logger.info(`[Test Log] ${msg}`, p || ""),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ─────────────────────────────────────────────
  describe("DNS Executors", () => {
    it("Debería validar correctamente los inputs de dominio válidos", () => {
      const input = dnsLookupExecutor.validate({ domain: "example.com" });
      expect(input.domain).toBe("example.com");
    });

    it("Debería fallar si se pasa un dominio vacío o mal formateado", () => {
      expect(() => dnsLookupExecutor.validate({ domain: "" })).toThrow();
    });
  });

  // ─────────────────────────────────────────────
  describe("Email Audit Executors (SPF & DMARC)", () => {
    it("Debería evaluar SPF con directivas débiles y computar DNS lookups", async () => {
      const dns = await import("node:dns/promises");
      vi.mocked(dns.default.resolveTxt).mockResolvedValue([
        ["v=spf1 include:_spf.google.com +all"]
      ] as string[][]);

      const result = await emailSpfExecutor.execute(dummyCtx, { domain: "weak-spf.com" });

      expect(result.success).toBe(true);
      // El executor retorna output.raw con el registro
      expect(result.output.raw).toContain("v=spf1");
      // 1 include en el registro → 1 lookup DNS
      expect(result.output.lookups).toBe(1);
      expect(result.findings.length).toBeGreaterThan(0);
      // +all genera finding crítico
      const criticalFinding = result.findings.find(f => f.severity === "critical");
      expect(criticalFinding).toBeDefined();
    });

    it("Debería evaluar DMARC con políticas en modo monitoreo (p=none)", async () => {
      const dns = await import("node:dns/promises");
      vi.mocked(dns.default.resolveTxt).mockResolvedValue([
        ["v=DMARC1; p=none; rua=mailto:dmarc@example.com"]
      ] as string[][]);

      const result = await emailDmarcExecutor.execute(dummyCtx, { domain: "monitor-dmarc.com" });

      expect(result.success).toBe(true);
      expect(result.output.policy).toBe("none");
      // p=none genera finding de severidad medium
      expect(result.findings.some(f => f.severity === "medium")).toBe(true);
    });

    it("Debería registrar hallazgo critical cuando DMARC es inexistente", async () => {
      const dns = await import("node:dns/promises");
      vi.mocked(dns.default.resolveTxt).mockResolvedValue([] as string[][]);

      const result = await emailDmarcExecutor.execute(dummyCtx, { domain: "no-dmarc.com" });

      expect(result.success).toBe(true);
      const criticalFinding = result.findings.find(f => f.severity === "critical");
      expect(criticalFinding).toBeDefined();
    });
  });

  // ─────────────────────────────────────────────
  describe("Deterministic Risk Engine & Correlation Rules", () => {
    it("Debería atenuar el score total de forma matemática y determinista", () => {
      const findings: Finding[] = [
        {
          toolId: "website.security_headers",
          category: "security",
          severity: "high",
          confidence: 1.0,
          title: "Falta CSP",
          description: "Falta la cabecera Content-Security-Policy.",
          evidence: {},
          scoreImpact: 15,
        },
        {
          toolId: "tls.scan",
          category: "security",
          severity: "medium",
          confidence: 1.0,
          title: "TLS débil",
          description: "Protocolo TLS obsoleto detectado.",
          evidence: {},
          scoreImpact: 8,
        },
      ];

      const { score } = calculateRiskScore(findings);
      // totalPenalties = high(50*1) + medium(25*1) = 75
      // Fórmula asintótica: calculatedPenalty = 100 * (1 - e^(-75/150)) = 100 * 0.39347 = 39.35
      // score = 100 - 39.35 = 60.65 → 61
      expect(score).toBeGreaterThan(0);
      expect(score).toBeLessThan(100);
      expect(score).toBe(61);
    });

    it("Debería retornar score 100 cuando no existen hallazgos activos", () => {
      const { score } = calculateRiskScore([]);
      expect(score).toBe(100);
    });

    it("Debería retornar deductions con título y penalidad de cada hallazgo", () => {
      const findings: Finding[] = [
        {
          severity: "critical",
          confidence: 1.0,
          title: "Vulnerabilidad Crítica",
          description: "Test finding crítico.",
        },
      ];

      const { deductions } = calculateRiskScore(findings);
      expect(deductions.length).toBe(1);
      expect(deductions[0]?.title).toBe("Vulnerabilidad Crítica");
      expect(deductions[0]?.penalty).toBeGreaterThan(0);
    });

    it("Debería gatillar regla de correlación crítica cuando falten SPF y DMARC a la vez", () => {
      const findings: Finding[] = [
        {
          toolId: "email.spf",
          category: "security",
          severity: "high",
          confidence: 1.0,
          title: "Falta Registro de Protección de Correo SPF",
          description: "No existe registro SPF en el dominio.",
          evidence: {},
          scoreImpact: 35,
        },
        {
          toolId: "email.dmarc",
          category: "security",
          severity: "high",
          confidence: 1.0,
          title: "Falta Registro de Alineación de Políticas DMARC",
          description: "No existe registro DMARC en el dominio.",
          evidence: {},
          scoreImpact: 30,
        },
      ];

      const { aggregatedFindings } = calculateRiskScore(findings);
      const correlated = aggregatedFindings.find(f => f.title.includes("Ausencia Combinada de Protocolos"));
      expect(correlated).toBeDefined();
      expect(correlated?.severity).toBe("critical");
      expect(correlated?.scoreImpact).toBe(50);
    });
  });

  // ─────────────────────────────────────────────
  describe("Centralized Dispatcher & Registry", () => {
    it("Debería registrar correctamente el ejecutor dns.lookup en el registro central", () => {
      const dnsExecutor = getExecutor("dns.lookup");
      expect(dnsExecutor).toBeDefined();
      expect(dnsExecutor?.timeoutMs).toBe(8000);
    });

    it("Debería retornar undefined para herramientas no registradas", () => {
      const notFound = getExecutor("tool.nonexistent.xyz");
      expect(notFound).toBeUndefined();
    });

    it("Debería mantener el invariante de catálogo: 34 natives + 9 huérfanas = 43 defs", () => {
      const all = listToolDefinitions();
      expect(all.length).toBe(43);

      // Las herramientas ejecutables (con executor registrado) son 34
      const runnable = all.filter((t) => !!getExecutor(t.id));
      expect(runnable.length).toBe(34);

      // Las huérfanas de catálogo (sin executor) quedan excluidas del filtro de ejecución
      const orphans = all.filter((t) => !getExecutor(t.id));
      expect(orphans.length).toBe(9);
      expect(orphans.some((o) => o.id === "network.port_scan")).toBe(true);
    });

    it("Debería bloquear de manera preventiva ataques SSRF dirigidos a hosts locales", async () => {
      const result = await executeTool(
        "dns.lookup",
        "private-host.local",
        { target: "private-host.local" },
        "project-123"
      );
      expect(result.success).toBe(false);
      // El dispatcher captura el error del EgressGuard y lo propaga en error
      expect(result.error).toBeDefined();
    }, 15000);
  });

  // ─────────────────────────────────────────────
  describe("DNS Advanced Executors (dns.dnssec, dns.propagation, dns.zone)", () => {
    it("Debería detectar DNSSEC habilitado cuando DNSKEY y DS están presentes", async () => {
      const dnsMod = await import("node:dns/promises");
      (dnsMod.default.resolve as any).mockImplementation(async (host: string, type: string) => {
        if (type === "DNSKEY") return [{ flags: 256, protocol: 3, algorithm: 13, publicKey: "key1" }];
        if (type === "DS") return [{ keyTag: 12345, algorithm: 13, digestType: 2, digest: "abc" }];
        if (type === "RRSIG") return [{ typeCovered: "A", algorithm: 13, labels: 2, originalTtl: 3600, expiration: 9999999999, inception: 1000000000, keyTag: 12345, signerName: "example.com", signature: "sig" }];
        throw new Error(`Unexpected type: ${type}`);
      });

      const result = await dnsDnssecExecutor.execute(dummyCtx, { domain: "dnssec-enabled.com" });
      expect(result.success).toBe(true);
      expect(result.output.dnssecEnabled).toBe(true);
      expect(result.output.dnssecSigned).toBe(true);
      expect(result.output.hasDnskey).toBe(true);
      expect(result.output.hasDs).toBe(true);
      expect(result.output.hasRrsig).toBe(true);
      expect(result.findings.length).toBe(0);
    });

    it("Debería reportar hallazgo cuando DNSSEC no está habilitado", async () => {
      const dnsMod = await import("node:dns/promises");
      (dnsMod.default.resolve as any).mockRejectedValue(new Error("No such record"));

      const result = await dnsDnssecExecutor.execute(dummyCtx, { domain: "no-dnssec.com" });
      expect(result.success).toBe(true);
      expect(result.output.dnssecEnabled).toBe(false);
      expect(result.output.hasDnskey).toBe(false);
      expect(result.output.hasDs).toBe(false);
      const finding = result.findings.find(f => f.title.includes("DNSSEC No Habilitado"));
      expect(finding).toBeDefined();
      expect(finding?.severity).toBe("medium");
    });

    it("Debería validar input correctamente en dnsDnssecExecutor", () => {
      const input = dnsDnssecExecutor.validate({ domain: "example.com" });
      expect(input.domain).toBe("example.com");
      expect(() => dnsDnssecExecutor.validate({ domain: "" })).toThrow();
    });

    it("Debería reportar propagación consistente cuando todos los resolvers coinciden", async () => {
      const dnsMod = await import("node:dns/promises");
      vi.mocked(dnsMod.default.resolve4).mockResolvedValue(["192.0.2.1"]);
      vi.mocked(dnsMod.default.resolveMx).mockResolvedValue([{ exchange: "mail.example.com", priority: 10 }]);

      const result = await dnsPropagationExecutor.execute(dummyCtx, { domain: "consistent.com" });
      expect(result.success).toBe(true);
      expect(result.output.aConsistent).toBe(true);
      expect(result.output.mxConsistent).toBe(true);
      expect(result.output.resolverResults).toHaveLength(4);
      expect(result.findings.length).toBe(0);
    });

    it("Debería validar input correctamente en dnsPropagationExecutor", () => {
      const input = dnsPropagationExecutor.validate({ domain: "example.com" });
      expect(input.domain).toBe("example.com");
      expect(() => dnsPropagationExecutor.validate({ domain: "" })).toThrow();
    });

    it("Debería analizar zona DNS completa con SOA, NS, MX y TXT", async () => {
      const dnsMod = await import("node:dns/promises");
      vi.mocked(dnsMod.default.resolveSoa).mockResolvedValue({
        nsname: "ns1.example.com", hostmaster: "admin.example.com",
        serial: 2024001, refresh: 7200, retry: 3600, expire: 604800, minttl: 3600
      });
      vi.mocked(dnsMod.default.resolveNs).mockResolvedValue(["ns1.example.com"]);
      vi.mocked(dnsMod.default.resolveMx).mockResolvedValue([{ exchange: "mail.example.com", priority: 10 }]);
      vi.mocked(dnsMod.default.resolveTxt).mockResolvedValue([["v=spf1 include:_spf.google.com ~all"] as any]);
      vi.mocked(dnsMod.default.resolve4).mockResolvedValue(["192.0.2.1"]);
      vi.mocked(dnsMod.default.resolve6).mockResolvedValue(["2001:db8::1"]);
      vi.mocked(dnsMod.default.resolveSrv).mockResolvedValue([]);
      (dnsMod.default.resolve as any).mockImplementation(async (host: string, type: string) => {
        if (type === "CNAME") return [];
        if (type === "CAA") return [{ critical: 0, tag: "issue", value: "letsencrypt.org" } as any];
        return [];
      });

      const result = await dnsZoneExecutor.execute(dummyCtx, { domain: "full-zone.com" });
      expect(result.success).toBe(true);
      expect(result.output.soa).not.toBeNull();
      expect(result.output.soa?.nsname).toBe("ns1.example.com");
      expect(result.output.soa?.minttl).toBe(3600);
      expect(result.output.ns).toHaveLength(1);
      expect(result.output.mx).toHaveLength(1);
      expect(result.output.txt).toHaveLength(1);
      expect(result.output.a).toEqual(["192.0.2.1"]);
      expect(result.output.aaaa).toEqual(["2001:db8::1"]);
      expect(result.output.caa).toHaveLength(1);
      expect(result.output.recordsFound).toBeGreaterThan(5);
    });

    it("Debería reportar CAA ausente como hallazgo medium", async () => {
      const dnsMod = await import("node:dns/promises");
      vi.mocked(dnsMod.default.resolveSoa).mockResolvedValue({
        nsname: "ns1.example.com", hostmaster: "admin.example.com",
        serial: 1, refresh: 7200, retry: 3600, expire: 604800, minttl: 3600
      });
      vi.mocked(dnsMod.default.resolveNs).mockResolvedValue(["ns1.example.com"]);
      vi.mocked(dnsMod.default.resolveMx).mockResolvedValue([{ exchange: "mail.example.com", priority: 10 }]);
      vi.mocked(dnsMod.default.resolveTxt).mockResolvedValue([] as any);
      vi.mocked(dnsMod.default.resolve4).mockResolvedValue(["192.0.2.1"]);
      vi.mocked(dnsMod.default.resolve6).mockResolvedValue([]);
      (dnsMod.default.resolve as any).mockRejectedValue(new Error("No CAA"));
      vi.mocked(dnsMod.default.resolveSrv).mockRejectedValue(new Error("No SRV"));

      const result = await dnsZoneExecutor.execute(dummyCtx, { domain: "no-caa.com" });
      expect(result.success).toBe(true);
      const caaFinding = result.findings.find(f => f.title.includes("CAA Ausente"));
      expect(caaFinding).toBeDefined();
      expect(caaFinding?.severity).toBe("medium");
    });

    it("Debería validar input correctamente en dnsZoneExecutor", () => {
      const input = dnsZoneExecutor.validate({ domain: "example.com" });
      expect(input.domain).toBe("example.com");
      expect(() => dnsZoneExecutor.validate({ domain: "ab" })).toThrow();
    });
  });

  // ─────────────────────────────────────────────
  describe("Website Advanced Executors (website.redirects, website.cookies, website.csp)", () => {
    it("Debería validar input correctamente en websiteRedirectsExecutor", () => {
      const input = websiteRedirectsExecutor.validate({ url: "https://example.com" });
      expect(input.url).toBe("https://example.com");
      expect(() => websiteRedirectsExecutor.validate({ url: "not-a-url" })).toThrow();
    });

    it("Debería seguir cadena de redirecciones y reportar resultado final", async () => {
      const { safeFetch } = await import("../security/egress-guard");
      
      const response1 = new Response(null, { status: 301, headers: { location: "https://example.com/final" } });
      const response2 = new Response("OK", { status: 200 });
      
      vi.mocked(safeFetch)
        .mockResolvedValueOnce(response1)
        .mockResolvedValueOnce(response2);

      const result = await websiteRedirectsExecutor.execute(dummyCtx, { url: "https://example.com/start" });
      
      expect(result.success).toBe(true);
      expect(result.output.chain).toHaveLength(2);
      expect(result.output.redirectCount).toBe(1);
      expect(result.output.finalStatus).toBe(200);
    });

    it("Debería detectar redirección HTTP→HTTPS", async () => {
      const { safeFetch } = await import("../security/egress-guard");
      
      const responseHttp = new Response(null, { status: 301, headers: { location: "https://example.com" } });
      const responseHttps = new Response("OK", { status: 200 });
      
      vi.mocked(safeFetch)
        .mockReset()
        .mockResolvedValueOnce(responseHttp)
        .mockResolvedValueOnce(responseHttps);

      const result = await websiteRedirectsExecutor.execute(dummyCtx, { url: "http://example.com" });
      
      expect(result.success).toBe(true);
      expect(result.output.hasHttpsUpgrade).toBe(true);
      expect(result.findings.length).toBe(0);
    });

    it("Debería reportar hallazgo cuando no hay redirección HTTPS", async () => {
      const { safeFetch } = await import("../security/egress-guard");
      
      const response200 = new Response("OK", { status: 200 });
      
      vi.mocked(safeFetch)
        .mockReset()
        .mockResolvedValueOnce(response200);

      const result = await websiteRedirectsExecutor.execute(dummyCtx, { url: "http://example.com" });
      
      expect(result.success).toBe(true);
      expect(result.output.hasHttpsUpgrade).toBe(false);
      const finding = result.findings.find(f => f.title.includes("Redirección HTTPS Ausente"));
      expect(finding).toBeDefined();
      expect(finding?.severity).toBe("high");
    });

    it("Debería validar input correctamente en websiteCookiesExecutor", () => {
      const input = websiteCookiesExecutor.validate({ url: "https://example.com" });
      expect(input.url).toBe("https://example.com");
      expect(() => websiteCookiesExecutor.validate({ url: "" })).toThrow();
    });

    it("Debería analizar cookies y reportar flags faltantes (vía fallback headers.get)", async () => {
      const { safeFetch } = await import("../security/egress-guard");
      
      // Usar una sola cookie que no tenga flags Secure/HttpOnly/SameSite
      // El executor usa el fallback res.headers.get("set-cookie") porque
      // getSetCookie() no siempre está disponible en el entorno de test.
      const headers = new Headers({ "set-cookie": "session=abc123; Path=/" });
      const response = new Response("OK", { status: 200, headers });
      
      vi.mocked(safeFetch)
        .mockReset()
        .mockResolvedValueOnce(response);

      const result = await websiteCookiesExecutor.execute(dummyCtx, { url: "https://example.com" });
      
      expect(result.success).toBe(true);
      expect(result.output.cookieCount).toBe(1);
      
      // session cookie: sin Secure, sin HttpOnly, sin SameSite → 3 findings
      const sessionFindings = result.findings.filter((f: Finding) => f.title.includes("session"));
      expect(sessionFindings.length).toBe(3);
      expect(sessionFindings.some(f => f.title.includes("Secure"))).toBe(true);
      expect(sessionFindings.some(f => f.title.includes("HttpOnly"))).toBe(true);
      expect(sessionFindings.some(f => f.title.includes("SameSite"))).toBe(true);
    });

    it("Debería analizar cookie con todos los flags presente y no generar hallazgos", async () => {
      const { safeFetch } = await import("../security/egress-guard");
      
      const headers = new Headers({ "set-cookie": "token=xyz; Secure; HttpOnly; SameSite=Lax" });
      const response = new Response("OK", { status: 200, headers });
      
      vi.mocked(safeFetch)
        .mockReset()
        .mockResolvedValueOnce(response);

      const result = await websiteCookiesExecutor.execute(dummyCtx, { url: "https://example.com" });
      
      expect(result.success).toBe(true);
      expect(result.output.cookieCount).toBe(1);
      
      // token cookie: todos los flags presentes → sin findings
      const tokenFindings = result.findings.filter((f: Finding) => f.title.includes("token"));
      expect(tokenFindings.length).toBe(0);
    });

    it("Debería validar input correctamente en websiteCspExecutor", () => {
      const input = websiteCspExecutor.validate({ url: "https://example.com" });
      expect(input.url).toBe("https://example.com");
      expect(() => websiteCspExecutor.validate({ url: "not-a-url" })).toThrow();
    });

    it("Debería analizar CSP presente y calcular score sin hallazgos críticos", async () => {
      const { safeFetch } = await import("../security/egress-guard");
      
      const response = new Response("OK", {
        status: 200,
        headers: {
          "content-security-policy": "default-src 'self'; script-src 'self' https://analytics.example.com; object-src 'none'"
        }
      });
      
      vi.mocked(safeFetch)
        .mockReset()
        .mockResolvedValueOnce(response);

      const result = await websiteCspExecutor.execute(dummyCtx, { url: "https://example.com" });
      
      expect(result.success).toBe(true);
      expect(result.output.csp).not.toBeNull();
      expect(result.output.score).toBeGreaterThan(0);
      expect(result.output.hasUnsafeInline).toBe(false);
      expect(result.output.hasWildcardSrc).toBe(false);
      expect(result.output.directiveCount).toBeGreaterThanOrEqual(3);
      expect(result.findings.length).toBe(0);
    });

    it("Debería reportar CSP ausente como hallazgo high", async () => {
      const { safeFetch } = await import("../security/egress-guard");
      
      const response = new Response("OK", { status: 200, headers: {} });
      
      vi.mocked(safeFetch)
        .mockReset()
        .mockResolvedValueOnce(response)
        .mockResolvedValueOnce(response); // fallback GET

      const result = await websiteCspExecutor.execute(dummyCtx, { url: "https://no-csp.com" });
      
      expect(result.success).toBe(true);
      expect(result.output.csp).toBeNull();
      expect(result.output.score).toBe(0);
      const finding = result.findings.find(f => f.title.includes("Content-Security-Policy Ausente"));
      expect(finding).toBeDefined();
      expect(finding?.severity).toBe("high");
    });

    it("Debería detectar unsafe-inline en CSP", async () => {
      const { safeFetch } = await import("../security/egress-guard");
      
      const response = new Response("OK", {
        status: 200,
        headers: {
          "content-security-policy": "default-src 'self'; script-src 'unsafe-inline' 'self'"
        }
      });
      
      vi.mocked(safeFetch)
        .mockReset()
        .mockResolvedValueOnce(response);

      const result = await websiteCspExecutor.execute(dummyCtx, { url: "https://unsafe-inline.com" });
      
      expect(result.success).toBe(true);
      expect(result.output.hasUnsafeInline).toBe(true);
      const finding = result.findings.find(f => f.title.includes("unsafe-inline"));
      expect(finding).toBeDefined();
      expect(finding?.severity).toBe("high");
      expect(result.output.score).toBeLessThan(100);
    });

    it("Debería detectar comodín (*) en CSP", async () => {
      const { safeFetch } = await import("../security/egress-guard");
      
      const response = new Response("OK", {
        status: 200,
        headers: {
          "content-security-policy": "default-src *; script-src 'self'"
        }
      });
      
      vi.mocked(safeFetch)
        .mockReset()
        .mockResolvedValueOnce(response);

      const result = await websiteCspExecutor.execute(dummyCtx, { url: "https://wildcard-csp.com" });
      
      expect(result.success).toBe(true);
      expect(result.output.hasWildcardSrc).toBe(true);
      const finding = result.findings.find(f => f.title.includes("comodín"));
      expect(finding).toBeDefined();
      expect(finding?.severity).toBe("medium");
    });
  });

  // ─────────────────────────────────────────────
  describe("Phase 3 Network & Threat Executors", () => {
    it("Debería consultar y enriquecer datos de ASN", async () => {
      const result = await networkAsnExecutor.execute(dummyCtx, { ip: "8.8.8.8" });
      expect(result.success).toBe(true);
      expect(result.output.asn).toBeDefined();
      expect(result.findings.length).toBeGreaterThan(0);
    });

    it("Debería detectar CDN pasivamente", async () => {
      const result = await networkCdnExecutor.execute(dummyCtx, { domain: "google.com" });
      expect(result.success).toBe(true);
      expect(result.output.detected).toBeDefined();
      expect(result.findings.length).toBeGreaterThan(0);
    });

    it("Debería detectar firmas de WAF pasivamente", async () => {
      const result = await networkWafExecutor.execute(dummyCtx, { url: "https://example.com" });
      expect(result.success).toBe(true);
      expect(result.output.detected).toBeDefined();
      expect(result.findings.length).toBeGreaterThan(0);
    });

    it("Debería realizar consulta reverse IP de dominios co-alojados", async () => {
      const result = await networkReverseIpExecutor.execute(dummyCtx, { ip: "1.1.1.1" });
      expect(result.success).toBe(true);
      expect(result.output.domains).toBeDefined();
      expect(result.findings.length).toBeGreaterThan(0);
    });

    it("Debería realizar análisis de reputación de IP", async () => {
      const result = await threatIpReputationExecutor.execute(dummyCtx, { ip: "8.8.8.8" });
      expect(result.success).toBe(true);
      expect(result.output.reputationScore).toBeDefined();
      expect(result.findings.length).toBeGreaterThan(0);
    });
  });
});
