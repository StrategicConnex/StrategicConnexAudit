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

/**
 * Las 14 tácticas de MITRE ATT&CK Enterprise.
 *
 * Antes eran 13: faltaba Exfiltration (TA0010), pese a que /mitre-coverage
 * ya anunciaba "De 14 tácticas en la matriz Enterprise". El número del pie
 * era correcto; el registro estaba incompleto. Las tácticas que ninguna
 * herramienta cubre siguen listadas aquí — `getMitreCoverage` las reporta con
 * 0 herramientas en vez de ocultarlas, para que el hueco sea visible.
 */
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
  { id: "TA0010", name: "Exfiltration", shortName: "EXFIL" },
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

export interface TacticCoverage {
  tactic: MitreTactic;
  toolCount: number;
  techniqueCount: number;
  covered: boolean;
}

export interface MitreCoverage {
  totalTechniques: number;
  /** Tácticas de MITRE_TACTICS con al menos una herramienta (13 sobre 14 hoy). */
  totalTactics: number;
  /** Tácticas del framework, no las cubiertas. */
  frameworkTactics: number;
  totalTools: number;
  toolsPerTactic: Record<string, number>;
  /** Una entrada por cada táctica del framework, incluidas las vacías. */
  tacticCoverage: TacticCoverage[];
  /** Nombres de las tácticas sin ninguna herramienta mapeada. */
  uncoveredTactics: string[];
}

/** Devuelve un resumen de cobertura MITRE */
export function getMitreCoverage(): MitreCoverage {
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

  const tacticCoverage: TacticCoverage[] = MITRE_TACTICS.map((tactic) => {
    const toolCount = toolsPerTactic[tactic.name] ?? 0;
    const techniqueIds = new Set<string>();
    for (const toolId of getToolsByTactic(tactic.name)) {
      for (const tech of MITRE_MAPPING[toolId] ?? []) {
        if (tech.tactic === tactic.name) techniqueIds.add(tech.id);
      }
    }
    return {
      tactic,
      toolCount,
      techniqueCount: techniqueIds.size,
      covered: toolCount > 0,
    };
  });

  return {
    totalTechniques: uniqueTechs.size,
    totalTactics: uniqueTactics.size,
    frameworkTactics: MITRE_TACTICS.length,
    totalTools: Object.keys(MITRE_MAPPING).length,
    toolsPerTactic,
    tacticCoverage,
    uncoveredTactics: tacticCoverage.filter((t) => !t.covered).map((t) => t.tactic.name),
  };
}