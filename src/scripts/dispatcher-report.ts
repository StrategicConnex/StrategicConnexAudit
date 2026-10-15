/**
 * dispatcher-report.ts — Lógica pura del chequeo de dispatcher (P2-14).
 *
 * POR QUÉ EXISTE: el CLI `dispatcher-status.ts` habla con la API de Trigger.dev
 * y tiene efectos en el nivel superior (IIFE + `process.exit`), así que no se
 * puede importar en una suite: importarlo ejecutaría el chequeo y mataría el
 * proceso. Aquí queda lo que DECIDE —qué camino ejecuta la retención, si está
 * estancada y si la credencial alcanza para afirmar algo— sin tocar la red.
 *
 * La decisión tiene tres salidas posibles y confundirlas es el fallo caro:
 *   "ok"      → hay un schedule activo y su última ejecución fue correcta;
 *   "problem" → el schedule está inactivo, o la última ejecución falló, o está
 *               estancada, o no existe ningún camino de retención;
 *   "blocked" → no se pudo verificar (credencial de desarrollo, entorno sin
 *               PRODUCTION, sin ejecuciones registradas). NUNCA es un aprobado:
 *               un guard que devolviera "ok" sin poder mirar producción sería
 *               peor que ninguno.
 */

/** Task que dispara la retención cuando corre el dispatcher consolidado. */
export const DISPATCHER_TASK = "daily-operations-dispatcher";

/** Task que ejecuta el DELETE de retención; puede tener cron propio (legacy). */
export const RETENTION_TASK = "cleanup-old-logs";

export type ScheduleShape = {
  id?: string;
  task?: string;
  type?: string;
  active?: boolean;
  generator?: { type?: string; expression?: string };
  cron?: string;
  nextRun?: string;
  environments?: { id?: string; type?: string; userName?: string | null }[];
};

export type RunShape = {
  id?: string;
  taskIdentifier?: string;
  status?: string;
  createdAt?: string;
  startedAt?: string;
  finishedAt?: string;
};

export type Verdict = "ok" | "problem" | "blocked";

export type DispatcherReport = {
  verdict: Verdict;
  /** Exit code del CLI: 0 ok · 1 problem · 2 blocked. */
  exitCode: 0 | 1 | 2;
  path: string | null;
  problems: string[];
  blocked: string[];
  notes: string[];
};

/** Extrae `{ data }` de una página de la API, sea offset/limit o cursor. */
export function pageData<T>(page: unknown): T[] {
  const data = (page as { data?: unknown })?.data;
  return Array.isArray(data) ? (data as T[]) : [];
}

/** Entornos que aparecen en los schedules, para detectar el alcance de la key. */
export function environmentsOf(schedules: ScheduleShape[]): string[] {
  const types = new Set<string>();
  for (const s of schedules) for (const e of s.environments ?? []) if (e.type) types.add(e.type);
  return [...types].sort();
}

/** Clase de credencial según el prefijo, sin exponer el valor. */
export function keyKindOf(
  key: string | undefined
): "desarrollo" | "producción" | "staging" | "desconocida" {
  if (!key) return "desconocida";
  if (key.startsWith("tr_dev_")) return "desarrollo";
  if (key.startsWith("tr_prod_")) return "producción";
  if (key.startsWith("tr_stg_")) return "staging";
  return "desconocida";
}

/** Horas transcurridas desde una fecha (null si no hay fecha válida). */
export function hoursSince(
  date: Date | string | undefined | null,
  now = Date.now()
): number | null {
  if (!date) return null;
  const ms = new Date(date).getTime();
  if (!Number.isFinite(ms)) return null;
  return (now - ms) / 36e5;
}

/** `true` si el estado de un run cuenta como éxito. */
export function isSuccess(status: unknown): boolean {
  return ["COMPLETED", "SUCCESS"].includes(String(status));
}

/** Cron efectivo de un schedule (campo directo o el generator declarativo). */
export function cronOf(schedule: ScheduleShape): string {
  return schedule.cron ?? schedule.generator?.expression ?? "—";
}

/**
 * Decide el veredicto del cron de retención.
 *
 * @param input.schedules todos los schedules visibles con la credencial actual
 * @param input.dispatcherRuns ejecuciones del dispatcher (vacío si no hay)
 * @param input.retentionRuns ejecuciones de la task de retención (vacío si no hay)
 * @param input.keyKind clase de credencial, para saber si alcanza a producción
 * @param input.staleHours umbral de estancamiento
 */
