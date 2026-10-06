/**
 * trigger/cron-dispatchers.trigger.ts
 *
 * Dispatchers de cron. Cada uno es UN schedule que encola el grupo de jobs que
 * le toca, separándolos 30 s para no castigar a Postgres con un pico.
 *
 * Por qué agrupar: el plan gratuito de Trigger.dev admite 10 schedules por
 * proyecto. El repo declaraba 17 crons, así que `trigger.dev deploy` fallaba
 * con "You have created 10/10 schedules" y ninguno llegaba a ejecutarse en
 * producción. Ahora hay 9 schedules en total (5 jobs de alta frecuencia con
 * cron propio + estos 4) y los 12 jobs de cadencia lenta siguen corriéndose
 * todos, cada uno con su hora original documentada en su propio archivo.
 *
 * El encolado es "fire and forget": el dispatcher no espera a que termine cada
 * job. El resultado de cada uno vive en su propio run, que es donde hay que
 * mirarlo para diagnosticar.
 */

import { schedules, wait } from "@trigger.dev/sdk";
import { logger } from "@/lib/logger";
import { dispatchJobs, summarizeDispatch, type DispatchJob } from "./cron-plan";

import { periodicAdversarySimulation } from "./adversary.trigger";
import { continuousDiscovery } from "./discovery.trigger";
import { integrationSyncSweep } from "./integration-sync.trigger";
import { notificationsMaintenance } from "./notifications.trigger";
import { cleanupOldLogs } from "./cleanup.trigger";
import { evaluateMonitorsTask } from "./monitoring.trigger";
import { findingTriageSweep } from "./finding-triage.trigger";
import { findingSlaSweep } from "./finding-sla.trigger";
import { apiKeyExpiryAlert } from "./api-key-expiry.trigger";
import { weeklyFullPentest } from "./weekly-pentest.trigger";
import { forecastTask } from "./forecast.trigger";
import { weeklyDigestTask } from "./weekly-digest.trigger";

/** Cada 6 h: simulación adversaria y descubrimiento de activos. */
export const SIX_HOURLY_JOBS: readonly DispatchJob[] = [
  { id: "periodic-adversary-simulation", legacyCron: "0 */6 * * *", trigger: periodicAdversarySimulation.trigger },
  { id: "continuous-discovery", legacyCron: "0 */6 * * *", trigger: continuousDiscovery.trigger },
];

/** Diario: integraciones, bandeja y purgas de logs. */
export const DAILY_OPERATIONS_JOBS: readonly DispatchJob[] = [
  { id: "integration-sync-sweep", legacyCron: "0 3 * * *", trigger: integrationSyncSweep.trigger },
  { id: "notifications-maintenance", legacyCron: "0 3 * * *", trigger: notificationsMaintenance.trigger },
  { id: "cleanup-old-logs", legacyCron: "0 0 * * *", trigger: cleanupOldLogs.trigger },
  { id: "evaluate-monitors-task", legacyCron: "0 0 * * *", trigger: evaluateMonitorsTask.trigger },
];

/** Diario: gobierno del ciclo de vida del hallazgo y avisos de caducidad. */
export const DAILY_GOVERNANCE_JOBS: readonly DispatchJob[] = [
  { id: "finding-triage-sweep", legacyCron: "0 4 * * *", trigger: findingTriageSweep.trigger },
  { id: "finding-sla-sweep", legacyCron: "0 5 * * *", trigger: findingSlaSweep.trigger },
  { id: "api-key-expiry-alert", legacyCron: "0 9 * * *", trigger: apiKeyExpiryAlert.trigger },
];

/** Semanal (lunes): pentest completo, previsión y resumen ejecutivo. */
export const WEEKLY_MONDAY_JOBS: readonly DispatchJob[] = [
  { id: "weekly-full-pentest", legacyCron: "0 3 * * 1", trigger: weeklyFullPentest.trigger },
  { id: "weekly-forecast", legacyCron: "0 6 * * 1", trigger: forecastTask.trigger },
  { id: "weekly-digest", legacyCron: "0 9 * * 1", trigger: weeklyDigestTask.trigger },
];

export const ALL_DISPATCHED_JOBS: readonly DispatchJob[] = [
  ...SIX_HOURLY_JOBS,
  ...DAILY_OPERATIONS_JOBS,
  ...DAILY_GOVERNANCE_JOBS,
  ...WEEKLY_MONDAY_JOBS,
];

async function runDispatcher(
  name: string,
  jobs: readonly DispatchJob[],
  timestamp: Date,
): Promise<{ dispatcher: string; total: number; dispatched: number; failed: number }> {
  const outcomes = await dispatchJobs(jobs, {
    timestamp,
    // wait.for solo acepta segundos; el escalón del plan va en milisegundos.
    sleep: (ms) => wait.for({ seconds: ms / 1000 }),
    log: (message) => logger.info(message),
    warn: (message) => logger.warn(message),
  });

  const summary = summarizeDispatch(outcomes);
  logger.info(
    `[${name}] ${summary.dispatched}/${summary.total} encolados, ${summary.failed} fallos`,
  );
  return { dispatcher: name, ...summary };
}

export const sixHourlyDispatcher = schedules.task({
  id: "six-hourly-dispatcher",
  cron: "0 */6 * * *",
  retry: { maxAttempts: 3 },
  run: async (payload) => runDispatcher("six-hourly-dispatcher", SIX_HOURLY_JOBS, payload.timestamp),
});

export const dailyOperationsDispatcher = schedules.task({
  id: "daily-operations-dispatcher",
  cron: "0 3 * * *",
  retry: { maxAttempts: 3 },
  run: async (payload) =>
    runDispatcher("daily-operations-dispatcher", DAILY_OPERATIONS_JOBS, payload.timestamp),
});

export const dailyGovernanceDispatcher = schedules.task({
  id: "daily-governance-dispatcher",
  cron: "0 5 * * *",
  retry: { maxAttempts: 3 },
  run: async (payload) =>
    runDispatcher("daily-governance-dispatcher", DAILY_GOVERNANCE_JOBS, payload.timestamp),
});

export const weeklyMondayDispatcher = schedules.task({
  id: "weekly-monday-dispatcher",
  cron: "0 3 * * 1",
  retry: { maxAttempts: 3 },
  run: async (payload) =>
    runDispatcher("weekly-monday-dispatcher", WEEKLY_MONDAY_JOBS, payload.timestamp),
});
