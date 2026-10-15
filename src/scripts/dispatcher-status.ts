#!/usr/bin/env node
/**
 * SCAUDIT — Estado real del cron que ejecuta la retención (P2-14).
 *
 * POR QUÉ EXISTE: los índices y el DELETE de retención no sirven de nada si
 * nadie los ejecuta. La auditoría (§7.2) dio por hecho que la última ejecución
 * exitosa de `daily-operations-dispatcher` fue a más tardar el 2026-10-03, y
 * ningún gate del repo mira el scheduler: se descubre consultando la API. Este
 * script lo hace con la MISMA credencial que ya usa el proyecto
 * (`TRIGGER_SECRET_KEY` en `.env.local`), sin abrir el dashboard.
 *
 * MIRA LOS DOS CAMINOS POSIBLES, no uno: la retención (`cleanup-old-logs`) corre
 * o bien colgada del dispatcher consolidado (`0 3 * * *`) o bien con su cron
 * propio (`0 0 * * *`), que es como estaba ANTES de la consolidación de
 * schedules. Cuál existe de verdad depende de qué versión esté desplegada, y
 * afirmarlo sin mirar es exactamente el error que este script evita.
 *
 * LÍMITE DE LA CREDENCIAL: una key `tr_dev_*` sólo ve el entorno DEVELOPMENT. Si
 * la key es de desarrollo el script lo dice y NO declara nada sobre producción
 * (exit 2), en lugar de imprimir «todo bien» con datos de otro entorno.
 *
 * La decisión vive en `dispatcher-report.ts` (pura, testeable sin red); aquí
 * sólo está la E/S: llamar a la API y pintar el resultado.
 *
 * CREDENCIAL: usa `TRIGGER_SECRET_KEY` (la de siempre, la de despliegue). Si en
 * `.env.local` está la de desarrollo y hace falta mirar producción, se puede
 * añadir `TRIGGER_STATUS_SECRET_KEY` con la de producción: este script la
 * promueve a `TRIGGER_SECRET_KEY` antes de consultar, así NO hay que
 * intercambiar la clave de despliegue ni borrarla. `.env.local` está en
 * `.gitignore`, así que la clave no puede acabar en un commit.
 *
 * Uso:
 *   npx tsx --env-file=.env.local src/scripts/dispatcher-status.ts
 *   npx tsx --env-file=.env.local src/scripts/dispatcher-status.ts --raw
 *   npx tsx --env-file=.env.local src/scripts/dispatcher-status.ts --stale-hours 48
 *
 * Exit codes: 0 ok · 1 el cron está roto o estancado · 2 no verificable.
 */

import { schedules, runs } from "@trigger.dev/sdk";
import {
  DISPATCHER_TASK,
  RETENTION_TASK,
  cronOf,
  environmentsOf,
  evaluateDispatcher,
  keyKindOf,
  pageData,
  type RunShape,
  type ScheduleShape,
} from "./dispatcher-report";

const AS_RAW = process.argv.includes("--raw");
const staleIdx = process.argv.indexOf("--stale-hours");
const STALE_HOURS = staleIdx !== -1 ? Number(process.argv[staleIdx + 1]) : 48;
const RUN_WINDOW = 10;

function fmt(date: Date | string | undefined | null): string {
  if (!date) return "—";
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return String(date);
  return `${d.toISOString()} (hace ${((Date.now() - d.getTime()) / 36e5).toFixed(1)} h)`;
}

function describeSchedule(s: ScheduleShape): string {
  return (
    `${s.id} · ${s.task} · tipo ${s.type ?? s.generator?.type ?? "?"} · cron ${cronOf(s)} · ` +
    `${s.active !== false ? "ACTIVO" : "INACTIVO"} · próxima ${fmt(s.nextRun)}`
  );
}

