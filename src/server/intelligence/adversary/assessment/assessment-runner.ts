/**
 * assessment-runner.ts — Orquestador de la Evaluación Real de Adversarios.
 *
 * Ejecuta todos los checks NO destructivos contra el dominio autorizado del
 * proyecto, con:
 *   · egress-guard obligatorio (safeFetch — bloqueo SSRF)
 *   · rate-limit por dominio (DELAY_BETWEEN_REQUESTS_MS entre checks)
 *   · timeout estricto por check
 *   · agregación de evidencia estructurada para el analista AI
 *
 * El resultado (AssessmentEvidence) es la entrada del agente AI en
 * ai-analyst.ts. Este runner NO clasifica: solo produce evidencia real.
 */

import { assertPublicHostname, safeFetch } from "../../security/egress-guard";
import { extractTargetHost } from "../sandbox-executor";
import type { AssessmentEvidence, CheckContext, CheckDefinition, CheckResult } from "./types";
import { tlsCertificateCheck } from "./checks/tls";
import { securityHeadersCheck, cookieFlagsCheck } from "./checks/headers";
import { sensitiveFilesCheck, directoryListingCheck } from "./checks/exposure";
import {
  sqliErrorCheck,
  xssReflectionCheck,
  pathTraversalCheck,
  openRedirectCheck,
  httpMethodsCheck,
  corsMisconfigCheck,
} from "./checks/webconfig";
import {
  techFingerprintCheck,
  insecureContentCheck,
  emailExposureCheck,
} from "./checks/fingerprint";

export const ASSESSMENT_CATALOG: CheckDefinition[] = [
  tlsCertificateCheck,
  securityHeadersCheck,
  cookieFlagsCheck,
  sensitiveFilesCheck,
  directoryListingCheck,
  techFingerprintCheck,
  insecureContentCheck,
  emailExposureCheck,
  sqliErrorCheck,
  xssReflectionCheck,
  pathTraversalCheck,
  openRedirectCheck,
  httpMethodsCheck,
  corsMisconfigCheck,
];

const DELAY_BETWEEN_CHECKS_MS = 150;
const CHECK_TIMEOUT_MS = 10_000;

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export interface RunAssessmentOptions {
  /** Dominio o URL objetivo (del proyecto). */
  target: string;
  /** Inyectable para tests deterministas. */
  catalog?: CheckDefinition[];
  /** Progreso en vivo: se invoca tras cada check completado. */
  onProgress?: (info: { done: number; total: number; currentStep: string }) => Promise<void> | void;
}

export async function runRealAssessment(
  options: RunAssessmentOptions
): Promise<{ success: boolean; evidence?: AssessmentEvidence; error?: string }> {
  const startedAt = new Date();
  const host = extractTargetHost(options.target);
  if (!host) {
    return { success: false, error: "Target inválido o vacío." };
  }

  // Barrera de seguridad SSRF: el dominio debe resolver a IPs públicas.
  try {
    await assertPublicHostname(host);
  } catch (err) {
    return {
      success: false,
      error: `EgressGuard: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  const ctx: CheckContext = {
    host,
    origin: `https://${host}`,
    fetch: safeFetch,
    timeoutMs: CHECK_TIMEOUT_MS,
  };

  const catalog = options.catalog ?? ASSESSMENT_CATALOG;
  const results: CheckResult[] = [];
  const total = catalog.length;

  for (let i = 0; i < catalog.length; i++) {
    const check = catalog[i]!;
    // Progreso ANTES de ejecutar: la UI muestra el check en curso
    await options.onProgress?.({ done: i, total, currentStep: check.name });
    if (i > 0) await delay(DELAY_BETWEEN_CHECKS_MS);
    try {
      const result = await Promise.race([
        check.run(ctx),
        delay(CHECK_TIMEOUT_MS + 2_000).then(
          (): CheckResult => ({
            id: check.id,
            name: check.name,
            status: "error",
            summary: "Check abortado por timeout global.",
            evidence: {},
          })
        ),
      ]);
      results.push(result);
    } catch (err) {
      results.push({
        id: check.id,
        name: check.name,
        status: "error",
        summary: `Excepción: ${err instanceof Error ? err.message : String(err)}`,
        evidence: {},
      });
    }
  }

  await options.onProgress?.({ done: total, total, currentStep: "análisis AI" });

  return {
    success: true,
    evidence: {
      target: host,
      startedAt: startedAt.toISOString(),
      completedAt: new Date().toISOString(),
      durationMs: Date.now() - startedAt.getTime(),
      checks: results,
    },
  };
}