export function evaluateDispatcher(input: {
  schedules: ScheduleShape[];
  dispatcherRuns: RunShape[];
  retentionRuns: RunShape[];
  keyKind: ReturnType<typeof keyKindOf>;
  staleHours: number;
  now?: number;
}): DispatcherReport {
  const { schedules, dispatcherRuns, retentionRuns, keyKind, staleHours } = input;
  const now = input.now ?? Date.now();
  const problems: string[] = [];
  const blocked: string[] = [];
  const notes: string[] = [];

  const dispatcherSchedules = schedules.filter((s) => s.task === DISPATCHER_TASK);
  const retentionSchedules = schedules.filter((s) => s.task === RETENTION_TASK);

  // ── Qué camino ejecuta la retención ─────────────────────────────────────
  let path: string | null = null;
  if (dispatcherSchedules.length > 0) {
    path = `dispatcher consolidado (${DISPATCHER_TASK})`;
    if (!dispatcherSchedules.some((s) => s.active !== false)) {
      problems.push("el schedule del dispatcher existe pero está desactivado");
    }
  } else if (retentionSchedules.length > 0) {
    path = `${RETENTION_TASK} con cron propio (layout anterior a la consolidación)`;
    if (!retentionSchedules.some((s) => s.active !== false)) {
      problems.push(`el cron propio de ${RETENTION_TASK} está desactivado`);
    }
    notes.push(
      `no hay schedule para ${DISPATCHER_TASK}: la retención depende del cron propio de ${RETENTION_TASK}; ` +
        `eso contradice la premisa de la auditoría («sin dispatcher no hay retención») y encaja con un ` +
        `despliegue anterior a la consolidación de schedules`
    );
  } else {
    problems.push(
      `no existe ningún schedule para ${DISPATCHER_TASK} ni para ${RETENTION_TASK}: la retención no corre`
    );
  }

  // ── Ejecuciones: el schedule puede existir y no estar corriendo ─────────
  const usingDispatcherRuns = dispatcherRuns.length > 0;
  const runsToInspect = usingDispatcherRuns ? dispatcherRuns : retentionRuns;
  const runsTask = usingDispatcherRuns ? DISPATCHER_TASK : RETENTION_TASK;

  if (runsToInspect.length === 0) {
    blocked.push(
      `ni ${DISPATCHER_TASK} ni ${RETENTION_TASK} tienen ejecuciones registradas: no se puede afirmar ` +
        `que el cron funcione (ni que esté roto)`
    );
  } else {
    const latest = runsToInspect[0];
    if (!isSuccess(latest?.status)) {
      problems.push(
        `la última ejecución de ${runsTask} terminó en ${latest?.status}, no en COMPLETED`
      );
    }
    const lastOk = runsToInspect.find((r) => isSuccess(r.status));
    const hrs = hoursSince(lastOk?.createdAt, now);
    if (hrs === null) {
      problems.push(`ninguna ejecución de ${runsTask} terminó bien en la ventana consultada`);
    } else if (hrs > staleHours) {
      problems.push(
        `la última ejecución correcta de ${runsTask} fue hace ${hrs.toFixed(1)} h (umbral ${staleHours} h): cron estancado`
      );
    }
  }

  // ── Alcance de la credencial: sin esto, todo lo anterior es de otro entorno ─
  if (keyKind === "desarrollo") {
    blocked.push(
      "la credencial es de DESARROLLO (tr_dev_*): sólo ve el entorno DEVELOPMENT, así que esto NO dice nada sobre producción"
    );
  }
  const envs = environmentsOf(schedules);
  if (envs.length > 0 && !envs.includes("PRODUCTION")) {
    blocked.push(
      `ningún schedule visible pertenece a PRODUCTION (entornos vistos: ${envs.join(", ")})`
    );
  }

  const verdict: Verdict = problems.length > 0 ? "problem" : blocked.length > 0 ? "blocked" : "ok";
  return {
    verdict,
    exitCode: verdict === "ok" ? 0 : verdict === "problem" ? 1 : 2,
    path,
    problems,
    blocked,
    notes,
  };
}
