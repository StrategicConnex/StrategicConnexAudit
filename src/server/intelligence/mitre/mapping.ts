/**
 * mitre/mapping.ts — MITRE ATT&CK Mapping (Server-side)
 *
 * Re-exporta todo desde el módulo compartido `@/shared/data/mitre-mapping`
 * para mantener compatibilidad con importaciones existentes.
 *
 * Funciones adicionales server-only:
 *   - getToolsByTactic()
 *   - getMitreCoverage()
 *   - MITRE_TACTICS
 */

export type { MitreTechnique } from "@/shared/data/mitre-mapping";
export {
  MITRE_MAPPING,
  getMitreTechniques,
  getPrimaryMitreTechnique,
  findTechnique,
  detectTechniqueByTitle,
} from "@/shared/data/mitre-mapping";

import { MITRE_MAPPING } from "@/shared/data/mitre-mapping";

export interface MitreTactic {
  id: string;
  name: string;
  shortName: string;
}

export const MITRE_TACTICS: MitreTactic[] = [
  { id: "TA0043", name: "Reconnaissance", shortName: "RECON" },
  { id: "TA0042", name: "Resource Development", shortName: "RES-DEV" },
  { id: "TA0001", name: "Initial Access", shortName: "INIT" },
  { id: "TA0002", name: "Execution", shortName: "EXEC" },
  { id: "TA0003", name: "Persistence", shortName: "PERSIST" },
  { id: "TA0004", name: "Privilege Escalation", shortName: "PRIV-ESC" },
  { id: "TA0005", name: "Defense Evasion", shortName: "DEF-EVASION" },
  { id: "TA0006", name: "Credential Access", shortName: "CRED" },
  { id: "TA0007", name: "Discovery", shortName: "DISCOVERY" },
  { id: "TA0008", name: "Lateral Movement", shortName: "LATERAL" },
  { id: "TA0009", name: "Collection", shortName: "COLLECT" },
  { id: "TA0011", name: "Command and Control", shortName: "C2" },
  { id: "TA0040", name: "Impact", shortName: "IMPACT" },
];

/** Encuentra herramientas que pertenecen a una táctica MITRE específica */
export function getToolsByTactic(tactic: string): string[] {
  const tools: string[] = [];
  for (const [toolId, techniques] of Object.entries(MITRE_MAPPING)) {
    if (techniques.some((t) => t.tactic === tactic)) {
      tools.push(toolId);
    }
  }
  return tools;
}

/** Devuelve un resumen de cobertura MITRE */
export function getMitreCoverage() {
  const uniqueTechs = new Set<string>();
  const uniqueTactics = new Set<string>();
  const toolsPerTactic: Record<string, number> = {};

  for (const [, techniques] of Object.entries(MITRE_MAPPING)) {
    for (const technique of techniques) {
      uniqueTechs.add(technique.id);
      uniqueTactics.add(technique.tactic);
      toolsPerTactic[technique.tactic] = (toolsPerTactic[technique.tactic] || 0) + 1;
    }
  }

  return {
    totalTechniques: uniqueTechs.size,
    totalTactics: uniqueTactics.size,
    totalTools: Object.keys(MITRE_MAPPING).length,
    toolsPerTactic,
  };
}
