import { describe, expect, it } from "vitest";
import {
  DISPATCHER_TASK,
  RETENTION_TASK,
  cronOf,
  environmentsOf,
  evaluateDispatcher,
  hoursSince,
  isSuccess,
  keyKindOf,
  pageData,
  type RunShape,
  type ScheduleShape,
} from "./dispatcher-report";

/**
 * Regresión del chequeo del cron de retención (P2-14).
 *
 * El caso que justifica la suite es el hallazgo del 2026-10-15: la API del
 * proyecto no tiene NINGÚN schedule de `daily-operations-dispatcher`, pero sí
 * uno de `cleanup-old-logs` con cron propio (`0 0 * * *`). Reportar «no hay
 * dispatcher ⇒ la retención no corre» sería falso, y reportar «hay un schedule ⇒
 * todo bien» también: son dos caminos distintos y el veredicto tiene que
 * distinguirlos. Igual de importante: con credencial de DESARROLLO el resultado
 * no puede salir en verde, porque no dice nada de producción.
 */

const NOW = Date.parse("2026-10-15T12:00:00.000Z");

const schedule = (over: Partial<ScheduleShape> = {}): ScheduleShape => ({
  id: "sched_1",
  task: DISPATCHER_TASK,
  type: "DECLARATIVE",
  active: true,
  generator: { type: "CRON", expression: "0 3 * * *" },
  nextRun: "2026-10-16T03:00:00.000Z",
  environments: [{ id: "env_1", type: "PRODUCTION" }],
  ...over,
});

const run = (over: Partial<RunShape> = {}): RunShape => ({
  id: "run_1",
  taskIdentifier: DISPATCHER_TASK,
  status: "COMPLETED",
  createdAt: "2026-10-15T03:00:05.000Z",
  ...over,
});

const evaluate = (over: Partial<Parameters<typeof evaluateDispatcher>[0]> = {}) =>
  evaluateDispatcher({
    schedules: [schedule()],
    dispatcherRuns: [run()],
    retentionRuns: [],
    keyKind: "producción",
    staleHours: 48,
    now: NOW,
    ...over,
  });

describe("dispatcher-report — camino que ejecuta la retención", () => {
  it("dispatcher activo + ejecución reciente en producción ⇒ ok (exit 0)", () => {
    const r = evaluate();
    expect(r).toMatchObject({ verdict: "ok", exitCode: 0 });
    expect(r.path).toContain(DISPATCHER_TASK);
  });

  it("sin dispatcher pero con cron propio de la retención ⇒ lo dice, no lo niega", () => {
    const r = evaluate({
      schedules: [
        schedule({
          id: "sched_legacy",
          task: RETENTION_TASK,
          generator: { type: "CRON", expression: "0 0 * * *" },
        }),
      ],
      dispatcherRuns: [],
      retentionRuns: [run({ taskIdentifier: RETENTION_TASK })],
    });
    expect(r.path).toContain(RETENTION_TASK);
    expect(r.notes.join(" ")).toContain("cron propio");
    // La retención SÍ corre en este escenario: no puede salir en rojo.
    expect(r.verdict).toBe("ok");
  });

  it("sin ningún schedule de retención ⇒ problem (exit 1)", () => {
    const r = evaluate({
      schedules: [schedule({ task: "uptime-monitor" })],
      dispatcherRuns: [],
      retentionRuns: [],
    });
    expect(r.verdict).toBe("problem");
    expect(r.exitCode).toBe(1);
    expect(r.problems.join(" ")).toContain("no corre");
  });

  it("schedule presente pero desactivado ⇒ problem", () => {
    const r = evaluate({ schedules: [schedule({ active: false })] });
    expect(r.verdict).toBe("problem");
    expect(r.problems.join(" ")).toContain("desactivado");
  });
});

