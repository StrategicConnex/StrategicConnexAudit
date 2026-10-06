/**
 * trigger/cron-plan.ts
 *
 * Lógica pura de los dispatchers de cron. No importa nada de Trigger.dev ni de
 * la base de datos: recibe la lista de jobs y un `trigger` inyectable, así que
 * se prueba entera sin mocks.
 *
 * Por qué existe: el plan gratuito de Trigger.dev admite 10 schedules por
 * proyecto y el repo declaraba 17 crons, así que `trigger.dev deploy` moría con
 * "You have created 10/10 schedules" y ningún cron llegaba a existir en
 * producción. La consolidación no es estética: sin deploy no hay SLA, ni purga,
 * ni digest.
 */

/** Segundos entre jobs del mismo dispatcher. Evita el pico simultáneo contra Postgres. */
export const DISPATCH_STAGGER_MS = 30_000;

/**
 * Payload de un job disparado por un dispatcher.
 *
 * Antes estos jobs eran `schedules.task` y Trigger.dev les inyectaba un payload
 * de scheduler (`scheduleId`, `upcoming`, `timezone`...). Al pasar a dispararse
 * desde un dispatcher, ese payload sería mentira, así que son `task` normales y
 * el contrato es este: el dispatcher les pasa la hora de su propia ejecución.
 */
export type CronJobPayload = {
  timestamp: Date;
};

export type DispatcherName =
  | "six-hourly-dispatcher"
  | "daily-operations-dispatcher"
  | "daily-governance-dispatcher"
  | "weekly-monday-dispatcher";

/**
 * Qué dispatcher encola cada task de cadencia lenta.
 *
 * Es solo dato: el binding a la función real vive en
 * `cron-dispatchers.trigger.ts`. Tenerlo aquí, sin dependencias, permite
 * afirmar en los tests de cada job que nadie se quedó sin dueño —que es
 * exactamente como se pierde un cron sin avisar— sin importar la base de datos.
 */
export const DISPATCH_OWNER: Record<string, DispatcherName> = {
  "periodic-adversary-simulation": "six-hourly-dispatcher",
  "continuous-discovery": "six-hourly-dispatcher",
  "integration-sync-sweep": "daily-operations-dispatcher",
  "notifications-maintenance": "daily-operations-dispatcher",
  "cleanup-old-logs": "daily-operations-dispatcher",
  "evaluate-monitors-task": "daily-operations-dispatcher",
  "finding-triage-sweep": "daily-governance-dispatcher",
  "finding-sla-sweep": "daily-governance-dispatcher",
  "api-key-expiry-alert": "daily-governance-dispatcher",
  "weekly-full-pentest": "weekly-monday-dispatcher",
  "weekly-forecast": "weekly-monday-dispatcher",
  "weekly-digest": "weekly-monday-dispatcher",
};

export type DispatchJob = {
  /** Id de la task en Trigger.dev; es lo que aparece en el dashboard. */
  id: string;
  /** Cron que tenía antes de la consolidación. Se conserva como documentación. */
  legacyCron: string;
  trigger: (payload: CronJobPayload) => Promise<unknown>;
};

export type DispatchOutcome = {
  id: string;
  dispatched: boolean;
  /** Mensaje del fallo al encolar. `undefined` cuando se encoló bien. */
  error?: string;
};

export type DispatchSummary = {
  total: number;
  dispatched: number;
  failed: number;
};

export type DispatchDeps = {
  /** Reloj inyectable: el dispatcher no debe leer `Date.now()` por su cuenta. */
  timestamp: Date;
  sleep: (ms: number) => Promise<void>;
  log: (message: string) => void;
  warn?: (message: string) => void;
  staggerMs?: number;
};

function describeError(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

/**
 * Encola los jobs en orden, separando cada uno del siguiente.
 *
 * Un job que falla al encolarse no corta el resto: el dispatcher se reintenta
 * entero si algo revienta, y sin este `catch` un solo job caído dejaría sin
 * ejecutar los que vienen detrás.
 */
export async function dispatchJobs(
  jobs: readonly DispatchJob[],
  deps: DispatchDeps,
): Promise<DispatchOutcome[]> {
  const staggerMs = deps.staggerMs ?? DISPATCH_STAGGER_MS;
  const outcomes: DispatchOutcome[] = [];

  for (const [index, job] of jobs.entries()) {
    // El primero sale immediately; los demás esperan para no solaparse.
    if (index > 0 && staggerMs > 0) {
      await deps.sleep(staggerMs);
    }

    try {
      await job.trigger({ timestamp: deps.timestamp });
      deps.log(`[dispatcher] encolado ${job.id}`);
      outcomes.push({ id: job.id, dispatched: true });
    } catch (error) {
      const message = describeError(error);
      deps.warn?.(`[dispatcher] no se pudo encolar ${job.id}: ${message}`);
      outcomes.push({ id: job.id, dispatched: false, error: message });
    }
  }

  return outcomes;
}

export function summarizeDispatch(outcomes: readonly DispatchOutcome[]): DispatchSummary {
  const dispatched = outcomes.filter((outcome) => outcome.dispatched).length;
  return {
    total: outcomes.length,
    dispatched,
    failed: outcomes.length - dispatched,
  };
}
