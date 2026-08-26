/**
 * checks-map.ts — Mapeo de técnicas MITRE del catálogo a pruebas reales.
 *
 * Cada escenario del catálogo (catalog.ts) se resuelve contra checks
 * automatizados NO destructivos. Las técnicas sin prueba externa posible
 * se marcan notExternallyTestable → el agente AI genera playbook manual.
 *
 * El veredicto inicial es mecánico (por hallazgos de los checks); el agente
 * AI lo refina con contexto y genera remediation/playbook.
 */

import type { CheckDefinition } from "../assessment/types";
import { ADVERSARY_CATALOG, type AdversaryScenarioDefinition } from "../catalog";
import {
  ASSESSMENT_CATALOG,
} from "../assessment/assessment-runner";
import {
  emailSpoofingCheck,
  defaultAdminPanelsCheck,
  cloudStoragePublicCheck,
} from "../assessment/checks/mitre-checks";

/** Catálogo completo disponible para evaluación MITRE. */
export const MITRE_CHECK_POOL: CheckDefinition[] = [
  ...ASSESSMENT_CATALOG,
  emailSpoofingCheck,
  defaultAdminPanelsCheck,
  cloudStoragePublicCheck,
];

const CHECKS_BY_ID = new Map(MITRE_CHECK_POOL.map((c) => [c.id, c]));

export interface MitreTechniquePlan {
  scenario: AdversaryScenarioDefinition;
  /** Checks automatizados que evidencian esta técnica. */
  checkIds: string[];
  /** Sin prueba externa posible → el agente AI genera playbook manual. */
  notExternallyTestable: boolean;
}

const MANUAL_ONLY_TECHNIQUES = new Set([
  "T1059.001", // PowerShell bypass — requiere host Windows interno
  "T1110.001", // Password spray — intrusivo por diseño, fuera del alcance no destructivo
  "T1557.001", // LLMNR poisoning — red interna
  "T1003.001", // LSASS — host interno
  "T1490",     // Backup deletion — destructivo por definición; solo playbook
]);

// Mapa mitreId → check ids relevantes (los demás checks del pool no aplican)
const RELEVANT_CHECKS: Record<string, string[]> = {
  "T1078.001": ["default-admin-panels"],                    // Default accounts / paneles admin
  "T1190": ["sqli-error", "xss-reflection", "path-traversal", "open-redirect", "tech-fingerprint"], // Exploit public-facing
  "T1566.001": ["email-spoofing"],                          // Phishing → suplantación real via DNS
  "T1505.003": ["sensitive-files", "directory-listing"],    // Web shell → upload/listing expuestos
  "T1021.001": [],                                          // RDP → port scan dinámico abajo
  "T1046": [],                                              // Port scan → dinámico abajo
  "T1530": ["cloud-storage-public"],                        // Cloud storage
};

export function buildMitrePlans(): MitreTechniquePlan[] {
  return ADVERSARY_CATALOG.map((scenario) => {
    if (MANUAL_ONLY_TECHNIQUES.has(scenario.mitreId)) {
      return { scenario, checkIds: [], notExternallyTestable: true };
    }

    let checkIds = [...(RELEVANT_CHECKS[scenario.mitreId] ?? [])];

    // Port-based techniques: resolver dinámicamente contra los checks del pool
    if (scenario.mitreId === "T1046") checkIds = ["tech-fingerprint"]; // + probe TCP dedicado en el runner
    if (scenario.mitreId === "T1021.001") checkIds = []; // el runner hace tcpProbe directo a 3389

    // Validar que todos existen en el pool
    const valid = checkIds.filter((id) => CHECKS_BY_ID.has(id));
    return { scenario, checkIds: valid, notExternallyTestable: false };
  });
}

export function getCheckById(id: string): CheckDefinition | undefined {
  return CHECKS_BY_ID.get(id);
}
