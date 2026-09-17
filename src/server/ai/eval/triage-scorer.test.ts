import { describe, it, expect } from "vitest";
import { scoreTriageOutput, type GoldenCase } from "./triage-scorer";

const GOLDEN: GoldenCase = {
  id: "sql-injection-login",
  evidence: {},
  expect: {
    minFindings: 1,
    maxFindings: 4,
    mustContain: ["SQL", "inyecci"],
    mustIncludeSeverity: ["critical"],
  },
};

const GOOD = {
  vulnerabilities: [
    {
      title: "Inyección SQL en login",
      severity: "critical",
      cvssScore: 9.1,
      cweId: "CWE-89",
      owaspCategory: "A03:2021 Injection",
      mitreId: null,
      description: "El parámetro email permite inyección SQL ciega basada en tiempo.",
      evidenceSummary: "SLEEP(5) demoró 4800ms la respuesta.",
      remediation: ["Usar consultas parametrizadas", "Validar entrada en servidor"],
      references: ["https://owasp.org/www-community/attacks/SQL_Injection"],
      confidence: 0.9,
    },
  ],
};

describe("triage-scorer — harness de eval (P2-2)", () => {
  it("salida buena → 100", () => {
    const s = scoreTriageOutput(GOLDEN, GOOD);
    expect(s.score).toBe(100);
    expect(s.checks.every((c) => c.pass)).toBe(true);
  });

  it("sin hallazgos cuando se exige mínimo → 0 en conteo", () => {
    const s = scoreTriageOutput(GOLDEN, { vulnerabilities: [] });
    const conteo = s.checks.find((c) => c.name.startsWith("conteo >="));
    expect(conteo?.pass).toBe(false);
    expect(s.score).toBeLessThan(100);
  });

  it("CWE con formato inválido invalida el hallazgo", () => {
    const bad = {
      vulnerabilities: [{ ...GOOD.vulnerabilities[0], cweId: "CWE-XYZ" }],
    };
    const s = scoreTriageOutput(GOLDEN, bad);
    const validez = s.checks.find((c) => c.name.startsWith("hallazgos válidos"));
    expect(validez?.pass).toBe(false);
  });

  it("CVSS fuera de rango invalida el hallazgo", () => {
    const bad = {
      vulnerabilities: [{ ...GOOD.vulnerabilities[0], cvssScore: 11 }],
    };
    const s = scoreTriageOutput(GOLDEN, bad);
    expect(s.checks.find((c) => c.name.startsWith("hallazgos válidos"))?.pass).toBe(false);
  });

  it("remediation vacía invalida el hallazgo", () => {
    const bad = {
      vulnerabilities: [{ ...GOOD.vulnerabilities[0], remediation: [] }],
    };
    const s = scoreTriageOutput(GOLDEN, bad);
    expect(s.checks.find((c) => c.name.startsWith("hallazgos válidos"))?.pass).toBe(false);
  });

  it("relleno excesivo (más del máximo) falla", () => {
    const padded = {
      vulnerabilities: Array.from({ length: 6 }, (_, i) => ({
        ...GOOD.vulnerabilities[0],
        title: `Relleno ${i}`,
      })),
    };
    const s = scoreTriageOutput(GOLDEN, padded);
    expect(s.checks.find((c) => c.name.includes("sin relleno"))?.pass).toBe(false);
  });

  it("caso sano: 0 hallazgos es válido si el mínimo es 0", () => {
    const healthy: GoldenCase = {
      ...GOLDEN,
      id: "todo-sano",
      expect: { minFindings: 0, maxFindings: 1, mustContain: [] },
    };
    const s = scoreTriageOutput(healthy, { vulnerabilities: [] });
    expect(s.score).toBe(100);
  });
});
