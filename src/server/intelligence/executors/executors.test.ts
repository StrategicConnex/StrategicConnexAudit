import { describe, it, expect, vi, beforeEach } from "vitest";
import { dnsLookupExecutor } from "./dns-executors";
import { emailSpfExecutor, emailDmarcExecutor } from "./email-executors";
import { calculateRiskScore } from "../core/risk-engine";
import { executeTool } from "../core/dispatcher";
import { getExecutor } from "../core/executor-registry";
import { ExecutionContext, Finding } from "../types/executor.types";

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
vi.mock("node:dns/promises", () => ({
  default: {
    resolveTxt: vi.fn().mockResolvedValue([]),
    resolve4: vi.fn().mockResolvedValue(["1.2.3.4"]),
    resolveMx: vi.fn().mockResolvedValue([{ exchange: "mail.example.com", priority: 10 }]),
    resolveNs: vi.fn().mockResolvedValue(["ns1.example.com"]),
    resolveSoa: vi.fn().mockResolvedValue({ nsname: "ns1.example.com", hostmaster: "admin.example.com", serial: 1, refresh: 7200, retry: 3600, expire: 604800, minttl: 3600 }),
  },
  resolveTxt: vi.fn().mockResolvedValue([]),
}));

describe("Cybersecurity Executing Suite — Test de Componentes Core", () => {
  const dummyCtx: ExecutionContext = {
    projectId: "12345678-1234-1234-1234-123456789abc",
    investigationId: "investigation-123",
    userId: "user-123",
    signal: new AbortController().signal,
    log: (msg, p) => console.log(`[Test Log] ${msg}`, p || ""),
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
      // N = 2, penaltías = high(50*1) + medium(25*1) = 75
      // 75 / sqrt(2) ≈ 53.03 → score = 100 - 53.03 ≈ 47
      expect(score).toBeGreaterThan(0);
      expect(score).toBeLessThan(100);
      expect(score).toBe(47); // Valor matemáticamente esperado
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
    });
  });
});
