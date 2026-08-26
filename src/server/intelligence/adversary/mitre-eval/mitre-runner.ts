/**
 * mitre-runner.ts — Orquestador de la Evaluación Real de Cobertura MITRE.
 *
 * Para cada técnica del catálogo ejecuta sus checks asociados (reutilizando
 * el motor de assessment: egress-guard, rate-limit, timeouts) y produce un
 * veredicto inicial mecánico:
 *   exposed      → algún check asociado produjo finding
 *   not_exposed  → todos los checks pasaron
 *   not_externally_testable → sin prueba externa (playbook AI)
 *
 * La evidencia agregada alimenta al agente AI en mitre-analyst.ts.
 */

import { assertPublicHostname, safeFetch } from "../../security/egress-guard";
import { extractTargetHost, tcpProbe } from "../sandbox-executor";
import type { CheckContext, CheckResult } from "../assessment/types";
import {
  buildMitrePlans,
  getCheckById,
  type MitreTechniquePlan,
} from "./checks-map";

const DELAY_BETWEEN_CHECKS_MS = 150;
const CHECK_TIMEOUT_MS = 10_000;

export type MitreVerdict = "exposed" | "not_exposed" | "not_externally_testable" | "error";

export interface MitreTechniqueEvidence {
  mitreId: string;
  tactic: string;
  techniqueName: string;
  notExternallyTestable: boolean;
  checkResults: CheckResult[];
  /** Probe TCP directo para técnicas basadas en puertos (RDP). */
  portProbes?: Array<{ port: number; open: boolean; hint?: string }>;
}

export interface MitreBatchEvidence {
  target: string;
  startedAt: string;
  completedAt: string;
  durationMs: number;
  techniques: MitreTechniqueEvidence[];
}

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function runCheck(ctx: CheckContext, plan: MitreTechniquePlan, checkId: string): Promise<CheckResult> {
  const def = getCheckById(checkId);
  if (!def) {
    return { id: checkId, name: checkId, status: "error", summary: "check no encontrado", evidence: {} };
  }
  try {
    return await Promise.race([
      def.run(ctx),
      delay(CHECK_TIMEOUT_MS + 2_000).then(
        (): CheckResult => ({ id: checkId, name: def.name, status: "error", summary: "timeout global del check", evidence: {} })
      ),
    ]);
  } catch (err) {
    return {
      id: checkId,
      name: def.name,
      status: "error",
      summary: `Excepción: ${err instanceof Error ? err.message : String(err)}`,
      evidence: {},
    };
  }
}

export async function runMitreEvaluation(
  target: string
): Promise<{ success: boolean; evidence?: MitreBatchEvidence; error?: string }> {
  const startedAt = new Date();
  const host = extractTargetHost(target);
  if (!host) return { success: false, error: "Target inválido o vacío." };

  try {
    await assertPublicHostname(host);
  } catch (err) {
    return { success: false, error: `EgressGuard: ${err instanceof Error ? err.message : String(err)}` };
  }

  const ctx: CheckContext = {
    host,
    origin: `https://${host}`,
    fetch: safeFetch,
    timeoutMs: CHECK_TIMEOUT_MS,
  };

  const plans = buildMitrePlans();
  const results: MitreTechniqueEvidence[] = [];
  // Cache por check id: varias técnicas comparten checks (no repetir requests)
  const checkCache = new Map<string, CheckResult>();

  for (const plan of plans) {
    if (plan.notExternallyTestable) {
      results.push({
        mitreId: plan.scenario.mitreId,
        tactic: plan.scenario.mitreTactic,
        techniqueName: plan.scenario.mitreTechnique,
        notExternallyTestable: true,
        checkResults: [],
      });
      continue;
    }

    const checkResults: CheckResult[] = [];
    for (const checkId of plan.checkIds) {
      let cached = checkCache.get(checkId);
      if (!cached) {
        await delay(DELAY_BETWEEN_CHECKS_MS);
        cached = await runCheck(ctx, plan, checkId);
        checkCache.set(checkId, cached);
      }
      checkResults.push(cached);
    }

    // Probes TCP directos para técnicas basadas en puertos
    let portProbes: MitreTechniqueEvidence["portProbes"];
    if (plan.scenario.mitreId === "T1021.001") {
      const rdp = await tcpProbe(host, 3389, 4_000);
      portProbes = [{ port: 3389, open: rdp.open, hint: "RDP" }];
    } else if (plan.scenario.mitreId === "T1046") {
      const ports = [21, 22, 23, 25, 80, 443, 445, 3389, 5432, 3306, 6379, 8080];
      const probes = await Promise.all(
        ports.map(async (p) => ({ port: p, open: (await tcpProbe(host, p, 3_000)).open }))
      );
      portProbes = probes.filter((p) => p.open).map((p) => ({
        ...p,
        hint: p.port === 22 ? "SSH" : p.port === 445 ? "SMB" : p.port === 3389 ? "RDP" : undefined,
      }));
    }

    results.push({
      mitreId: plan.scenario.mitreId,
      tactic: plan.scenario.mitreTactic,
      techniqueName: plan.scenario.mitreTechnique,
      notExternallyTestable: false,
      checkResults,
      portProbes,
    });
  }

  return {
    success: true,
    evidence: {
      target: host,
      startedAt: startedAt.toISOString(),
      completedAt: new Date().toISOString(),
      durationMs: Date.now() - startedAt.getTime(),
      techniques: results,
    },
  };
}
