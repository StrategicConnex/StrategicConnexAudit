import { notFound } from "next/navigation";
import Link from "next/link";
import { directDb } from "@/shared/db";
import { projects, uptimeLogs, audits, issues, aiReportJobs } from "@/shared/db/schemas";
import { and, count, desc, eq, gte, sql } from "drizzle-orm";
import { verifyPortalToken } from "@/server/lib/portal-tokens";

export const dynamic = "force-dynamic";

interface Branding {
  brandName?: string;
  logoUrl?: string | null;
  primaryColor?: string | null;
}

/** Ventana de 30 días calculada fuera del render (regla no-impure-render). */
function thirtyDaysAgo(): Date {
  return new Date(Date.now() - 30 * 86400000);
}

/**
 * GET /p/[token] — Portal cliente read-only con marca blanca (B-4).
 *
 * Sin sesión: el token firmado ES la autorización (expira). Solo expone
 * KPIs agregados y lista de informes (sin contenido completo ni PII).
 */
export default async function ClientPortalPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const payload = verifyPortalToken(token);
  if (!payload) notFound();

  const [project] = await directDb
    .select({
      id: projects.id,
      name: projects.name,
      domain: projects.domain,
      settings: projects.settings,
    })
    .from(projects)
    .where(
      and(
        eq(projects.id, payload.projectId),
        eq(projects.isDeleted, false),
        eq(projects.isHidden, false)
      )
    )
    .limit(1);

  if (!project) notFound();

  const branding = ((project.settings ?? {}) as { branding?: Branding }).branding ?? {};
  const brandName = branding.brandName || project.name;
  const accent = branding.primaryColor || "#D4A843";

  const since = thirtyDaysAgo();
  const [up] = await directDb
    .select({ total: count(), ups: sql<number>`count(*) filter (where ${uptimeLogs.isUp})` })
    .from(uptimeLogs)
    .where(and(eq(uptimeLogs.projectId, project.id), gte(uptimeLogs.checkedAt, since)));
  const total = Number(up?.total ?? 0);
  const ups = Number(up?.ups ?? 0);
  const uptimePct = total > 0 ? `${(Math.round((ups / total) * 1000) / 10).toFixed(1)}%` : "—";

  const [latest] = await directDb
    .select({ id: audits.id })
    .from(audits)
    .where(and(eq(audits.projectId, project.id), eq(audits.status, "completed")))
    .orderBy(desc(audits.createdAt))
    .limit(1);

  let score: number | null = null;
  if (latest) {
    const [stats] = await directDb
      .select({
        criticalCount: count(sql`case when ${issues.severity} = 'critical' then 1 end`),
        warningCount: count(sql`case when ${issues.severity} = 'warning' then 1 end`),
      })
      .from(issues)
      .where(eq(issues.auditId, latest.id));
    score = Math.max(
      0,
      100 - Number(stats?.criticalCount || 0) * 15 - Number(stats?.warningCount || 0) * 5
    );
  }

  const reports = await directDb.query.aiReportJobs.findMany({
    where: eq(aiReportJobs.projectId, project.id),
    orderBy: [desc(aiReportJobs.createdAt)],
    limit: 5,
    columns: { id: true, createdAt: true, isFallback: true },
  });

  return (
    <div className="min-h-dvh w-full bg-background text-foreground">
      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-16 space-y-8">
        <div className="text-center space-y-2">
          {branding.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={branding.logoUrl} alt={brandName} className="h-10 mx-auto object-contain" />
          ) : null}
          <p className="text-2xs font-extrabold uppercase tracking-widest text-muted-fg">
            Reporte para clientes
          </p>
          <h1 className="font-display text-3xl font-black tracking-tight">{brandName}</h1>
          <p className="text-sm text-muted-fg font-mono">{project.domain}</p>
        </div>

        <div className="grid grid-cols-2 gap-4 text-center">
          <div className="glass-card p-6">
            <p className="text-3xl font-black">{uptimePct}</p>
            <p className="text-2xs text-muted-fg uppercase tracking-widest mt-1">Uptime 30d</p>
          </div>
          <div className="glass-card p-6">
            <p className="text-3xl font-black" style={{ color: accent }}>
              {score !== null ? `${score}/100` : "—"}
            </p>
            <p className="text-2xs text-muted-fg uppercase tracking-widest mt-1">Salud SEO</p>
          </div>
        </div>

        <div className="glass-card p-6">
          <h2 className="text-sm font-extrabold uppercase tracking-widest text-muted-fg mb-3">
            Últimos informes
          </h2>
          {reports.length === 0 ? (
            <p className="text-sm text-muted-fg">Aún no hay informes publicados.</p>
          ) : (
            <ul className="space-y-2">
              {reports.map((r) => (
                <li key={r.id} className="flex items-center justify-between text-sm">
                  <span>
                    Informe del{" "}
                    {r.createdAt ? new Date(r.createdAt).toLocaleDateString() : "—"}
                  </span>
                  {r.isFallback && (
                    <span className="text-2xs text-muted-fg">resumen automático</span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>

        <p className="text-center text-2xs text-muted-fg">
          Generado por <span className="font-bold">StrategicAudit Pro</span>
        </p>
        <p className="text-center">
          <Link href="/" className="text-sm text-primary hover:underline">
            Inicio
          </Link>
        </p>
      </div>
    </div>
  );
}
