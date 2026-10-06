/**
 * mapping.test.ts — registro de tácticas y cobertura (tanda 3 · B4).
 *
 * El heatmap de /mitre-coverage se juega la credibilidad aquí: si el registro
 * declara 13 tácticas mientras la página anuncia 14, o si oculta las tácticas
 * sin herramientas, la página parece más completa de lo que es.
 */

import { describe, it, expect } from "vitest";
import { MITRE_TACTICS, getMitreCoverage, getToolsByTactic } from "./mapping";
import { MITRE_MAPPING } from "@/shared/data/mitre-mapping";

describe("MITRE_TACTICS — el registro completo de la matriz Enterprise", () => {
  it("son las 14 tácticas, sin duplicados", () => {
    expect(MITRE_TACTICS).toHaveLength(14);
    expect(new Set(MITRE_TACTICS.map((t) => t.id)).size).toBe(14);
    expect(new Set(MITRE_TACTICS.map((t) => t.name)).size).toBe(14);
  });

  it("incluye Exfiltration (TA0010), que faltaba pese a anunciarse", () => {
    const exfil = MITRE_TACTICS.find((t) => t.name === "Exfiltration");
    expect(exfil?.id).toBe("TA0010");
  });

  it("los IDs de táctica usan el formato TA00NN", () => {
    for (const t of MITRE_TACTICS) expect(t.id).toMatch(/^TA\d{4}$/);
  });
});

describe("getMitreCoverage — honestidad del heatmap", () => {
  const coverage = getMitreCoverage();

  it("reporta el tamaño del framework aparte del alcanzado", () => {
    expect(coverage.frameworkTactics).toBe(14);
    expect(coverage.totalTactics).toBeLessThanOrEqual(14);
    expect(coverage.totalTactics).toBeGreaterThan(0);
  });

  it("devuelve una fila por cada táctica, incluidas las no cubiertas", () => {
    expect(coverage.tacticCoverage).toHaveLength(14);
    expect(coverage.tacticCoverage.filter((t) => !t.covered).length).toBeGreaterThan(0);
  });

  it("tacticCoverage y uncoveredTactics coinciden entre sí", () => {
    const fromCoverage = coverage.tacticCoverage.filter((t) => !t.covered).map((t) => t.tactic.name);
    expect([...fromCoverage].sort()).toEqual([...coverage.uncoveredTactics].sort());
  });

  it("toda táctica cubierta tiene al menos una herramienta y una técnica", () => {
    for (const row of coverage.tacticCoverage) {
      if (!row.covered) {
        expect(row.toolCount).toBe(0);
        expect(row.techniqueCount).toBe(0);
      } else {
        expect(row.toolCount).toBeGreaterThan(0);
        expect(row.techniqueCount).toBeGreaterThan(0);
        expect(row.techniqueCount).toBeLessThanOrEqual(row.toolCount);
      }
    }
  });

  it("la herramienta por táctica coincide con getToolsByTactic", () => {
    for (const row of coverage.tacticCoverage) {
      expect(getToolsByTactic(row.tactic.name)).toHaveLength(row.toolCount);
    }
  });

  it("ninguna herramienta del mapeo queda fuera de las 14 tácticas", () => {
    const known = new Set(MITRE_TACTICS.map((t) => t.name));
    for (const techniques of Object.values(MITRE_MAPPING)) {
      for (const tech of techniques) expect(known.has(tech.tactic)).toBe(true);
    }
  });

  it("cuenta las técnicas únicas del framework compartido", () => {
    const unique = new Set<string>();
    for (const techniques of Object.values(MITRE_MAPPING)) {
      for (const tech of techniques) unique.add(tech.id);
    }
    expect(coverage.totalTechniques).toBe(unique.size);
    expect(coverage.totalTools).toBe(Object.keys(MITRE_MAPPING).length);
  });
});

describe("getToolsByTactic", () => {
  it("devuelve [] para una táctica sin herramientas (no lanza)", () => {
    expect(getToolsByTactic("Impact")).toEqual([]);
    expect(getToolsByTactic("Táctica Inventada")).toEqual([]);
  });

  it("devuelve herramientas reales del mapeo", () => {
    for (const toolId of getToolsByTactic("Discovery")) {
      expect(MITRE_MAPPING[toolId]?.some((t) => t.tactic === "Discovery")).toBe(true);
    }
  });
});