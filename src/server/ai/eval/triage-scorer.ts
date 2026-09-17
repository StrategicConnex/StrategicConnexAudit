import type { AnalyzedVulnerability } from "../../intelligence/adversary/assessment/ai-analyst";

/**
 * triage-scorer.ts — Eval harness del triage (P2-2).
 *
 * `scoreTriageOutput()` es puro y determinista: valida forma, rangos y
 * expectativas del caso dorado. Lo usa el CI (triage-scorer.test.ts) y el
 * runner manual `src/scripts/ai-eval-triage.ts` (modelos en vivo).
 */

export interface GoldenCase {
  id: string;
  /** Evidencia compacta tal como la vería el prompt de triage. */
  evidence: Record<string, unknown>;
  expect: {
    minFindings: number;
    maxFindings?: number;
    /** Cadenas que DEBEN aparecer (insensible a mayúsculas) en el output. */
    mustContain: string[];
    /** Severidades que NO pueden faltar entre los hallazgos. */
    mustIncludeSeverity?: Array<"info" | "low" | "medium" | "high" | "critical">;
  };
}

export interface ScoreCheck {
  name: string;
  pass: boolean;
  detail?: string;
}

export interface TriageScore {
  caseId: string;
  score: number; // 0-100
  checks: ScoreCheck[];
}

const SEVERITIES = ["info", "low", "medium", "high", "critical"] as const;

export function scoreTriageOutput(
  golden: GoldenCase,
  output: { vulnerabilities?: unknown }
): TriageScore {
  const checks: ScoreCheck[] = [];
  const vulns = Array.isArray(output?.vulnerabilities)
    ? (output.vulnerabilities as AnalyzedVulnerability[])
    : [];
  checks.push({
    name: "forma: vulnerabilities es array",
    pass: Array.isArray(output?.vulnerabilities),
  });
  checks.push({
    name: `conteo >= ${golden.expect.minFindings}`,
    pass: vulns.length >= golden.expect.minFindings,
    detail: `hallados=${vulns.length}`,
  });
  if (golden.expect.maxFindings !== undefined) {
    checks.push({
      name: `conteo <= ${golden.expect.maxFindings} (sin relleno)`,
      pass: vulns.length <= golden.expect.maxFindings,
      detail: `hallados=${vulns.length}`,
    });
  }

  const blob = JSON.stringify(vulns).toLowerCase();
  for (const needle of golden.expect.mustContain) {
    checks.push({
      name: `contiene "${needle}"`,
      pass: blob.includes(needle.toLowerCase()),
    });
  }

  for (const sev of golden.expect.mustIncludeSeverity ?? []) {
    checks.push({
      name: `severidad presente: ${sev}`,
      pass: vulns.some((v) => v.severity === sev),
    });
  }

  // Validez por hallazgo: forma, rangos y remediation accionable.
  let validCount = 0;
  for (const v of vulns) {
    const okShape =
      typeof v.title === "string" &&
      v.title.length > 0 &&
      SEVERITIES.includes(v.severity) &&
      typeof v.cvssScore === "number" &&
      v.cvssScore >= 0 &&
      v.cvssScore <= 10 &&
      typeof v.description === "string" &&
      v.description.length > 0 &&
      Array.isArray(v.remediation) &&
      v.remediation.length > 0;
    const okCwe =
      v.cweId === null ||
      v.cweId === undefined ||
      /^CWE-\d{1,4}$/.test(v.cweId);
    const okConf =
      v.confidence === undefined ||
      (typeof v.confidence === "number" && v.confidence >= 0 && v.confidence <= 1);
    if (okShape && okCwe && okConf) validCount++;
  }
  checks.push({
    name: "hallazgos válidos (forma+rango+remediation)",
    pass: vulns.length === 0 ? golden.expect.minFindings === 0 : validCount === vulns.length,
    detail: `${validCount}/${vulns.length}`,
  });

  const passed = checks.filter((c) => c.pass).length;
  return {
    caseId: golden.id,
    score: checks.length === 0 ? 0 : Math.round((passed / checks.length) * 100),
    checks,
  };
}
