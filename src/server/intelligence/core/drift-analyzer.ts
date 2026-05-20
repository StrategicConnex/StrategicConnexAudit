/**
 * Motor de análisis de deriva (Baseline Drift).
 * Compara configuraciones históricas de hallazgos para determinar qué cambió.
 */

export interface DriftReport {
  hasDrift: boolean;
  added: string[];
  removed: string[];
  modified: string[];
}

export function detectBaselineDrift(
  baselineFindings: any[],
  currentFindings: any[]
): DriftReport {
  const added: string[] = [];
  const removed: string[] = [];
  const modified: string[] = [];

  // Mapeamos por titulo/asset
  const baselineMap = new Map();
  baselineFindings.forEach((f) => {
    const key = `${f.affectedAsset}-${f.title}`;
    baselineMap.set(key, f);
  });

  const currentMap = new Map();
  currentFindings.forEach((f) => {
    const key = `${f.affectedAsset}-${f.title}`;
    currentMap.set(key, f);

    if (!baselineMap.has(key)) {
      added.push(`Nuevo hallazgo en ${f.affectedAsset}: ${f.title}`);
    } else {
      const b = baselineMap.get(key);
      // Comparación simple de evidencia (drift)
      if (JSON.stringify(b.evidence) !== JSON.stringify(f.evidence)) {
        modified.push(`Evidencia modificada en ${f.affectedAsset}: ${f.title}`);
      }
    }
  });

  baselineMap.forEach((f, key) => {
    if (!currentMap.has(key)) {
      removed.push(`Hallazgo resuelto en ${f.affectedAsset}: ${f.title}`);
    }
  });

  return {
    hasDrift: added.length > 0 || removed.length > 0 || modified.length > 0,
    added,
    removed,
    modified,
  };
}
