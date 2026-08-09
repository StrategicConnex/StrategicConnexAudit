import { describe, it, expect } from "vitest";
import {
  MITRE_MAPPING,
  getMitreTechniques,
  getPrimaryMitreTechnique,
  detectTechniqueByTitle,
  findTechnique,
} from "./mitre-mapping";

describe("mitre-mapping — MITRE_MAPPING (fuente única de verdad)", () => {
  it("contiene las técnicas canónicas de los ejecutores principales", () => {
    for (const toolId of [
      "dns.lookup", "dns.mx", "dns.txt", "dns.ns", "dns.dnssec",
      "email.spf", "email.dkim", "email.dmarc", "email.bimi",
      "network.ping", "network.asn", "network.geoip", "network.port_scan",
      "tls.scan", "website.security_headers", "website.csp",
      "osint.whois", "dns-brute", "ct-monitor", "shadow-detector",
    ]) {
      expect(MITRE_MAPPING[toolId]?.length ?? 0).toBeGreaterThan(0);
    }
  });

  it("cada técnica tiene id, name, tactic y url válidos", () => {
    for (const techniques of Object.values(MITRE_MAPPING)) {
      for (const t of techniques) {
        expect(t.id).toMatch(/^T\d{4}(\.\d{3})?$/);
        expect(t.name.length).toBeGreaterThan(0);
        expect(t.tactic.length).toBeGreaterThan(0);
        expect(t.url).toMatch(/^https:\/\/attack\.mitre\.org\//);
      }
    }
  });

  it("usa IDs MITRE reales por táctica (Reconnaissance vs Resource Development)", () => {
    expect(MITRE_MAPPING["dns.lookup"][0].tactic).toBe("Reconnaissance");
    expect(MITRE_MAPPING["dns-brute"][0].tactic).toBe("Resource Development");
    expect(MITRE_MAPPING["network.port_scan"][0].tactic).toBe("Discovery");
    expect(MITRE_MAPPING["tls.scan"][0].tactic).toBe("Command and Control");
  });
});

describe("mitre-mapping — getMitreTechniques / getPrimaryMitreTechnique", () => {
  it("devuelve las técnicas de un tool conocido", () => {
    const techniques = getMitreTechniques("dns.lookup");
    expect(techniques.length).toBe(1);
    expect(techniques[0].id).toBe("T1580");
    expect(techniques[0].name).toContain("DNS");
  });

  it("devuelve [] para un tool desconocido (sin lanzar)", () => {
    expect(getMitreTechniques("no.existe")).toEqual([]);
    expect(getMitreTechniques("")).toEqual([]);
  });

  it("getPrimaryMitreTechnique devuelve la primera técnica", () => {
    expect(getPrimaryMitreTechnique("dns.zone")?.id).toBe("T1595");
  });

  it("getPrimaryMitreTechnique devuelve null para tool desconocido", () => {
    expect(getPrimaryMitreTechnique("unknown.tool")).toBeNull();
  });
});

describe("mitre-mapping — detectTechniqueByTitle (keyword matching)", () => {
  it("detecta DNS por título (case-insensitive)", () => {
    expect(detectTechniqueByTitle("Registro A no resuelve")?.id).toBe("T1580");
    expect(detectTechniqueByTitle("dns propagation lento")?.id).toBe("T1580");
  });

  it("detecta SPF/DKIM/DMARC por título", () => {
    expect(detectTechniqueByTitle("SPF fail -all detectado")?.id).toBe("T1589.002");
    expect(detectTechniqueByTitle("Firma DKIM inválida")?.id).toBe("T1589.002");
    expect(detectTechniqueByTitle("Política DMARC débil")?.id).toBe("T1589.002");
  });

  it("detecta TLS/SSL y puertos abiertos", () => {
    expect(detectTechniqueByTitle("Certificado TLS expirado")?.id).toBe("T1573.002");
    expect(detectTechniqueByTitle("Puerto 22 abierto")?.id).toBe("T1046");
  });

  it("detecta WHOIS/RDAP y reputación/blacklists", () => {
    expect(detectTechniqueByTitle("whois expira en 10 días")?.id).toBe("T1596.001");
    expect(detectTechniqueByTitle("IP en blacklist spamhaus")?.id).toBe("T1596.003");
  });

  it("detecta cabeceras de seguridad y cookies", () => {
    expect(detectTechniqueByTitle("Falta HSTS en cabeceras")?.id).toBe("T1592.002");
    expect(detectTechniqueByTitle("Cookie sin flag Secure")?.id).toBe("T1592.002");
  });

  it("detecta shadow IT y subdominios", () => {
    expect(detectTechniqueByTitle("Bucket S3 expuesto (shadow IT)")?.id).toBe("T1583.001");
    expect(detectTechniqueByTitle("Subdominio sin resolver")?.id).toBe("T1583.001");
  });

  it("detecta correo/MX y tecnología web", () => {
    expect(detectTechniqueByTitle("Servidor MX sin SPF")?.id).toBe("T1589.002");
    expect(detectTechniqueByTitle("WordPress detectado")?.id).toBe("T1592.002");
  });

  it("detecta robots.txt, BGP/RPKI, traceroute y CT logs", () => {
    expect(detectTechniqueByTitle("robots.txt con rutas sensibles")?.id).toBe("T1592.002");
    expect(detectTechniqueByTitle("BGP sin RPKI")?.id).toBe("T1596.002");
    expect(detectTechniqueByTitle("Traceroute con hops altos")?.id).toBe("T1595.001");
    expect(detectTechniqueByTitle("Certificate Transparency sin monitoreo")?.id).toBe("T1596.001");
    expect(detectTechniqueByTitle("ct log desactualizado")?.id).toBe("T1596.001");
  });

  it("detecta open redirect y network.asn / geoip", () => {
    expect(detectTechniqueByTitle("open redirect en callback")?.id).toBe("T1567");
    expect(detectTechniqueByTitle("ASN sin geolocalización")?.id).toBe("T1596.002");
  });

  it("reconoce el keyword 'registro a' (con tilde no normalizada no aplica)", () => {
    // El matcher NO normaliza acentos: la keyword es 'registro a' sin tilde
    expect(detectTechniqueByTitle("Falla en registro a")?.id).toBe("T1580");
    expect(detectTechniqueByTitle("Falla en registro A")?.id).toBe("T1580");
  });

  it("devuelve null para un título sin keywords conocidas", () => {
    expect(detectTechniqueByTitle("Resultado normal sin patrones")).toBeNull();
    expect(detectTechniqueByTitle("")).toBeNull();
  });

  it("la primera regla que matchea gana (orden de precedencia)", () => {
    // 'dns' viene antes que 'correo' en las reglas → T1580
    expect(detectTechniqueByTitle("dns mx incorrecto")?.id).toBe("T1580");
  });
});

describe("mitre-mapping — findTechnique (toolId + fallback por título)", () => {
  it("prioriza el toolId sobre el título", () => {
    const t = findTechnique("email.spf", "Título sin keywords");
    expect(t?.id).toBe("T1589.002");
  });

  it("usa el título como fallback cuando el toolId es desconocido", () => {
    const t = findTechnique("unknown.tool", "certificado tls vencido");
    expect(t?.id).toBe("T1573.002");
  });

  it("devuelve null sin toolId ni título", () => {
    expect(findTechnique()).toBeNull();
    expect(findTechnique(undefined, undefined)).toBeNull();
  });

  it("no lanza con toolId vacío y título vacío", () => {
    expect(findTechnique("", "")).toBeNull();
  });
});
