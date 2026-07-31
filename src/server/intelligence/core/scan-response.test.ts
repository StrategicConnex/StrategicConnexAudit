import { describe, it, expect } from "vitest";
import {
  buildResultMap,
  getPrimaryIp,
  buildScanResponse,
  buildScanMetadata,
} from "./scan-response";

const makeInv = (over: Partial<{ id: string; title: string; target: string; targetType: string; score: number | null }> = {}) => ({
  id: over.id ?? "inv-1",
  title: over.title ?? "T",
  target: over.target ?? "example.com",
  normalizedTarget: "example.com",
  targetType: "domain",
  score: over.score ?? 80,
  status: "completed",
});

describe("scan-response — lecturas tipadas (contrato lowercase)", () => {
  it("buildScanResponse mapea dns.lookup lowercase {a, aaaa} a A/AAAA", () => {
    const R = buildResultMap([
      { toolId: "dns.lookup", output: { domain: "example.com", a: ["1.2.3.4"], aaaa: ["2001:db8::1"], mx: [], ns: ["ns1.example.com"], txt: [], soa: null } },
      { toolId: "dns.mx", output: { domain: "example.com", records: [{ priority: 10, exchange: "mail.example.com" }] } },
      { toolId: "dns.ns", output: { domain: "example.com", servers: ["ns1.example.com"] } },
      { toolId: "dns.txt", output: { domain: "example.com", records: ["v=spf1 -all"] } },
    ]);
    const res = buildScanResponse({
      R,
      investigation: makeInv(),
      target: "example.com",
      normalizedTarget: "example.com",
      targetType: "domain",
      score: 80,
      mailHealthScore: 70,
      infraScore: 85,
      aggregatedFindings: [],
    });
    expect(res.dns.A).toEqual(["1.2.3.4"]);
    expect(res.dns.AAAA).toEqual(["2001:db8::1"]);
    expect(res.dns.MX).toEqual([{ priority: 10, exchange: "mail.example.com" }]);
    expect(res.dns.NS).toEqual(["ns1.example.com"]);
    expect(res.dns.TXT).toEqual(["v=spf1 -all"]);
  });

  it("getPrimaryIp usa la clave lowercase 'a'", () => {
    const R = buildResultMap([
      { toolId: "dns.lookup", output: { domain: "example.com", a: ["9.9.9.9"], aaaa: [], mx: [], ns: [], txt: [], soa: null } },
    ]);
    expect(getPrimaryIp(R)).toBe("9.9.9.9");
  });

  it("getPrimaryIp devuelve null sin registros A", () => {
    const R = buildResultMap([
      { toolId: "dns.lookup", output: { domain: "example.com", a: [], aaaa: [], mx: [], ns: [], txt: [], soa: null } },
    ]);
    expect(getPrimaryIp(R)).toBeNull();
  });

  it("buildScanResponse propaga tls.scan tipado (subject/issuer/daysRemaining)", () => {
    const R = buildResultMap([
      { toolId: "tls.scan", output: { host: "example.com", subject: "CN=example.com", issuer: "Let's Encrypt", validFrom: "2024-01-01", validTo: "2025-01-01", daysRemaining: 120, protocol: "TLSv1.3", cipher: "AES256" } },
    ]);
    const res = buildScanResponse({
      R,
      investigation: makeInv(),
      target: "example.com",
      normalizedTarget: "example.com",
      targetType: "domain",
      score: 80,
      mailHealthScore: 70,
      infraScore: 85,
      aggregatedFindings: [],
    });
    expect(res.ssl.subject).toBe("CN=example.com");
    expect(res.ssl.issuer).toBe("Let's Encrypt");
    expect(res.ssl.daysRemaining).toBe(120);
  });

  it("buildScanMetadata lee reverseDns y cdnWaf de outputs reales", () => {
    const R = buildResultMap([
      { toolId: "network.reverse_dns", output: { ip: "1.1.1.1", hostnames: ["one.one.one.one"], ptr: ["one.one.one.one"] } },
      { toolId: "network.cdn", output: { domain: "example.com", detected: true, provider: "Cloudflare", method: "DNS CNAME" } },
      { toolId: "network.waf", output: { url: "https://example.com", detected: true, wafProvider: "Cloudflare WAF", confidence: 0.95, signatures: ["cf-ray"] } },
    ]);
    const meta = buildScanMetadata({ R, mailHealthScore: 70, infraScore: 85 });
    expect(meta.reverseDns).toEqual(["one.one.one.one"]);
    expect(meta.cdnWaf.cdnProvider).toBe("Cloudflare");
    expect(meta.cdnWaf.wafProvider).toBe("Cloudflare WAF");
    expect(meta.cdnWaf.detected).toBe(true);
  });
});
