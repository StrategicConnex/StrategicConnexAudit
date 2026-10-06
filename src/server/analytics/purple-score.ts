/**
 * purple-score.ts — Purple Team: detección vs ejecución (B5).
 *
 * MITRE ya separa "lo que el producto puede hacer" de "lo que el adversario
 * ejecuta". `mitre_evaluations` registra el veredicto por técnica
 * (expuesto / protegido / no testeable externamente / error) y
 * `adversary_runs` registra si el simulacro fue detectado o pasó desapercibido
 * (detected / missed / error). La pregunta de un CISO no es "¿cuántas técnicas
 * evaluaste?" sino "¿de las que el atacante podría ejecutar, cuántas ve el
 * producto?" — eso es lo que calcula este módulo.
 *
 * Todo es PURO: recibe filas planas y devuelve el informe. La carga desde
 * Postgres vive en queries.ts y la ruta HTTP solo orquesta. Así la aritmética
 * —que es donde se cuelan los números optimistas— es testeable sin base de datos.
 */

/** Veredictos de `mitre_technique_results.verdict`. */
export type MitreVerdict = "exposed" | "not_exposed" | "not_externally_testable" | "error";

/** Resultados de `adversary_runs.result`. */
export type AdversaryOutcome = "detected" | "missed" | "error";

export interface TechniqueResultRow {
  mitreId: string;
  tactic: string;
  techniqueName: string;
  verdict: MitreVerdict;
  confidence?: string | number | null;
}

export interface AdversaryRunRow {
  scenarioId?: string | null;
  mitreId?: string | null;
  tactic?: string | null;
  result: AdversaryOutcome;
  detectedBy?: string | null;
}

/** Fila agregada por técnica dentro de una ventana temporal. */
export interface TechniqueBreakdown {
  mitreId: string;
  tactic: string;
  techniqueName: string;
  exposed: number;
  protected: number;
  /** Sin prueba externa posible → el score NO debe contarlo como cobertura. */
  manualOnly: number;
  errors: number;
  /** exposed / (exposed + protected) en %, o null si no hay evidencia comparable. */
  exposureRate: number | null;
}

export interface PurpleScoreReport {
  /** % de técnicas donde el adversario tuvo foothold; null sin evidencia. */
  detectionScore: number | null;
  /** % de intentos del simulacro que escaparon a la detección. */
  missRate: number | null;
  evaluated: number;
  exposed: number;
  protected: number;
  manualOnly: number;
  errors: number;
  runs: number;
  detected: number;
  missed: number;
  runErrors: number;
  byTechnique: TechniqueBreakdown[];
  /** Técnicas con exposición y cero executions que lo confirmen. */
  blindSpots: string[];
}

function pct(numerator: number, denominator: number): number | null {
  if (denominator <= 0) return null;
  return Math.round((numerator / denominator) * 1000) / 10;
}

/**
 * Un solo veredicto de una sola ejecución no es una tasa: se cuenta por
 * técnica y solo se promedian las que tienen comparables (expuesto o
 * protegido). `not_externally_testable` y `error` quedan fuera del
 * denominador en vez de contarse como "protegido", que es como un tablero
 * inflaría artificialmente el número.
 */
