import { Finding, Severity } from "../types/executor.types";

const SEVERITY_WEIGHTS: Record<Severity, number> = {
  info: 0,
  low: 10,
  medium: 25,
  high: 50,
  critical: 80,
};

export interface RiskResult {
  score: number;
  deductions: Array<{ title: string; penalty: number }>;
  aggregatedFindings: Finding[];
}

/**
 * Normaliza y clasifica hallazgos correlacionados para evitar ruido redundante
 * y consolidar el perfil de vulnerabilidad global.
 */
export function correlateFindings(findings: Finding[]): Finding[] {
  const hasNoSpf = findings.some(f => 
    f.title.toLowerCase().includes("spf inexistente") || 
    f.title.toLowerCase().includes("sin registro spf") ||
    f.title.toLowerCase().includes("falta registro de protección de correo spf")
  );
  const hasNoDmarc = findings.some(f => 
    f.title.toLowerCase().includes("dmarc inexistente") || 
    f.title.toLowerCase().includes("sin registro dmarc") ||
    f.title.toLowerCase().includes("falta registro de alineación de políticas dmarc")
  );

  const correlated = [...findings];

  if (hasNoSpf && hasNoDmarc) {
    // Evitar añadir duplicado
    if (!correlated.some(f => f.title.includes("Ausencia Combinada de Protocolos"))) {
      correlated.push({
        toolId: "email.dmarc",
        category: "security",
        severity: "critical",
        confidence: "1.000",
        title: "Ausencia Combinada de Protocolos Antifraude de Correo (SPF + DMARC)",
        description: "El dominio objetivo carece de protección SPF y DMARC de forma simultánea. Esto permite a atacantes realizar campañas de phishing o suplantación de identidad (spoofing) inmediatas simulando ser el dominio corporativo.",
        remediation: "Es prioritario configurar un registro SPF estricto e iniciar la adopción de una política DMARC (iniciando con p=none hasta p=reject) para proteger la reputación de la organización.",
        evidence: { spfMissing: true, dmarcMissing: true },
        scoreImpact: 50
      });
    }
  }

  return correlated;
}

/**
 * Calcula el índice de riesgo de seguridad normalizado de 0 a 100
 * basado en los hallazgos técnicos registrados y correlacionados.
 */
export function calculateRiskScore(findings: Finding[]): RiskResult {
  // 1. Correlacionar hallazgos primero
  const aggregatedFindings = correlateFindings(findings);

  const activeFindings = aggregatedFindings.filter(f => f.severity !== "info");
  const N = activeFindings.length;

  if (N === 0) {
    return {
      score: 100,
      deductions: [],
      aggregatedFindings
    };
  }

  let totalPenalties = 0;
  const deductions: Array<{ title: string; penalty: number }> = [];

  for (const finding of activeFindings) {
    const weight = SEVERITY_WEIGHTS[finding.severity] ?? 0;
    const confidence = Number(finding.confidence) || 0.7;
    const penalty = weight * confidence;
    totalPenalties += penalty;

    deductions.push({
      title: finding.title,
      penalty: Math.round(penalty)
    });
  }

  // Fórmula premium: Penalización ponderada atenuada por la raíz de N
  const calculatedPenalty = totalPenalties / Math.sqrt(N);
  const baseScore = 100 - calculatedPenalty;

  // Ajustes de mitigación y límites estrictos [0, 100]
  const score = Math.max(0, Math.min(100, Math.round(baseScore)));

  return {
    score,
    deductions,
    aggregatedFindings
  };
}
