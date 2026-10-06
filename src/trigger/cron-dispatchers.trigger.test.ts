/* ═══════════════════════════════════════════════════════════════════════════
   Trigger: cron dispatchers — Tests

   El bug que motivó esto: el plan gratuito de Trigger.dev admite 10 schedules y
   el repo declaraba 17 crons, así que `trigger.dev deploy` moría con
   "You have created 10/10 schedules" y ningún cron llegaba a producción.

   Verifica:
   - Los 4 dispatchers existen con su cron exacto
   - El repo entero queda dentro del presupuesto de 10 schedules
   - Cada job tiene dueño y su dueño es el dispatcher que lo encola
   - Ningún job se encola dos veces ni se queda fuera
   - El run encola todos los jobs y aísla los que fallan
   ═══════════════════════════════════════════════════════════════════════════ */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { DISPATCH_OWNER, DISPATCH_STAGGER_MS, type DispatcherName } from "./cron-plan";

/** El plan gratuito admite 10 schedules por proyecto. */
const FREE_TIER_MAX_SCHEDULES = 10;

const hoisted = vi.hoisted(() => {
  const trigger = () => vi.fn(async () => ({ ok: true }));
  return {
    schedules: { task: vi.fn((config: unknown) => config) },
    task: vi.fn((config: unknown) => config),
    waitFor: vi.fn(async () => undefined),
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    adversary: trigger(),
    discovery: trigger(),
    integrationSync: trigger(),
    notifications: trigger(),
    cleanup: trigger(),
    monitors: trigger(),
    triage: trigger(),
    sla: trigger(),
    apiKey: trigger(),
    pentest: trigger(),
    forecast: trigger(),
    digest: trigger(),
  };
});

vi.mock("@trigger.dev/sdk", () => ({
  schedules: hoisted.schedules,
  task: hoisted.task,
  wait: { for: hoisted.waitFor },
}));
vi.mock("@/lib/logger", () => ({ logger: hoisted.logger }));

vi.mock("./adversary.trigger", () => ({
  periodicAdversarySimulation: { trigger: hoisted.adversary },
}));
vi.mock("./discovery.trigger", () => ({
  continuousDiscovery: { trigger: hoisted.discovery },
}));
vi.mock("./integration-sync.trigger", () => ({
  integrationSyncSweep: { trigger: hoisted.integrationSync },
}));
vi.mock("./notifications.trigger", () => ({
  notificationsMaintenance: { trigger: hoisted.notifications },
}));
vi.mock("./cleanup.trigger", () => ({ cleanupOldLogs: { trigger: hoisted.cleanup } }));
vi.mock("./monitoring.trigger", () => ({
  evaluateMonitorsTask: { trigger: hoisted.monitors },
}));
vi.mock("./finding-triage.trigger", () => ({
  findingTriageSweep: { trigger: hoisted.triage },
}));
vi.mock("./finding-sla.trigger", () => ({ findingSlaSweep: { trigger: hoisted.sla } }));
vi.mock("./api-key-expiry.trigger", () => ({
  apiKeyExpiryAlert: { trigger: hoisted.apiKey },
}));
vi.mock("./weekly-pentest.trigger", () => ({
  weeklyFullPentest: { trigger: hoisted.pentest },
}));
vi.mock("./forecast.trigger", () => ({ forecastTask: { trigger: hoisted.forecast } }));
vi.mock("./weekly-digest.trigger", () => ({ weeklyDigestTask: { trigger: hoisted.digest } }));

import {
  sixHourlyDispatcher,
  dailyOperationsDispatcher,
  dailyGovernanceDispatcher,
  weeklyMondayDispatcher,
  SIX_HOURLY_JOBS,
  DAILY_OPERATIONS_JOBS,
  DAILY_GOVERNANCE_JOBS,
  WEEKLY_MONDAY_JOBS,
  ALL_DISPATCHED_JOBS,
} from "./cron-dispatchers.trigger";

interface ScheduleConfig {
  id: string;
  cron: string;
  run: (payload: { timestamp: Date }) => Promise<{ dispatcher: string; total: number; dispatched: number; failed: number }>;
}

const DISPATCHERS: Array<[ScheduleConfig, string, readonly { id: string; trigger: () => unknown }[]]> = [
  [sixHourlyDispatcher as unknown as ScheduleConfig, "0 */6 * * *", SIX_HOURLY_JOBS],
  [dailyOperationsDispatcher as unknown as ScheduleConfig, "0 3 * * *", DAILY_OPERATIONS_JOBS],
  [dailyGovernanceDispatcher as unknown as ScheduleConfig, "0 5 * * *", DAILY_GOVERNANCE_JOBS],
  [weeklyMondayDispatcher as unknown as ScheduleConfig, "0 3 * * 1", WEEKLY_MONDAY_JOBS],
];

const TIMESTAMP = new Date("2026-10-05T03:00:00.000Z");

beforeEach(() => {
  vi.clearAllMocks();
  for (const mock of [
    hoisted.adversary, hoisted.discovery, hoisted.integrationSync, hoisted.notifications,
    hoisted.cleanup, hoisted.monitors, hoisted.triage, hoisted.sla, hoisted.apiKey,
    hoisted.pentest, hoisted.forecast, hoisted.digest,
  ]) {
    mock.mockResolvedValue({ ok: true });
  }
});