async function main(): Promise<number> {
  // La clave de estado (si existe) gana antes de la primera llamada: el cliente
  // del SDK lee la credencial de `process.env` en cada petición, así que esta
  // promoción basta para apuntar el chequeo a producción sin tocar la clave de
  // despliegue.
  const override = process.env.TRIGGER_STATUS_SECRET_KEY?.trim();
  if (override) process.env.TRIGGER_SECRET_KEY = override;

  const keyKind = keyKindOf(process.env.TRIGGER_SECRET_KEY);
  const keySource = override ? "TRIGGER_STATUS_SECRET_KEY" : "TRIGGER_SECRET_KEY";

  const schedulesPage = await schedules.list({ perPage: 100 });
  const [dispatcherPage, retentionPage] = await Promise.all([
    runs.list({ taskIdentifier: DISPATCHER_TASK, limit: RUN_WINDOW }),
    runs.list({ taskIdentifier: RETENTION_TASK, limit: RUN_WINDOW }),
  ]);

  const all = pageData<ScheduleShape>(schedulesPage);
  const dispatcherRuns = pageData<RunShape>(dispatcherPage);
  const retentionRuns = pageData<RunShape>(retentionPage);
  if (AS_RAW) {
    console.log(
      JSON.stringify({ keyKind, keySource, schedules: all, dispatcherRuns, retentionRuns }, null, 2)
    );
    return 0;
  }

  const report = evaluateDispatcher({
    schedules: all,
    dispatcherRuns,
    retentionRuns,
    keyKind,
    staleHours: STALE_HOURS,
  });

  const mine = all.filter((s) => s.task === DISPATCHER_TASK || s.task === RETENTION_TASK);
  const others = all.filter((s) => s.task !== DISPATCHER_TASK && s.task !== RETENTION_TASK);
  console.log(
    `🔑 Credencial: ${keyKind} (${keySource}) · 🕒 dispatcher: ${DISPATCHER_TASK} · retención: ${RETENTION_TASK}`
  );
  console.log(
    `   schedules en el proyecto: ${all.length} · entornos visibles: ${environmentsOf(all).join(", ") || "—"}`
  );
  console.log(`   · del dispatcher: ${all.filter((s) => s.task === DISPATCHER_TASK).length}`);
  console.log(`   · de la retención: ${all.filter((s) => s.task === RETENTION_TASK).length}`);
  if (others.length > 0) {
    console.log(`   · otros (${others.length}): ${others.map((s) => s.task).join(", ")}`);
  }
  for (const s of mine) console.log(`     - ${describeSchedule(s)}`);

  const runsTask = dispatcherRuns.length > 0 ? DISPATCHER_TASK : RETENTION_TASK;
  const runsList = dispatcherRuns.length > 0 ? dispatcherRuns : retentionRuns;
  if (runsList.length > 0) {
    console.log(
      `\n   últimas ejecuciones de ${runsTask}: ${runsList.length} · última ${runsList[0]?.status} · ${fmt(
        runsList[0]?.createdAt
      )}`
    );
  }

  for (const note of report.notes) console.log(`\n   ℹ️  ${note}`);

  console.log();
  if (report.verdict === "problem") {
    console.log("❌ Cron con problemas:");
    for (const p of report.problems) console.log(`   - ${p}`);
    console.log(
      `\n   Mientras no corra, el DELETE de retención de \`cleanup.trigger.ts\` no se ejecuta.`
    );
  } else if (report.verdict === "blocked") {
    console.log("🟡 No verificable en producción (esto NO es un aprobado):");
    for (const b of report.blocked) console.log(`   - ${b}`);
    console.log(
      `\n   Camino de retención detectado en los entornos visibles: ${report.path ?? "ninguno"}.`
    );
    console.log(
      "   Para cerrar P2-14 hace falta una clave de PRODUCCIÓN (tr_prod_*) o mirar el dashboard."
    );
  } else {
    console.log(
      `✅ Cron sano: ${report.path} activo y con última ejecución correcta dentro de la ventana.`
    );
  }
  return report.exitCode;
}

// IIFE: tsx compila este archivo como CJS (package.json sin "type": "module"),
// donde el top-level await no es válido.
void (async () => {
  try {
    process.exit(await main());
  } catch (error) {
    console.error(`❌ No se pudo verificar (exit 2): ${(error as Error).message}`);
    process.exit(2);
  }
})();
