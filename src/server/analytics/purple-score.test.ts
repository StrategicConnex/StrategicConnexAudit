import { describe, it, expect } from "vitest";
import {
  computePurpleScore,
  computePurpleTrend,
  tacticCoverage,
  type TechniqueResultRow,
  type AdversaryRunRow,
} from "./purple-score";

const tech = (
  mitreId: string,
  verdict: TechniqueResultRow["verdict"],
  tactic = "Reconnaissance"
): TechniqueResultRow => ({ mitreId, tactic, techniqueName: mitreId, verdict });

const run = (
  result: AdversaryRunRow["result"],
  mitreId: string | null = null
): AdversaryRunRow => ({ result, mitreId, scenarioId: null });

describe("computePurpleScore — exposición agregada", () => {
  it("sin datos devuelve null en vez de 0 (no inventar un score)", () => {
    const report = computePurpleScore([]);
    expect(report.detectionScore).toBeNull();
    expect(report.missRate).toBeNull();
    expect(report.evaluated).toBe(0);
    expect(report.byTechnique).toEqual([]);
    expect(report.blindSpots).toEqual([]);
  });

  it("calcula exposición sobre los veredictos comparables", () => {
    const report = computePurpleScore([
      tech("T1190", "exposed"),
      tech("T1190", "exposed"),
      tech("T1190", "not_exposed"),
      tech("T1566", "not_exposed"),
    ]);
    expect(report.evaluated).toBe(4);
    expect(report.exposed).toBe(2);
    expect(report.protected).toBe(2);
    expect(report.detectionScore).toBe(50);
  });

  it("excluye not_externally_testable y error del denominador", () => {
    const report = computePurpleScore([
      tech("T1003", "not_externally_testable"),
      tech("T1490", "not_externally_testable"),
      tech("T1190", "exposed"),
      tech("T1190", "error"),
    ]);
    // Solo 1 veredicto comparable: 100% de exposición, no 25%.
    expect(report.evaluated).toBe(1);
    expect(report.detectionScore).toBe(100);
    expect(report.manualOnly).toBe(2);
    expect(report.errors).toBe(1);
  });

  it("una técnica solo con errores tiene exposureRate null, no 0", () => {
    const report = computePurpleScore([tech("T1190", "error"), tech("T1190", "error")]);
    expect(report.byTechnique[0]!.exposureRate).toBeNull();
    expect(report.detectionScore).toBeNull();
  });

  it("redondea a un decimal estable", () => {
    const rows = [
      tech("T1", "exposed"),
      tech("T2", "exposed"),
      tech("T3", "exposed"),
      ...Array.from({ length: 7 }, () => tech("T4", "not_exposed")),
    ];
    expect(computePurpleScore(rows).detectionScore).toBe(30);
  });

  it("ordena por exposición descendente y luego por ID", () => {
    const report = computePurpleScore([
      tech("T1000", "not_exposed"),
      tech("T2000", "exposed"),
      tech("T3000", "exposed", "Discovery"),
    ]);
    expect(report.byTechnique.map((r) => r.mitreId)).toEqual(["T2000", "T3000", "T1000"]);
  });

  it("rechaza veredictos desconocidos en vez de contarlos como algo", () => {
    // @ts-expect-error — forzamos un valor que la DB no debería traer.
    const report = computePurpleScore([tech("T1190", "inventado")]);
    expect(report.evaluated).toBe(0);
    expect(report.detectionScore).toBeNull();
  });
});

describe("computePurpleScore — simulacros del adversario", () => {
  it("missRate mide lo que escapó, no lo que se detectó", () => {
    const report = computePurpleScore([tech("T1190", "exposed")], [
      run("detected", "T1190"),
      run("detected", "T1190"),
      run("missed", "T1190"),
    ]);
    expect(report.runs).toBe(3);
    expect(report.detected).toBe(2);
    expect(report.missed).toBe(1);
    expect(report.missRate).toBe(33.3);
  });

  it("los runs con error no cuentan como escapados", () => {
    const report = computePurpleScore([], [run("error", "T1190")]);
    expect(report.runErrors).toBe(1);
    expect(report.missRate).toBeNull();
  });

  it("sin runs, missRate es null y no 0%", () => {
    expect(computePurpleScore([tech("T1", "exposed")]).missRate).toBeNull();
  });
});

describe("computePurpleScore — puntos ciegos", () => {
  it("marca la técnica expuesta que ninguna ejecución del adversario probó", () => {
    const report = computePurpleScore([tech("T1190", "exposed"), tech("T1566", "exposed")], [
      run("missed", "T1566"),
    ]);
    expect(report.blindSpots).toEqual(["T1190"]);
  });

  it("un run con error no cierra el punto ciego (no probó nada)", () => {
    const report = computePurpleScore([tech("T1190", "exposed")], [run("error", "T1190")]);
    expect(report.blindSpots).toEqual(["T1190"]);
  });

  it("una técnica protegida y probada no es punto ciego", () => {
    const report = computePurpleScore([tech("T1566", "not_exposed")], [run("detected", "T1566")]);
    expect(report.blindSpots).toEqual([]);
  });
});

describe("computePurpleTrend", () => {
  const withScore = (score: number) =>
    computePurpleScore([
      ...Array.from({ length: score / 10 }, () => tech("T1", "exposed")),
      ...Array.from({ length: 10 - score / 10 }, () => tech("T1", "not_exposed")),
    ]);

  it("sube, baja y plano según el delta", () => {
    expect(computePurpleTrend(withScore(30), withScore(10)).direction).toBe("up");
    expect(computePurpleTrend(withScore(10), withScore(30)).direction).toBe("down");
    expect(computePurpleTrend(withScore(50), withScore(50)).direction).toBe("flat");
  });

  it("sin datos previos marca 'unknown', no delta 0", () => {
    const trend = computePurpleTrend(withScore(40), computePurpleScore([]));
    expect(trend.hasPreviousData).toBe(false);
    expect(trend.deltaPoints).toBeNull();
    expect(trend.direction).toBe("unknown");
  });

  it("delta en puntos, no porcentaje relativo", () => {
    expect(computePurpleTrend(withScore(80), withScore(60)).deltaPoints).toBe(20);
  });
});

describe("tacticCoverage", () => {
  it("devuelve una fila por cada táctica del framework, incluso vacía", () => {
    const report = computePurpleScore([tech("T1190", "exposed", "Initial Access")]);
    const rows = tacticCoverage(report, ["Initial Access", "Impact", "Execution"]);
    expect(rows).toHaveLength(3);
    expect(rows[0]).toEqual({ tactic: "Initial Access", techniques: 1, exposed: 1, protected: 0 });
    expect(rows[1]).toEqual({ tactic: "Impact", techniques: 0, exposed: 0, protected: 0 });
  });
});