describe("dispatchers: registro", () => {
  it.each(DISPATCHERS.map(([task, cron]) => [task.id, task, cron] as const))(
    "%s conserva su cron",
    (_id, task, cron) => {
      expect(task.id).toMatch(/dispatcher$/);
      expect(task.cron).toBe(cron);
    },
  );

  it("son 4 dispatchers y cubren 12 jobs", () => {
    expect(DISPATCHERS).toHaveLength(4);
    expect(ALL_DISPATCHED_JOBS).toHaveLength(12);
  });
});

describe("dispatchers: presupuesto de schedules", () => {
  it(`el repo declara ${FREE_TIER_MAX_SCHEDULES} schedules o menos`, () => {
    const dir = join(process.cwd(), "src", "trigger");
    const declared: Array<{ file: string; cron: string }> = [];

    for (const file of readdirSync(dir).filter((f) => f.endsWith(".trigger.ts"))) {
      const source = readFileSync(join(dir, file), "utf8");
      // Solo claves `cron:` reales: los comentarios "Cron original:" no cuentan.
      for (const match of source.matchAll(/^\s*cron: "([^"]+)"/gm)) {
        declared.push({ file, cron: match[1] });
      }
    }

    expect(
      declared.length,
      `schedules declarados: ${declared.map((d) => `${d.file}=${d.cron}`).join(", ")}`,
    ).toBeLessThanOrEqual(FREE_TIER_MAX_SCHEDULES);

    // Guarda contra un escaneo que no encuentra nada y pasa por debajo del
    // presupuesto sin haber comprobado nada: los 5 jobs de alta frecuencia
    // siguen con cron propio y son el suelo real del repo.
    expect(declared.filter((d) => !d.file.startsWith("cron-dispatchers")).map((d) => d.cron).sort()).toEqual([
      "*/15 * * * *",
      "*/15 * * * *",
      "*/5 * * * *",
      "0 * * * *",
      "0 6 * * 0",
    ]);
  });
});

describe("dispatchers: cobertura", () => {
  it("cada job tiene dueño y el dueño es el dispatcher que lo encola", () => {
    for (const [task, , jobs] of DISPATCHERS) {
      for (const entry of jobs) {
        expect(DISPATCH_OWNER[entry.id], `${entry.id} sin dueño`).toBe(task.id as DispatcherName);
      }
    }
  });

  it("el registro de dueños coincide con los planes, sin sobras ni faltantes", () => {
    expect(Object.keys(DISPATCH_OWNER).sort()).toEqual(ALL_DISPATCHED_JOBS.map((j) => j.id).sort());
  });

  it("ningún job se encola desde dos dispatchers", () => {
    const ids = ALL_DISPATCHED_JOBS.map((job) => job.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("cada job conserva documentado su cron anterior", () => {
    for (const entry of ALL_DISPATCHED_JOBS) {
      expect(entry.legacyCron, `${entry.id} sin cron legacy`).toMatch(/^[\d*/, ]+$/);
    }
  });
});

describe("dispatchers: run", () => {
  it("el dispatcher de operaciones encola sus 4 jobs con el timestamp del cron", async () => {
    const result = await (dailyOperationsDispatcher as unknown as ScheduleConfig).run({
      timestamp: TIMESTAMP,
    });

    expect(result).toEqual({
      dispatcher: "daily-operations-dispatcher",
      total: 4,
      dispatched: 4,
      failed: 0,
    });
    for (const mock of [hoisted.integrationSync, hoisted.notifications, hoisted.cleanup, hoisted.monitors]) {
      expect(mock).toHaveBeenCalledWith({ timestamp: TIMESTAMP });
    }
  });

  it("separa los jobs con esperas reales de Trigger.dev", async () => {
    await (sixHourlyDispatcher as unknown as ScheduleConfig).run({ timestamp: TIMESTAMP });

    expect(hoisted.waitFor).toHaveBeenCalledTimes(SIX_HOURLY_JOBS.length - 1);
    expect(hoisted.waitFor).toHaveBeenCalledWith({ seconds: DISPATCH_STAGGER_MS / 1000 });
  });

  it("un job caído no impide encolar el resto del grupo", async () => {
    hoisted.cleanup.mockRejectedValueOnce(new Error("pool de conexiones agotado"));

    const result = await (dailyOperationsDispatcher as unknown as ScheduleConfig).run({
      timestamp: TIMESTAMP,
    });

    expect(result).toEqual({
      dispatcher: "daily-operations-dispatcher",
      total: 4,
      dispatched: 3,
      failed: 1,
    });
    expect(hoisted.monitors).toHaveBeenCalledTimes(1);
  });

  it("el dispatcher semanal lleva los 3 jobs de lunes", async () => {
    const result = await (weeklyMondayDispatcher as unknown as ScheduleConfig).run({
      timestamp: TIMESTAMP,
    });

    expect(result.dispatched).toBe(3);
    expect(hoisted.pentest).toHaveBeenCalledTimes(1);
    expect(hoisted.forecast).toHaveBeenCalledTimes(1);
    expect(hoisted.digest).toHaveBeenCalledTimes(1);
  });
});