describe("dispatcher-report — ejecuciones", () => {
  it("última ejecución fallida ⇒ problem aunque el schedule esté activo", () => {
    const r = evaluate({ dispatcherRuns: [run({ status: "FAILED" })] });
    expect(r.verdict).toBe("problem");
    expect(r.problems.join(" ")).toContain("FAILED");
  });

  it("última correcta hace más del umbral ⇒ estancado (problem)", () => {
    const r = evaluate({
      dispatcherRuns: [
        run({ status: "FAILED" }),
        run({ status: "COMPLETED", createdAt: "2026-10-01T03:00:00.000Z" }),
      ],
      staleHours: 48,
    });
    expect(r.verdict).toBe("problem");
    expect(r.problems.join(" ")).toContain("estancado");
  });

  it("sin ninguna ejecución ⇒ blocked, nunca ok", () => {
    const r = evaluate({ dispatcherRuns: [], retentionRuns: [] });
    expect(r).toMatchObject({ verdict: "blocked", exitCode: 2 });
    expect(r.blocked.join(" ")).toContain("ejecuciones registradas");
  });

  it("prefiere las ejecuciones del dispatcher cuando existen", () => {
    const r = evaluate({
      dispatcherRuns: [run()],
      retentionRuns: [run({ taskIdentifier: RETENTION_TASK, status: "FAILED" })],
    });
    expect(r.verdict).toBe("ok");
  });
});

describe("dispatcher-report — alcance de la credencial", () => {
  it("credencial de desarrollo ⇒ blocked, jamás verde (el caso de hoy)", () => {
    const r = evaluate({
      keyKind: "desarrollo",
      schedules: [schedule({ environments: [{ type: "DEVELOPMENT" }] })],
    });
    expect(r).toMatchObject({ verdict: "blocked", exitCode: 2 });
    expect(r.blocked.join(" ")).toContain("DESARROLLO");
  });

  it("entornos visibles sin PRODUCTION ⇒ blocked aunque el schedule esté sano", () => {
    const r = evaluate({
      keyKind: "producción",
      schedules: [schedule({ environments: [{ type: "STAGING" }] })],
    });
    expect(r.verdict).toBe("blocked");
    expect(r.blocked.join(" ")).toContain("PRODUCTION");
  });

  it("clasifica la credencial por prefijo sin exponer el valor", () => {
    expect(keyKindOf("tr_dev_abc123")).toBe("desarrollo");
    expect(keyKindOf("tr_prod_abc123")).toBe("producción");
    expect(keyKindOf("tr_stg_abc123")).toBe("staging");
    expect(keyKindOf(undefined)).toBe("desconocida");
  });

  it("un problema gana sobre un bloqueo: no se esconde un fallo real", () => {
    const r = evaluate({ keyKind: "desarrollo", dispatcherRuns: [run({ status: "CRASHED" })] });
    expect(r.verdict).toBe("problem");
    expect(r.exitCode).toBe(1);
  });
});

describe("dispatcher-report — helpers", () => {
  it("pageData tolera páginas de cursor y offset y errores de forma", () => {
    expect(pageData<number>({ data: [1, 2] })).toEqual([1, 2]);
    expect(pageData<number>({ items: [1] })).toEqual([]);
    expect(pageData<number>(null)).toEqual([]);
  });

  it("environmentsOf deduplica y ordena", () => {
    expect(
      environmentsOf([
        schedule({ environments: [{ type: "DEVELOPMENT" }, { type: "PRODUCTION" }] }),
        schedule({ environments: [{ type: "DEVELOPMENT" }] }),
      ])
    ).toEqual(["DEVELOPMENT", "PRODUCTION"]);
    expect(environmentsOf([{ id: "s" }])).toEqual([]);
  });

  it("hoursSince devuelve null sin fecha válida y no depende del reloj global", () => {
    expect(hoursSince(undefined)).toBeNull();
    expect(hoursSince("no-es-fecha")).toBeNull();
    expect(hoursSince("2026-10-15T10:00:00.000Z", NOW)).toBeCloseTo(2, 5);
  });

  it("isSuccess sólo acepta COMPLETED/SUCCESS", () => {
    expect(isSuccess("COMPLETED")).toBe(true);
    expect(isSuccess("SUCCESS")).toBe(true);
    expect(isSuccess("FAILED")).toBe(false);
    expect(isSuccess(undefined)).toBe(false);
  });

  it("cronOf lee el generator declarativo cuando no hay campo directo", () => {
    expect(cronOf(schedule({ cron: undefined, generator: { expression: "0 3 * * *" } }))).toBe(
      "0 3 * * *"
    );
    expect(cronOf(schedule({ cron: "0 0 * * *", generator: { expression: "0 3 * * *" } }))).toBe(
      "0 0 * * *"
    );
    expect(cronOf({})).toBe("—");
  });
});
