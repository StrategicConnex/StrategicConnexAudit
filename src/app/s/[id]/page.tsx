import { notFound } from "next/navigation";
import Link from "next/link";
import { directDb } from "@/shared/db";
import { projects, uptimeLogs } from "@/shared/db/schemas";
import { and, desc, eq, gte, isNull } from "drizzle-orm";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Estado del servicio",
  description: "Disponibilidad pública de un sitio monitoreado.",
};

function pct(up: number, total: number): string {
  if (total === 0) return "—";
  return `${(Math.round((up / total) * 1000) / 10).toFixed(1)}%`;
}

/** Ventana de 30 días calculada fuera del render (regla no-impure-render). */
function thirtyDaysAgo(): Date {
  return new Date(Date.now() - 30 * 86400000);
}

/**
 * GET /s/[id] — Status page pública por UUID de proyecto (B-2).
 *
 * Sin sesión a propósito: el UUID no es adivinable. Solo expone
 * disponibilidad agregada (nunca PII, keywords ni hallazgos).
 */
export default async function StatusPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();

  const [project] = await directDb
    .select({ id: projects.id, name: projects.name, domain: projects.domain })
    .from(projects)
    .where(
      and(
        eq(projects.id, id),
        isNull(projects.deletedAt),
        eq(projects.isDeleted, false),
        eq(projects.isHidden, false)
      )
    )
    .limit(1);

  if (!project) notFound();

  const since = thirtyDaysAgo();
  const logs = await directDb
    .select({
      isUp: uptimeLogs.isUp,
      checkedAt: uptimeLogs.checkedAt,
      responseTimeMs: uptimeLogs.responseTimeMs,
    })
    .from(uptimeLogs)
    .where(and(eq(uptimeLogs.projectId, id), gte(uptimeLogs.checkedAt, since)))
    .orderBy(desc(uptimeLogs.checkedAt))
    .limit(2000);

  const total = logs.length;
  const ups = logs.filter((l) => l.isUp).length;
  const current = logs[0]?.isUp ?? null;
  const latencies = logs.map((l) => l.responseTimeMs).filter((v): v is number => v !== null);
  const avgLatency = latencies.length > 0
    ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length)
    : null;

  // Incidentes = rachas de caídas (inicio = primer check down tras uno up).
  const incidents: Array<{ at: string }> = [];
  for (let i = logs.length - 1; i >= 0; i--) {
    const cur = logs[i]!;
    const prev = logs[i + 1];
    if (!cur.isUp && (!prev || prev.isUp)) {
      incidents.push({ at: cur.checkedAt?.toISOString() ?? "—" });
    }
  }

  return (
    <div className="min-h-dvh w-full bg-background text-foreground">
      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-16 space-y-8">
        <div className="text-center space-y-2">
          <p className="text-2xs font-extrabold uppercase tracking-widest text-muted-fg">
            Estado del servicio
          </p>
          <h1 className="font-display text-3xl font-black tracking-tight">{project.name}</h1>
          <p className="text-sm text-muted-fg font-mono">{project.domain}</p>
          <p
            className={`inline-flex items-center gap-2 px-4 py-1.5 rounded-full border text-sm font-bold mt-2 ${
              current === null
                ? "border-border text-muted-fg"
                : current
                  ? "border-chartreuse/30 bg-chartreuse/10 text-chartreuse"
                  : "border-destructive/30 bg-destructive/10 text-destructive"
            }`}
          >
            <span className="w-2 h-2 rounded-full bg-current" aria-hidden="true" />
            {current === null ? "Sin datos todavía" : current ? "Operativo" : "Incidencia en curso"}
          </p>
        </div>

        <div className="grid grid-cols-3 gap-4 text-center">
          <div className="glass-card p-5">
            <p className="text-2xl font-black">{pct(ups, total)}</p>
            <p className="text-2xs text-muted-fg uppercase tracking-widest mt-1">Uptime 30d</p>
          </div>
          <div className="glass-card p-5">
            <p className="text-2xl font-black">{avgLatency !== null ? `${avgLatency}ms` : "—"}</p>
            <p className="text-2xs text-muted-fg uppercase tracking-widest mt-1">Latencia media</p>
          </div>
          <div className="glass-card p-5">
            <p className="text-2xl font-black">{incidents.length}</p>
            <p className="text-2xs text-muted-fg uppercase tracking-widest mt-1">Incidencias</p>
          </div>
        </div>

        <div className="glass-card p-6">
          <h2 className="text-sm font-extrabold uppercase tracking-widest text-muted-fg mb-3">
            Últimas incidencias
          </h2>
          {incidents.length === 0 ? (
            <p className="text-sm text-muted-fg">Sin incidencias en los últimos 30 días.</p>
          ) : (
            <ul className="space-y-2">
              {incidents.slice(0, 10).map((inc) => (
                <li key={inc.at} className="flex items-center gap-2 text-sm">
                  <span className="w-2 h-2 rounded-full bg-destructive shrink-0" aria-hidden="true" />
                  <span className="font-mono text-xs">
                    {inc.at === "—" ? "Fecha desconocida" : new Date(inc.at).toLocaleString()}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <p className="text-center text-2xs text-muted-fg">
          Monitoreado por <span className="font-bold">StrategicAudit Pro</span> ·{" "}
          <Link href="/" className="text-primary hover:underline">
            Inicio
          </Link>
        </p>
      </div>
    </div>
  );
}