export function computePurpleScore(
  techniqueResults: TechniqueResultRow[],
  adversaryRuns: AdversaryRunRow[] = []
): PurpleScoreReport {
  const byTechnique = new Map<string, TechniqueBreakdown>();

  for (const row of techniqueResults) {
    let entry = byTechnique.get(row.mitreId);
    if (!entry) {
      entry = {
        mitreId: row.mitreId,
        tactic: row.tactic,
        techniqueName: row.techniqueName,
        exposed: 0,
        protected: 0,
        manualOnly: 0,
        errors: 0,
        exposureRate: null,
      };
      byTechnique.set(row.mitreId, entry);
    }
    switch (row.verdict) {
      case "exposed":
        entry.exposed += 1;
        break;
      case "not_exposed":
        entry.protected += 1;
        break;
      case "not_externally_testable":
        entry.manualOnly += 1;
        break;
      case "error":
        entry.errors += 1;
        break;
    }
  }

  const rows = Array.from(byTechnique.values());
  for (const row of rows) {
    row.exposureRate = pct(row.exposed, row.exposed + row.protected);
  }
  // Brechas primero: lo que el atacante podría ejecutar y nadie miró.
  rows.sort((a, b) => (b.exposureRate ?? -1) - (a.exposureRate ?? -1) || a.mitreId.localeCompare(b.mitreId));

  // `protected` es palabra reservada en modo estricto: no puede ser `const`.
  const exposedCount = rows.reduce((sum, r) => sum + r.exposed, 0);
  const protectedCount = rows.reduce((sum, r) => sum + r.protected, 0);
  const manualOnly = rows.reduce((sum, r) => sum + r.manualOnly, 0);
  const errors = rows.reduce((sum, r) => sum + r.errors, 0);
  const evaluated = rows.reduce((sum, r) => sum + r.exposed + r.protected, 0);

  const detected = adversaryRuns.filter((r) => r.result === "detected").length;
  const missed = adversaryRuns.filter((r) => r.result === "missed").length;
  const runErrors = adversaryRuns.filter((r) => r.result === "error").length;

  // Punto ciego: exposición medida y ninguna ejecución del adversario que la
  // confirme (ni detected ni missed). No es "0 brechas" — es "nunca probada".
  const testedIds = new Set(
    adversaryRuns
      .filter((r) => r.result !== "error")
      .map((r) => r.mitreId)
      .filter((id): id is string => Boolean(id))
  );
  const blindSpots = rows
    .filter((r) => r.exposed > 0 && !testedIds.has(r.mitreId))
    .map((r) => r.mitreId);

  return {
    detectionScore: pct(exposedCount, evaluated),
    missRate: pct(missed, detected + missed),
    evaluated,
    exposed: exposedCount,
    protected: protectedCount,
    manualOnly,
    errors,
    runs: adversaryRuns.length,
    detected,
    missed,
    runErrors,
    byTechnique: rows,
    blindSpots,
  };
}

export interface PurpleScoreTrend {
  /** Ventana actual y anterior, ya con sus Reports. */
  current: PurpleScoreReport;
  previous: PurpleScoreReport;
  /** Puntos de variación del score de detección, o null si falta una de las ventanas. */
  deltaPoints: number | null;
  direction: "up" | "down" | "flat" | "unknown";
  hasPreviousData: boolean;
}

/**
 * Comparativa entre dos ventanas. "Subimos 12%" sin ventana previa es una
 * mentira: `deltaPoints` es null y la UI dice "sin histórico", no 0.
 */
export function computePurpleTrend(current: PurpleScoreReport, previous: PurpleScoreReport): PurpleScoreTrend {
  const hasPreviousData = previous.evaluated > 0;
  const deltaPoints =
    current.detectionScore === null || previous.detectionScore === null
      ? null
      : Math.round((current.detectionScore - previous.detectionScore) * 10) / 10;

  let direction: PurpleScoreTrend["direction"] = "unknown";
  if (deltaPoints !== null) {
    if (deltaPoints > 0) direction = "up";
    else if (deltaPoints < 0) direction = "down";
    else direction = "flat";
  }

  return { current, previous, deltaPoints, direction, hasPreviousData };
}

/** Cobertura agregada por táctica: qué parte del framework se ha mirado. */
export function tacticCoverage(
  report: PurpleScoreReport,
  frameworkTactics: string[]
): Array<{ tactic: string; techniques: number; exposed: number; protected: number }> {
  return frameworkTactics.map((tactic) => {
    const rows = report.byTechnique.filter((r) => r.tactic === tactic);
    return {
      tactic,
      techniques: rows.length,
      exposed: rows.reduce((sum, r) => sum + r.exposed, 0),
      protected: rows.reduce((sum, r) => sum + r.protected, 0),
    };
  });
}